"""Stage 4 - Cold-start model training.

`fit(cutoff)` trains every model the Landing Page Agent needs using ONLY data before `cutoff`:

1. **Popularity & trend** - user-share popularity (each visitor contributes one unit of mass, so heavy
   users don't dominate) and a time-decayed trend score (half-life 21 days).
2. **Context back-off priors** - P(item | context cell) for seven hierarchical chains (acquisition x
   device x geography, pure location, time, landing page, season, demographics, demographics x geo).
   Scoring uses recursive Dirichlet smoothing so sparse cells borrow strength from their parent
   (channel x device x state -> x census region -> ... -> global). Chain weights are tuned offline.
3. **kNN similar visitors** - visitors encoded as weighted one-hot context vectors; feature weights are
   the mutual information between each feature and department preference. A new visitor's items are the
   similarity-weighted item mix of their K nearest historical visitors.
4. **LightGBM classifiers** on first-touch features with a small hyper-parameter search, trained with
   50% demographic dropout so they work with or without declared demographics:
     - department affinity (6 departments), persona membership, first-session add-to-cart and purchase.
5. **Persona item distributions** P(item | persona) and **P(department | gender)**.
6. **Item-item graphs** - session co-view cosine similarity, ordered next-item transitions (Markov), and
   co-purchase lift within transactions ("frequently bought together").
7. **Item feature table** for the learning-to-rank reranker (price, popularity, cart rate, audience, ...).
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
import scipy.sparse as sp
from sklearn.metrics import accuracy_score, log_loss, mutual_info_score, roc_auc_score

from .. import config as C
from ..engine import features as F
from .catalog import coview_similarity

log = logging.getLogger(__name__)

TREND_HALF_LIFE_DAYS = 21
KNN_POOL = 150_000
MIN_CELL_USERS = 5
HP_GRID = [  # small, deliberate search; picked by validation metric
    dict(num_leaves=31, learning_rate=0.05, min_child_samples=200, colsample_bytree=0.8),
    dict(num_leaves=63, learning_rate=0.03, min_child_samples=100, colsample_bytree=0.7),
    dict(num_leaves=15, learning_rate=0.08, min_child_samples=400, colsample_bytree=0.9),
]


def load_tables() -> dict:
    P = C.PROCESSED_DIR
    return {
        "users": pd.read_parquet(P / "users.parquet"),
        "inter": pd.read_parquet(P / "interactions.parquet"),
        "sessions": pd.read_parquet(P / "sessions.parquet", columns=["sid", "uid", "session_idx", "n_add_to_cart", "n_purchase"]),
        "catalog": pd.read_parquet(P / "catalog.parquet"),
        "tx": pd.read_parquet(P / "transactions.parquet", columns=["transaction_id", "item_id", "date"]),
        "personas": pd.read_parquet(P / "user_personas.parquet"),
    }


def _lgb(objective: str, hp: dict, num_class: int | None = None) -> lgb.LGBMModel:
    params = dict(n_estimators=600, subsample=0.8, subsample_freq=1, reg_lambda=1.0, random_state=C.RANDOM_SEED,
                  verbose=-1, cat_smooth=20, max_cat_to_onehot=8, **hp)
    if objective == "binary":
        return lgb.LGBMClassifier(objective="binary", **params)
    return lgb.LGBMClassifier(objective="multiclass", num_class=num_class, **params)


def _fit_search(objective: str, X: pd.DataFrame, y: np.ndarray, rng, num_class: int | None = None) -> tuple:
    """Fit each HP config with early stopping on a 10% holdout; keep the best by holdout log-loss."""
    val = rng.random(len(X)) < 0.1
    best = None
    for hp in HP_GRID:
        m = _lgb(objective, hp, num_class)
        m.fit(X[~val], y[~val], eval_set=[(X[val], y[val])], callbacks=[lgb.early_stopping(40, verbose=False)])
        p = m.predict_proba(X[val])
        ll = log_loss(y[val], p, labels=range(num_class) if num_class else [0, 1])
        log.info("  %s hp=%s -> holdout logloss %.4f (%d trees)", objective, hp, ll, m.best_iteration_ or m.n_estimators)
        if best is None or ll < best[0]:
            best = (ll, m, hp)
    return best[1], X[val], y[val], best[2]


def _topk_rows(M: sp.csr_matrix, k: int, extra: np.ndarray | None = None) -> dict:
    out = {}
    for i in range(M.shape[0]):
        row = M.getrow(i)
        if row.nnz == 0:
            continue
        top = np.argsort(-row.data)[:k]
        rec = (row.indices[top].astype(np.int32), row.data[top].astype(np.float32))
        out[i] = rec if extra is None else rec + (extra[i][top],)
    return out


def fit(cutoff: str | None, out_dir: Path, tables: dict | None = None) -> dict:
    t0 = time.time()
    tb = tables or load_tables()
    users, inter, catalog = tb["users"], tb["inter"], tb["catalog"]
    rng = np.random.default_rng(C.RANDOM_SEED)
    cut = pd.Timestamp(cutoff) if cutoff else inter["ts"].max() + pd.Timedelta(seconds=1)

    tu = users[users["first_seen"] < cut].reset_index(drop=True)
    ti = inter[(inter["ts"] < cut) & inter["uid"].isin(tu["uid"])]

    cand = catalog[catalog["displayable"] & catalog["merch"]].reset_index(drop=True)
    items = cand["item_id"].tolist()
    item_idx = {it: i for i, it in enumerate(items)}
    dept_of = cand["department"].to_numpy()
    dept_classes = [d for d in C.DEPARTMENTS if d in set(dept_of)]

    # ---------------------------------------------------------------- user x item (user-share)
    x = ti[ti["item_id"].isin(item_idx)]
    uw = x.groupby(["uid", "item_id"])["weight"].sum().reset_index()
    u_codes = {u: i for i, u in enumerate(uw["uid"].unique())}
    R = sp.csr_matrix((uw["weight"].to_numpy(np.float32),
                       (uw["uid"].map(u_codes).to_numpy(), uw["item_id"].map(item_idx).to_numpy())),
                      shape=(len(u_codes), len(items)))
    rs = np.asarray(R.sum(1)).ravel()
    R = (sp.diags(1.0 / np.maximum(rs, 1e-9)) @ R).tocsr().astype(np.float32)
    r_uids = np.array(list(u_codes.keys()))
    tu_idx = tu.set_index("uid")
    ctx_r = F.users_to_context(tu_idx.loc[r_uids].reset_index())

    pop = np.asarray(R.sum(0)).ravel()
    pop = pop / pop.sum()
    age_days = (cut - x["ts"]).dt.total_seconds().to_numpy() / 86400
    tw = x["weight"].to_numpy() * np.power(0.5, age_days / TREND_HALF_LIFE_DAYS)
    trend = np.bincount(x["item_id"].map(item_idx).to_numpy(), weights=tw, minlength=len(items))
    trend = (trend + 1e-3) / (trend + 1e-3).sum()
    trend_in_dept = {}
    for d in dept_classes:
        v = np.where(dept_of == d, trend, 0.0)
        trend_in_dept[d] = v / max(v.sum(), 1e-12)

    # ---------------------------------------------------------------- context back-off priors
    priors: dict = {}
    for chain, levels in F.CHAINS.items():
        for fields in levels:
            if not fields or fields in priors:
                continue
            keys = ctx_r[list(fields)].astype(str).agg("|".join, axis=1) if len(fields) > 1 else ctx_r[fields[0]].astype(str)
            codes, uniq = pd.factorize(keys)
            G = sp.csr_matrix((np.ones(len(codes), np.float32), (codes, np.arange(len(codes)))), shape=(len(uniq), len(codes)))
            M = np.asarray((G @ R).todense(), dtype=np.float32)
            N = np.asarray(G.sum(1)).ravel()
            keep = N >= MIN_CELL_USERS
            priors[fields] = {"index": {k: i for i, k in enumerate(np.asarray(uniq)[keep])}, "M": M[keep], "N": N[keep].astype(np.float32)}
    priors[()] = {"index": {"*": 0}, "M": np.asarray(R.sum(0), dtype=np.float32), "N": np.array([R.shape[0]], np.float32)}

    # ---------------------------------------------------------------- department labels / MI weights
    D = np.stack([np.asarray(R[:, dept_of == d].sum(1)).ravel() for d in dept_classes], axis=1)
    dept_label = np.array(dept_classes)[D.argmax(1)]
    mi = {f: mutual_info_score(ctx_r[f].astype(str), dept_label) for f in F.CAT_FEATURES}
    mx = max(mi.values()) or 1.0
    knn_w = {f: float(max(v / mx, 0.05)) for f, v in mi.items()}
    # P(department | gender) from visitors with a resolved gender
    dept_by_gender = {}
    for g in ("female", "male"):
        m = (ctx_r["gender"] == g).to_numpy()
        if m.sum() > 100:
            v = D[m].sum(0)
            dept_by_gender[g] = {d: float(p) for d, p in zip(dept_classes, v / v.sum())}

    # ---------------------------------------------------------------- kNN pool (most recent visitors)
    recent = np.argsort(-tu_idx.loc[r_uids, "first_seen"].to_numpy().astype("int64"))[:KNN_POOL]
    pool_ctx = ctx_r.iloc[recent].reset_index(drop=True)
    vocab: dict = {}
    rows, cols, vals = [], [], []
    for f in F.CAT_FEATURES:
        for v in pool_ctx[f].astype(str).unique():
            vocab[(f, v)] = len(vocab)
        idx = pool_ctx[f].astype(str).map(lambda v, f=f: vocab[(f, v)]).to_numpy()
        rows.append(np.arange(len(pool_ctx))); cols.append(idx); vals.append(np.full(len(pool_ctx), knn_w[f], np.float32))
    U = sp.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(len(pool_ctx), len(vocab)))
    R_pool = R[recent]

    # ---------------------------------------------------------------- LightGBM classifiers
    ctx_all = F.users_to_context(tu)
    cats = F.fit_categories(ctx_all)
    drop = rng.random(len(ctx_all)) < 0.5
    ctx_aug = ctx_all.copy()
    for c in F.DEMO_FEATURES:
        ctx_aug.loc[drop, c] = F.UNKNOWN
    X_all = F.to_model_frame(ctx_aug, cats)
    metrics: dict = {}
    hps: dict = {}

    pos = tu.reset_index().set_index("uid").loc[r_uids, "index"].to_numpy()
    Xd = X_all.iloc[pos].reset_index(drop=True)
    yd = pd.Series(dept_label).map({d: i for i, d in enumerate(dept_classes)}).to_numpy()
    sub = rng.random(len(Xd)) < min(1.0, 300_000 / len(Xd))
    log.info("department model (%d classes) on %d users", len(dept_classes), sub.sum())
    m_dept, Xv, yv, hps["department"] = _fit_search("multiclass", Xd[sub].reset_index(drop=True), yd[sub], rng, len(dept_classes))
    pv = m_dept.predict_proba(Xv)
    prior = np.bincount(yd, minlength=len(dept_classes)) / len(yd)
    metrics["department"] = {"accuracy": float(accuracy_score(yv, pv.argmax(1))), "logloss": float(log_loss(yv, pv, labels=range(len(dept_classes)))),
                             "baseline_accuracy": float(prior.max()),
                             "baseline_logloss": float(log_loss(yv, np.tile(prior, (len(yv), 1)), labels=range(len(dept_classes))))}

    per = tb["personas"].set_index("uid")["persona_cluster"]
    yp_all = per.reindex(tu["uid"]).to_numpy()
    ok = ~np.isnan(yp_all)
    n_p = int(np.nanmax(yp_all)) + 1
    Xp = X_all[ok].reset_index(drop=True)
    yp = yp_all[ok].astype(int)
    sub = rng.random(len(Xp)) < min(1.0, 300_000 / len(Xp))
    log.info("persona model (%d classes)", n_p)
    m_persona, Xv, yv, hps["persona"] = _fit_search("multiclass", Xp[sub].reset_index(drop=True), yp[sub], rng, n_p)
    pv = m_persona.predict_proba(Xv)
    metrics["persona"] = {"accuracy": float(accuracy_score(yv, pv.argmax(1))), "baseline_accuracy": float(np.bincount(yp).max() / len(yp))}

    s = tb["sessions"]
    first = s[s["session_idx"] == 0].set_index("uid").reindex(tu["uid"])
    intent_models = {}
    for name, col in (("cart", "n_add_to_cart"), ("purchase", "n_purchase")):
        y = (first[col].fillna(0).to_numpy() > 0).astype(int)
        sub = rng.random(len(X_all)) < min(1.0, 400_000 / len(X_all))
        log.info("intent model: %s", name)
        m, Xv, yv, hps[f"intent_{name}"] = _fit_search("binary", X_all[sub].reset_index(drop=True), y[sub], rng)
        pv = m.predict_proba(Xv)[:, 1]
        metrics[f"intent_{name}"] = {"auc": float(roc_auc_score(yv, pv)), "base_rate": float(y.mean())}
        intent_models[name] = (m, float(y.mean()))

    # ---------------------------------------------------------------- persona item distributions
    pr = per.reindex(r_uids).fillna(-1).astype(int).to_numpy()
    persona_items = np.zeros((n_p, len(items)), np.float32)
    for p in range(n_p):
        rows_p = np.where(pr == p)[0]
        if len(rows_p):
            persona_items[p] = np.asarray(R[rows_p].sum(0)).ravel()
    persona_items = (persona_items + 1e-4 * pop) / (persona_items + 1e-4 * pop).sum(1, keepdims=True)

    # ---------------------------------------------------------------- item-item graphs
    xi = ti[ti["item_id"].isin(item_idx)]
    sim = coview_similarity(xi, items).tocsr()
    coview = _topk_rows(sim, 30)
    # ordered next-item transitions within a session (view/cart events), row-normalised
    seq = xi[xi["event"].isin(["view_item", "add_to_cart"])].sort_values(["sid", "ts"])
    same = seq["sid"].to_numpy()[1:] == seq["sid"].to_numpy()[:-1]
    a = seq["item_id"].map(item_idx).to_numpy()
    src, dst = a[:-1][same], a[1:][same]
    keep = src != dst
    Tm = sp.csr_matrix((np.ones(keep.sum(), np.float32), (src[keep], dst[keep])), shape=(len(items), len(items)))
    Tm = (sp.diags(1.0 / np.maximum(np.asarray(Tm.sum(1)).ravel(), 1)) @ Tm).tocsr()
    transitions = _topk_rows(Tm, 30)

    tx = tb["tx"]
    tx = tx[(tx["date"] < cut) & tx["item_id"].isin(item_idx)]
    tx_items = tx.drop_duplicates(["transaction_id", "item_id"])
    tcodes, _ = pd.factorize(tx_items["transaction_id"])
    B = sp.csr_matrix((np.ones(len(tx_items), np.float32), (tcodes, tx_items["item_id"].map(item_idx).to_numpy())),
                      shape=(tcodes.max() + 1, len(items)))
    CP = (B.T @ B).tocsr()
    cnt = np.asarray(CP.diagonal()).ravel()
    CP.setdiag(0)
    CP.eliminate_zeros()
    n_tx = B.shape[0]
    copurchase = {}
    for i in range(len(items)):
        row = CP.getrow(i)
        if row.nnz == 0:
            continue
        lift = row.data * n_tx / (cnt[i] * np.maximum(cnt[row.indices], 1))
        score = row.data * np.log1p(lift)
        top = np.argsort(-score)[:10]
        copurchase[i] = (row.indices[top].astype(np.int32), row.data[top].astype(np.float32), lift[top].astype(np.float32))

    # ---------------------------------------------------------------- item feature table (for LTR)
    first_seen = pd.to_datetime(cand["first_seen"])
    item_feats = pd.DataFrame({
        "log_price": np.log1p(cand["price"].to_numpy(float)),
        "log_pop": np.log(pop + 1e-9),
        "log_trend": np.log(trend + 1e-9),
        "cart_rate": cand["cart_rate"].to_numpy(float),
        "on_sale": cand["on_sale"].to_numpy(float),
        "age_days": ((cut - first_seen).dt.total_seconds() / 86400).clip(lower=0).fillna(400).to_numpy(float),
        "female_share": cand["female_share"].to_numpy(float),
        "dept": pd.Categorical(dept_of, categories=list(C.DEPARTMENTS)),
        "subcat": pd.Categorical(cand["subcategory"].astype(str)),
        "audience": pd.Categorical(cand["audience"].astype(str), categories=list(C.AUDIENCES)),
    })

    art = {
        "cutoff": str(cut), "items": items, "item_idx": item_idx, "dept_of": dept_of, "dept_classes": dept_classes,
        "audience": cand["audience"].astype(str).to_numpy(), "female_share": cand["female_share"].to_numpy(np.float32),
        "pop": pop.astype(np.float32), "trend": trend.astype(np.float32), "trend_in_dept": trend_in_dept,
        "priors": priors, "knn": {"U": U, "R": R_pool, "vocab": vocab, "weights": knn_w},
        "categories": cats, "dept_model": m_dept, "dept_by_gender": dept_by_gender,
        "persona_model": m_persona, "persona_items": persona_items,
        "intent_models": intent_models, "coview": coview, "transitions": transitions, "copurchase": copurchase,
        "item_feats": item_feats, "metrics": metrics, "hyperparams": hps,
        "n_train_users": int(len(tu)), "n_users_with_items": int(R.shape[0]),
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(art, out_dir / "model.joblib", compress=3)
    meta = {k: art[k] for k in ("cutoff", "metrics", "hyperparams", "n_train_users", "n_users_with_items", "dept_by_gender")}
    meta["knn_feature_weights"] = knn_w
    meta["seconds"] = round(time.time() - t0, 1)
    (out_dir / "model_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    log.info("fit(cutoff=%s) -> %s in %.1fs; metrics=%s", cutoff, out_dir, time.time() - t0, metrics)
    return meta


def run() -> dict:
    """Production fit on all data (serving artifacts)."""
    return fit(None, C.MODELS_DIR)
