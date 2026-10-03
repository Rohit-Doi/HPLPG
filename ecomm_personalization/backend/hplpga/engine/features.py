"""Cold-start feature schema shared by training, evaluation and serving.

Only signals that are available on the *first page view of a brand-new visitor* are used:
device, acquisition channel, geography (state -> census region), landing page type, time of day,
weekday/weekend, month, and - optionally, when declared - age group and gender.

`income_group` is deliberately NOT a model feature: in the provided data it is missing on every row of
every purchaser (99.97% of income-unknown visitors purchase vs ~0% of the rest), i.e. it is a label leak,
and a real cold-start visitor who hasn't declared income would be indistinguishable from that artifact.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .. import taxonomy as T

CAT_FEATURES = ["device", "channel", "geo", "macro", "landing", "daypart", "weekend", "age", "gender"]
NUM_FEATURES = ["hour", "dow", "month"]
KEY_FEATURES = CAT_FEATURES + ["month"]  # fields that may appear in back-off cells
DEMO_FEATURES = ["age", "gender"]
UNKNOWN = "unknown"

# Hierarchical back-off chains for context-conditional popularity (most specific -> global)
CHAINS: dict[str, list[tuple[str, ...]]] = {
    # acquisition x device x geography (most specific first)
    "geo": [("channel", "device", "geo"), ("channel", "device", "macro"), ("channel", "device"), ("channel",), ()],
    # pure location: what a state buys, regardless of how the visitor arrived
    "place": [("geo", "daypart"), ("geo",), ("macro",), ()],
    "time": [("channel", "daypart", "weekend"), ("channel", "daypart"), ("daypart",), ()],
    "landing": [("landing", "channel", "device"), ("landing", "channel"), ("landing",), ()],
    # seasonality: same calendar month in the training year
    "season": [("month", "macro"), ("month",), ()],
    # declared demographics (only active when the visitor declares them)
    "demo": [("gender", "age", "device"), ("gender", "age"), ("gender",), ()],
    "demo_geo": [("gender", "geo"), ("gender", "macro"), ("gender",), ()],
}
DEMO_CHAINS = ("demo", "demo_geo")
DEFAULT_CHAIN_WEIGHTS = {"geo": 1.0, "place": 1.0, "time": 0.6, "landing": 0.8, "season": 0.4, "demo": 1.0, "demo_geo": 1.0}


def users_to_context(users: pd.DataFrame) -> pd.DataFrame:
    """Historical users (first-touch attributes) -> context frame."""
    ctx = pd.DataFrame(index=users.index)
    ctx["device"] = users["device"].astype(str)
    ctx["channel"] = users["channel"].astype(str)
    ctx["geo"] = users["geo"].astype(str)
    ctx["macro"] = users["macro"].astype(str)
    ctx["landing"] = users["landing"].astype(str)
    ctx["hour"] = users["hour"].astype(int)
    ctx["dow"] = users["dow"].astype(int)
    ctx["month"] = pd.to_datetime(users["first_seen"]).dt.month.astype(int)
    ctx["daypart"] = ctx["hour"].map(T.daypart)
    ctx["weekend"] = np.where(ctx["dow"] >= 5, "weekend", "weekday")
    for c, src in (("age", "age"), ("gender", "gender")):
        ctx[c] = users[src].astype(str).replace({"nan": UNKNOWN, "None": UNKNOWN})
    return ctx.reset_index(drop=True)


def mask_demographics(ctx: pd.DataFrame) -> pd.DataFrame:
    out = ctx.copy()
    for c in DEMO_FEATURES:
        out[c] = UNKNOWN
    return out


def to_model_frame(ctx: pd.DataFrame, categories: dict[str, list[str]]) -> pd.DataFrame:
    """Context frame -> LightGBM-ready frame with fixed categorical levels."""
    X = pd.DataFrame(index=ctx.index)
    for c in CAT_FEATURES:
        cats = categories[c]
        vals = ctx[c].astype(str)
        vals = vals.where(vals.isin(cats), "__other__" if "__other__" in cats else UNKNOWN)
        X[c] = pd.Categorical(vals, categories=cats)
    for c in NUM_FEATURES:
        X[c] = ctx[c].astype(float)
    return X


def fit_categories(ctx: pd.DataFrame, geo_top: int = 40) -> dict[str, list[str]]:
    cats = {}
    for c in CAT_FEATURES:
        vc = ctx[c].astype(str).value_counts()
        if c == "geo":
            levels = list(vc.index[:geo_top]) + ["__other__"]
        else:
            levels = list(vc.index[vc >= 50])
            if "__other__" not in levels:
                levels.append("__other__")
        if UNKNOWN not in levels:
            levels.append(UNKNOWN)
        cats[c] = levels
    return cats


def cell_key(row: dict, fields: tuple[str, ...]) -> str:
    return "|".join(f"{f}={row[f]}" for f in fields) if fields else "*"
