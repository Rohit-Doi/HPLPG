"""Learning-to-rank reranker (LightGBM LambdaRank) over the hybrid blend's top-N candidates.

Two-stage retrieval + ranking, as used in production recommenders:
  1. the hybrid blend retrieves the top-N candidates per visitor (cheap, high recall);
  2. a LambdaRank model re-orders them using every signal jointly - component and chain scores,
     item features (price, popularity, cart rate, audience, department...), visitor context, and
     context x item cross features (e.g. audience match with declared gender, item department vs
     predicted department affinity).

The model is trained on the validation month (labels = items the visitor went on to interact with),
so the test month stays untouched.
"""
from __future__ import annotations

import lightgbm as lgb
import numpy as np
import pandas as pd

from .. import config as C
from . import features as F
from .recommender import Recommender, ScoreResult

N_CANDIDATES = 50
CTX_CAT = ["device", "channel", "daypart", "weekend", "landing", "macro", "geo", "gender", "age"]


def build_features(rec: Recommender, res: ScoreResult, ctx: pd.DataFrame, cand: np.ndarray, use_demo: bool) -> pd.DataFrame:
    """Rows = (visitor, candidate) pairs in candidate order; cand is (n, N)."""
    a = rec.a
    n, N = cand.shape
    rows = np.repeat(np.arange(n), N)
    cols = cand.ravel()
    feats: dict = {}
    for name, M in res.components.items():
        feats[f"c_{name}"] = np.log(np.asarray(M)[rows, cols] + 1e-9)
    for name in F.CHAINS:
        M = res.chains.get(name)
        feats[f"ch_{name}"] = np.log(M[rows, cols] + 1e-9) if M is not None else np.full(len(rows), np.nan)
    blend = res.scores[rows, cols]
    feats["blend"] = np.log(blend + 1e-9)
    feats["rank"] = np.tile(np.arange(N), n).astype(float)
    feats["blend_rel"] = blend / (res.scores[rows, cand[:, 0][rows]] + 1e-9)
    itf = a.item_feats.iloc[cols].reset_index(drop=True)
    for c in itf.columns:
        feats[f"i_{c}"] = itf[c].values          # .values keeps pandas Categorical dtype for LightGBM
    cm = ctx if use_demo else F.mask_demographics(ctx)
    cats = a.categories
    for c in CTX_CAT:
        vals = cm[c].astype(str).to_numpy()[rows]
        levels = cats.get(c, sorted(set(vals)))
        feats[f"x_{c}"] = pd.Categorical(np.where(np.isin(vals, levels), vals, levels[-1]), categories=levels)
    feats["x_hour"] = ctx["hour"].to_numpy(float)[rows]
    # cross features
    dept_idx = {d: i for i, d in enumerate(a.dept_classes)}
    item_dept = np.array([dept_idx.get(d, 0) for d in a.dept_of])[cols]
    feats["k_dept_proba"] = res.dept_proba[rows, item_dept]
    feats["k_is_top_dept"] = (res.dept_proba.argmax(1)[rows] == item_dept).astype(float)
    g = cm["gender"].astype(str).to_numpy()[rows]
    aud = np.asarray(a.audience)[cols]
    want = np.where(g == "female", "women", np.where(g == "male", "men", ""))
    feats["k_audience_match"] = np.where(want == "", 0.0, np.where(aud == want, 1.0, np.where(aud == "unisex", 0.3, -1.0)))
    feats["k_female_share_x_gender"] = np.where(g == "female", 1.0, np.where(g == "male", -1.0, 0.0)) * a.female_share[cols]
    feats["k_cart_prop"] = res.intent["cart"][rows]
    feats["k_persona_conf"] = res.persona_proba.max(1)[rows]
    return pd.DataFrame(feats)


def train(rec: Recommender, res: ScoreResult, ctx: pd.DataFrame, truth: list[set], use_demo: bool, seed: int = C.RANDOM_SEED) -> dict:
    cand = rec.top_k(res.scores, N_CANDIDATES)
    X = build_features(rec, res, ctx, cand, use_demo)
    y = np.array([1 if j in t else 0 for t, row in zip(truth, cand) for j in row], dtype=int)
    groups = np.full(len(cand), N_CANDIDATES)
    rng = np.random.default_rng(seed)
    val_users = rng.random(len(cand)) < 0.15
    tr_rows = np.repeat(~val_users, N_CANDIDATES)
    m = lgb.LGBMRanker(objective="lambdarank", n_estimators=800, learning_rate=0.03, num_leaves=63, min_child_samples=100,
                       subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=2.0, random_state=seed, verbose=-1,
                       lambdarank_truncation_level=15, label_gain=[0, 1])
    m.fit(X[tr_rows], y[tr_rows], group=groups[~val_users], eval_set=[(X[~tr_rows], y[~tr_rows])], eval_group=[groups[val_users]],
          eval_at=[10], callbacks=[lgb.early_stopping(50, verbose=False)])
    imp = sorted(zip(X.columns, m.feature_importances_), key=lambda x: -x[1])
    return {"model": m, "columns": list(X.columns), "importance": [{"feature": f, "gain": int(g)} for f, g in imp],
            "best_iteration": int(m.best_iteration_ or m.n_estimators), "train_users": int((~val_users).sum())}


def rerank(ltr: dict, rec: Recommender, res: ScoreResult, ctx: pd.DataFrame, use_demo: bool, n_candidates: int = N_CANDIDATES) -> np.ndarray:
    """Return a full (n, I) score matrix: LTR scores on the candidates, blend scores (shifted below) elsewhere."""
    cand = rec.top_k(res.scores, n_candidates)
    X = build_features(rec, res, ctx, cand, use_demo)[ltr["columns"]]
    s = ltr["model"].predict(X).reshape(cand.shape)
    out = np.log(res.scores + 1e-12).astype(np.float32)
    out -= out.max(1, keepdims=True) + 1.0                            # every non-candidate < min candidate
    out = out - 1e3
    smin = s.min()
    np.put_along_axis(out, cand, (s - smin).astype(np.float32), axis=1)
    return out
