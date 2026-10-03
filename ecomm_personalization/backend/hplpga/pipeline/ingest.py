"""Stage 1 - Data understanding & preprocessing.

* Loads the 6.6M-row GA4-style activity log (pyarrow, multi-threaded) and the transaction lines.
* Cleans: exact-duplicate removal, null normalisation, channel grouping, geo hierarchy,
  time features, bot filtering.
* Resolves per-row demographic noise into one profile per visitor (majority vote).
* Extracts item ids from `view_item` / `add_to_cart` page paths. `page_view` product paths
  use a disjoint synthetic id range (ITEM377-500) that never occurs in transactions and are
  therefore treated as page-level signals only.
* Sessionises events with the GA4 30-minute inactivity rule and labels each session with an
  engagement type.
* Joins purchase events to transaction line items through `transaction_id`.
"""
from __future__ import annotations

import json
import re
import logging
import time

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.csv as pacsv

from .. import config as C
from .. import taxonomy as T

log = logging.getLogger(__name__)

STRING_NULLS = ["", "(not set)", "Data Not Available", "(none)_placeholder"]


def _read_activity() -> pd.DataFrame:
    opts = pacsv.ConvertOptions(
        column_types={"user_pseudo_id": pa.string(), "transaction_id": pa.string()},
        strings_can_be_null=True,
    )
    tbl = pacsv.read_csv(C.ACTIVITY_CSV, convert_options=opts)
    return tbl.to_pandas(strings_to_categorical=True)


def _read_transactions() -> pd.DataFrame:
    tx = pd.read_csv(C.TRANSACTIONS_CSV, dtype={"Transaction_ID": str, "ItemID": str})
    tx = tx.rename(columns={
        "Date": "date", "Transaction_ID": "transaction_id", "Item_purchase_quantity": "qty",
        "Item_revenue": "revenue", "ItemName": "item_id", "ItemBrand": "brand",
        "ItemCategory": "source_category", "ItemID": "sku",
    })
    tx["date"] = pd.to_datetime(tx["date"])
    return tx


def _cat_apply(s: pd.Series, f) -> pd.Series:
    """Apply f to each *category level* (not each row) and broadcast via codes."""
    cats = list(s.cat.categories)
    mapped = np.array([f(c) for c in cats] + [f(None)], dtype=object)
    return pd.Series(pd.Categorical(mapped[s.cat.codes.to_numpy()]), index=s.index)


def _pair_apply(a: pd.Series, b: pd.Series, f) -> tuple[pd.Series, pd.DataFrame]:
    """Apply f(a, b) once per unique pair of two categoricals and broadcast."""
    ca, cb = a.cat.codes.to_numpy().astype(np.int64), b.cat.codes.to_numpy().astype(np.int64)
    key = (ca + 1) * (len(b.cat.categories) + 2) + (cb + 1)
    uniq, inv, cnt = np.unique(key, return_inverse=True, return_counts=True)
    la, lb = list(a.cat.categories), list(b.cat.categories)
    ua, ub = uniq // (len(lb) + 2) - 1, uniq % (len(lb) + 2) - 1
    va = [la[i] if i >= 0 else None for i in ua]
    vb = [lb[i] if i >= 0 else None for i in ub]
    out = np.array([f(x, y) for x, y in zip(va, vb)], dtype=object)
    pairs = pd.DataFrame({"a": va, "b": vb, "out": out, "n": cnt})
    return pd.Series(pd.Categorical(out[inv]), index=a.index), pairs


def _mode_per_user(df: pd.DataFrame, col: str) -> pd.Series:
    """Majority vote of a noisy categorical per user (ties -> most frequent globally)."""
    sub = df[["uid", col]].dropna()
    counts = sub.groupby(["uid", col], observed=True).size().rename("n").reset_index()
    glob = sub[col].value_counts()
    counts["g"] = counts[col].map(glob).astype(float)
    counts = counts.sort_values(["uid", "n", "g"], ascending=[True, False, False])
    return counts.drop_duplicates("uid").set_index("uid")[col].astype(str)


def run() -> dict:
    C.ensure_dirs()
    t0 = time.time()
    dq: dict = {}

    # ---------------------------------------------------------------- load
    raw = _read_activity()
    dq["raw_rows"] = int(len(raw))
    dq["raw_users"] = int(raw["user_pseudo_id"].nunique())
    log.info("loaded activity %s rows in %.1fs", len(raw), time.time() - t0)

    before = len(raw)
    raw = raw.drop_duplicates()
    dq["exact_duplicates_removed"] = int(before - len(raw))

    df = pd.DataFrame({
        "uid": raw["user_pseudo_id"].cat.codes.astype(np.int32),
        "event": raw["event_name"],
        "ts": raw["eventTimestamp"],
    })
    user_key = pd.Series(raw["user_pseudo_id"].cat.categories, name="user_pseudo_id")

    # ---------------------------------------------------------------- normalise
    for c in ["category", "city", "region", "country", "source", "medium", "gender", "Age", "income_group", "page_type"]:
        s = raw[c]
        if isinstance(s.dtype, pd.CategoricalDtype):
            bad = [x for x in s.cat.categories if str(x).strip() in STRING_NULLS]
            if bad:
                s = s.cat.remove_categories(bad)
        raw[c] = s

    df["device"] = _cat_apply(raw["category"], lambda x: "desktop" if x in (None, "smart tv") else x)
    df["country"] = _cat_apply(raw["country"], lambda x: x or "Unknown")
    df["region"] = _cat_apply(raw["region"], lambda x: x or "Unknown")
    df["city"] = raw["city"]
    df["page_type"] = _cat_apply(raw["page_type"], T.landing_type)
    df["source"] = _cat_apply(raw["source"], lambda x: x or "")
    df["medium"] = _cat_apply(raw["medium"], lambda x: x or "")

    # channel grouping on the (small) set of unique source/medium pairs
    df["channel"], pairs = _pair_apply(df["source"], df["medium"], T.channel_group)
    dq["channel_mapping"] = pairs.rename(columns={"a": "source", "b": "medium", "out": "channel"}) \
        .sort_values("n", ascending=False).head(40).to_dict("records")

    # geo hierarchy: geo = US state | country ; macro = US census region | Canada | International
    df["geo"], _ = _pair_apply(df["country"], df["region"], lambda c, r: r if c == "United States" else c)
    df["macro"], _ = _pair_apply(df["country"], df["region"], T.macro_region)

    # items: only view_item / add_to_cart paths belong to the transactional item namespace
    item = _cat_apply(raw["page_path"], lambda p: (re.search(r"/products/(ITEM\d+)", p or "") or [None, None])[1])
    df["item_id"] = item.where(df["event"].isin(["view_item", "add_to_cart"]))
    dq["page_view_product_paths_ignored"] = int(((raw["event_name"] == "page_view") & (raw["page_type"] == "products")).sum())

    df["transaction_id"] = raw["transaction_id"].astype(object).where(df["event"] == "purchase")
    df["revenue"] = raw["purchase_revenue"].astype("float32")

    # ---------------------------------------------------------------- demographics
    demo_src = pd.DataFrame({"uid": df["uid"], "gender": raw["gender"], "age": raw["Age"], "income": raw["income_group"]})
    g = demo_src.groupby("uid", observed=True)
    dq["demographic_noise"] = {
        "users_with_conflicting_gender_pct": round(float((g["gender"].nunique() > 1).mean() * 100), 1),
        "users_with_conflicting_age_pct": round(float((g["age"].nunique() > 1).mean() * 100), 1),
        "note": "Demographic columns vary row-to-row for the same visitor; resolved by per-visitor majority vote.",
    }
    demo = pd.DataFrame({
        "gender": _mode_per_user(demo_src, "gender"),
        "age": _mode_per_user(demo_src, "age"),
        "income": _mode_per_user(demo_src, "income"),
    })
    del demo_src, raw
    log.info("normalised + demographics in %.1fs", time.time() - t0)

    # ---------------------------------------------------------------- sessionise
    df = df.sort_values(["uid", "ts"], kind="stable").reset_index(drop=True)
    gap = df["ts"].diff().dt.total_seconds().to_numpy()
    new_user = np.r_[True, df["uid"].to_numpy()[1:] != df["uid"].to_numpy()[:-1]]
    new_sess = new_user | (np.nan_to_num(gap, nan=1e9) > C.SESSION_GAP_MIN * 60)
    df["sid"] = np.cumsum(new_sess).astype(np.int32) - 1

    # ---------------------------------------------------------------- bots
    ev_per_user = df.groupby("uid").size()
    ev_per_sess = df.groupby("sid").size()
    bot_users = set(ev_per_user[ev_per_user > C.BOT_MAX_EVENTS].index)
    bot_users |= set(df.loc[df["sid"].isin(ev_per_sess[ev_per_sess > C.BOT_MAX_EVENTS_PER_SESSION].index), "uid"].unique())
    dq["bot_users_removed"] = len(bot_users)
    dq["bot_events_removed"] = int(df["uid"].isin(bot_users).sum())
    df = df[~df["uid"].isin(bot_users)].reset_index(drop=True)

    df["hour"] = df["ts"].dt.hour.astype(np.int8)
    df["dow"] = df["ts"].dt.dayofweek.astype(np.int8)

    # ---------------------------------------------------------------- sessions
    is_ = {e: (df["event"] == e) for e in ["page_view", "view_item", "add_to_cart", "purchase", "session_start"]}
    agg = df.assign(**{f"n_{k}": v.astype(np.int16) for k, v in is_.items()}).groupby("sid").agg(
        uid=("uid", "first"), start=("ts", "first"), end=("ts", "last"), n_events=("event", "size"),
        n_page_view=("n_page_view", "sum"), n_view_item=("n_view_item", "sum"),
        n_add_to_cart=("n_add_to_cart", "sum"), n_purchase=("n_purchase", "sum"),
        device=("device", "first"), channel=("channel", "first"), source=("source", "first"),
        medium=("medium", "first"), country=("country", "first"), region=("region", "first"),
        geo=("geo", "first"), macro=("macro", "first"), landing=("page_type", "first"),
        hour=("hour", "first"), dow=("dow", "first"), revenue=("revenue", "sum"),
        n_items=("item_id", "nunique"),
    )
    agg["duration_s"] = (agg["end"] - agg["start"]).dt.total_seconds().astype("float32")
    agg["engagement"] = np.select(
        [agg["n_purchase"] > 0, agg["n_add_to_cart"] > 0, agg["n_view_item"] > 0, agg["n_events"] <= 2],
        ["converter", "cart_abandoner", "product_explorer", "bouncer"],
        default="browser",
    )
    agg["session_idx"] = agg.groupby("uid").cumcount().astype(np.int16)
    sessions = agg.reset_index()
    dq["sessions"] = int(len(sessions))
    dq["session_start_events"] = int(is_["session_start"].sum())
    dq["session_engagement_mix"] = sessions["engagement"].value_counts(normalize=True).round(4).to_dict()

    # ---------------------------------------------------------------- transactions join
    tx = _read_transactions()
    dq["tx_lines"] = int(len(tx))
    dq["tx_unique_transactions"] = int(tx["transaction_id"].nunique())
    tx["unit_price"] = (tx["revenue"] / tx["qty"].clip(lower=1)).astype("float32")
    purch = df.loc[df["event"] == "purchase", ["uid", "sid", "ts", "transaction_id", "revenue"]]
    purch = purch.drop_duplicates("transaction_id")
    joined = tx.merge(purch.rename(columns={"revenue": "order_revenue"}), on="transaction_id", how="left")
    dq["tx_join"] = {
        "purchase_events": int((df["event"] == "purchase").sum()),
        "unique_purchase_transactions": int(len(purch)),
        "transactions_matched": int(joined.dropna(subset=["uid"])["transaction_id"].nunique()),
        "match_rate_pct": round(100 * joined.dropna(subset=["uid"])["transaction_id"].nunique() / max(len(purch), 1), 2),
        "tx_lines_without_activity": int(joined["uid"].isna().sum()),
    }
    # reconcile: purchase_revenue on the event vs sum of line revenue
    rec = joined.dropna(subset=["uid"]).groupby("transaction_id").agg(lines=("revenue", "sum"), order=("order_revenue", "first"))
    dq["tx_join"]["revenue_reconciliation_within_1pct"] = round(float((abs(rec["lines"] - rec["order"]) <= 0.01 * rec["order"].abs() + 0.01).mean() * 100), 2)

    # ---------------------------------------------------------------- interactions
    inter = df.loc[df["item_id"].notna(), ["uid", "sid", "ts", "event", "item_id"]].copy()
    buys = joined.dropna(subset=["uid"])[["uid", "sid", "ts", "item_id"]].assign(event="purchase")
    buys["uid"] = buys["uid"].astype(np.int32)
    buys["sid"] = buys["sid"].astype(np.int32)
    inter["item_id"] = inter["item_id"].astype(str)
    inter["event"] = inter["event"].astype(str)
    inter = pd.concat([inter, buys], ignore_index=True)
    inter["weight"] = inter["event"].map(C.EVENT_WEIGHTS).astype("float32")
    dq["interactions"] = inter["event"].value_counts().to_dict()

    # ---------------------------------------------------------------- users
    first = sessions.sort_values(["uid", "start"]).drop_duplicates("uid").set_index("uid")
    ucounts = sessions.groupby("uid").agg(
        n_sessions=("sid", "size"), n_events=("n_events", "sum"), n_view_item=("n_view_item", "sum"),
        n_add_to_cart=("n_add_to_cart", "sum"), n_purchase=("n_purchase", "sum"), revenue=("revenue", "sum"),
        last_seen=("end", "max"), total_duration_s=("duration_s", "sum"),
    )
    users = first[["start", "device", "channel", "source", "medium", "country", "region", "geo", "macro", "landing", "hour", "dow"]].rename(
        columns={"start": "first_seen"}).join(ucounts).join(demo)
    users["n_items"] = inter.groupby("uid")["item_id"].nunique().reindex(users.index).fillna(0).astype(np.int16)
    users["active_days"] = ((users["last_seen"] - users["first_seen"]).dt.total_seconds() / 86400).astype("float32")
    users["segment"] = np.select(
        [users["n_purchase"] >= 2, users["n_purchase"] == 1,
         users["n_add_to_cart"] > 0, (users["n_view_item"] >= 5) | ((users["n_sessions"] >= 3) & (users["n_view_item"] > 0)),
         users["n_view_item"] > 0, (users["n_sessions"] == 1) & (users["n_events"] <= 2)],
        ["repeat_purchaser", "one_time_purchaser", "cart_abandoner", "frequent_viewer", "window_shopper", "bouncer"],
        default="casual_browser",
    )
    users = users.reset_index()
    users["user_pseudo_id"] = user_key.reindex(users["uid"].values).values
    dq["users_clean"] = int(len(users))
    dq["segment_mix"] = users["segment"].value_counts().to_dict()

    # ---------------------------------------------------------------- persist
    events_out = df.drop(columns=["transaction_id"])
    events_out.to_parquet(C.PROCESSED_DIR / "events.parquet", index=False)
    sessions.to_parquet(C.PROCESSED_DIR / "sessions.parquet", index=False)
    users.to_parquet(C.PROCESSED_DIR / "users.parquet", index=False)
    inter.to_parquet(C.PROCESSED_DIR / "interactions.parquet", index=False)
    joined.to_parquet(C.PROCESSED_DIR / "transactions.parquet", index=False)

    dq["events_clean"] = int(len(df))
    dq["date_range"] = [str(df["ts"].min()), str(df["ts"].max())]
    dq["seconds"] = round(time.time() - t0, 1)
    (C.REPORTS_DIR / "data_quality.json").write_text(json.dumps(dq, indent=2, default=str), encoding="utf-8")
    log.info("ingest done in %.1fs: %s users, %s sessions", dq["seconds"], len(users), len(sessions))
    return dq
