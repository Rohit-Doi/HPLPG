"""Stage - model selection (post-evaluation).

Decides, from held-out evidence only, what the live agent serves:

1. Learning-to-rank: a *lean* LambdaRank (no raw context categoricals, stronger regularisation) is
   trained and compared with the plain blend on BOTH temporal folds. It is served only if it wins on both.
2. Audience rule strength for declared-gender visitors is tuned on the validation month (never the test month).

Writes models/blend.json (serving config) and updates reports/evaluation.json with a `modelSelection` block.
"""
from __future__ import annotations

import json
import logging
import time

import joblib
import lightgbm as lgb
import numpy as np

from .. import config as C
from ..engine import ltr as LTR
from ..engine.recommender import Artifacts
from . import evaluate as E, train

log = logging.getLogger(__name__)
LEAN_DROP = ["x_geo", "x_channel", "x_device", "x_daypart", "x_weekend", "x_landing", "x_macro", "x_gender", "x_age", "i_subcat"]


def train_lean(rec, res, ctx, truth, use_demo):
    cand = rec.top_k(res.scores, LTR.N_CANDIDATES)
    X = LTR.build_features(rec, res, ctx, cand, use_demo).drop(columns=LEAN_DROP, errors="ignore")
    y = np.array([1 if j in t else 0 for t, row in zip(truth, cand) for j in row], dtype=int)
    groups = np.full(len(cand), LTR.N_CANDIDATES)
    rng = np.random.default_rng(C.RANDOM_SEED)
    val = rng.random(len(cand)) < 0.15
    tr = np.repeat(~val, LTR.N_CANDIDATES)
    m = lgb.LGBMRanker(objective="lambdarank", n_estimators=600, learning_rate=0.02, num_leaves=15, min_child_samples=400,
                       subsample=0.7, subsample_freq=1, colsample_bytree=0.6, reg_lambda=10.0, random_state=C.RANDOM_SEED, verbose=-1,
                       lambdarank_truncation_level=15, label_gain=[0, 1])
    m.fit(X[tr], y[tr], group=groups[~val], eval_set=[(X[~tr], y[~tr])], eval_group=[groups[val]], eval_at=[10],
          callbacks=[lgb.early_stopping(50, verbose=False)])
    imp = sorted(zip(X.columns, m.feature_importances_), key=lambda x: -x[1])
    return {"model": m, "columns": list(X.columns), "importance": [{"feature": f, "gain": int(g)} for f, g in imp],
            "best_iteration": int(m.best_iteration_ or m.n_estimators), "train_users": int((~val).sum()), "variant": "lean"}


def rerank_lean(ltr, rec, res, ctx, use_demo):
    cand = rec.top_k(res.scores, LTR.N_CANDIDATES)
    X = LTR.build_features(rec, res, ctx, cand, use_demo)[ltr["columns"]]
    s = ltr["model"].predict(X).reshape(cand.shape)
    out = np.log(res.scores + 1e-12).astype(np.float32)
    out -= out.max(1, keepdims=True) + 1.0
    out -= 1e3
    np.put_along_axis(out, cand, (s - s.min()).astype(np.float32), axis=1)
    return out


def full_ltr_verdict(rep: dict) -> str:
    """Verdict on the full-feature reranker, computed from the evaluation report (never typed in)."""
    def lift(rows: list) -> float | None:
        nd = {r["name"]: (r.get("metrics") or r).get("ndcg") for r in rows}
        return (nd["hybrid_ltr"] / nd["hybrid_l1"] - 1) * 100 if nd.get("hybrid_ltr") and nd.get("hybrid_l1") else None
    p, s = lift(rep.get("coldStart", [])), lift(rep.get("secondaryFold", []))
    if p is None or s is None:
        return "Full-feature LambdaRank: not evaluated on both folds."
    word = lambda x: f"{'won' if x > 0 else 'lost'} ({x:+.1f}% NDCG)"
    top = (rep.get("ltr", {}).get("importance") or [{}])[0].get("feature", "?")
    note = " Its top feature is the raw 40-level state categorical (x_geo), which does not transfer across months." if top == "x_geo" else ""
    return f"Full-feature LambdaRank {word(s)} on the secondary fold (Mar -> Apr) but {word(p)} on the primary fold (May-Jun), so it is not served.{note}"


def run() -> dict:
    t0 = time.time()
    tb = train.load_tables()
    cat = tb["catalog"].set_index("item_id")
    rep = json.loads((C.REPORTS_DIR / "evaluation.json").read_text(encoding="utf-8"))
    cfg = json.loads((C.MODELS_DIR / "blend.json").read_text(encoding="utf-8"))
    dirs = {k: C.EVAL_MODELS_DIR / k for k in ("fold2_tune", "valid", "test")}
    folds = [("primary", dirs["valid"], (C.VALID_START, C.TEST_START), dirs["test"], (C.TEST_START, None)),
             ("secondary", dirs["fold2_tune"], (C.FOLD2_TUNE_START, C.VALID_START), dirs["valid"], (C.VALID_START, C.TEST_START))]
    results = {}
    lean_primary = None
    for name, tr_dir, tr_win, te_dir, te_win in folds:
        art_tr, art_te = Artifacts(tr_dir), Artifacts(te_dir)
        rec_tr, rec_te = E.configure(art_tr, cfg), E.configure(art_te, cfg)
        ev_tr = E.eval_users(tb, art_tr, *tr_win)
        ev_te = E.eval_users(tb, art_te, *te_win)
        sub = cat.loc[art_te.items, "subcategory"].to_numpy()
        res_tr = rec_tr.score(ev_tr["ctx"], use_demo=True, components=E.NON_SESSION)
        ltr = train_lean(rec_tr, res_tr, ev_tr["ctx"], ev_tr["truth"], True)
        res_te = rec_te.score(ev_te["ctx"], use_demo=True, components=E.NON_SESSION)
        m_blend, nd_b = E.metrics(rec_te.top_k(res_te.scores, E.K), ev_te["M"], sub, art_te.n_items)
        m_lean, nd_l = E.metrics(rec_te.top_k(rerank_lean(ltr, rec_te, res_te, ev_te["ctx"], True), E.K), ev_te["M"], sub, art_te.n_items)
        m_pop, nd_p = E.metrics(rec_te.top_k(np.asarray(res_te.components["pop"]), E.K), ev_te["M"], sub, art_te.n_items)
        results[name] = {"blendNdcg": m_blend["ndcg"], "leanLtrNdcg": m_lean["ndcg"], "popularityNdcg": m_pop["ndcg"],
                         "leanLtrWins": bool(nd_l.mean() > nd_b.mean()), "testUsers": int(len(ev_te["ctx"])),
                         "ci": {"blend": E.bootstrap_ci(nd_b), "leanLtr": E.bootstrap_ci(nd_l)}}
        log.info("fold %s: blend %.4f lean-LTR %.4f (pop %.4f)", name, m_blend["ndcg"], m_lean["ndcg"], m_pop["ndcg"])
        if name == "primary":
            lean_primary = (ltr, nd_b, nd_p, nd_l)
    use_ltr = all(r["leanLtrWins"] for r in results.values())

    # ---- audience-rule strength tuned on the validation month (declared-gender visitors only)
    art_v = Artifacts(dirs["valid"])
    rec_v = E.configure(art_v, cfg)
    ev_v = E.eval_users(tb, art_v, C.VALID_START, C.TEST_START)
    sub_v = cat.loc[art_v.items, "subcategory"].to_numpy()
    idx = np.where(ev_v["ctx"]["gender"].isin(["female", "male"]).to_numpy())[0]
    ctx_g = ev_v["ctx"].iloc[idx].reset_index(drop=True)
    M_g = ev_v["M"][idx]
    res_g = rec_v.score(ctx_g, use_demo=True, components=E.NON_SESSION)
    g = ctx_g["gender"].to_numpy()
    aud_grid = {}
    for strength in (0.0, 0.15, 0.3, 0.5, 1.0):
        mult = np.vstack([rec_v.audience_multiplier(gg, None, strength) for gg in g]) if strength > 0 else 1.0
        m, _ = E.metrics(rec_v.top_k(res_g.scores * mult, E.K), M_g, sub_v, art_v.n_items)
        aud_grid[str(strength)] = m["ndcg"]
    # merchandising rule: take the LARGEST strength whose validation cost is within 1.2% of the best grid point
    # (declared visitors get a visibly coherent page at a measured, bounded ranking cost)
    top = max(aud_grid.values())
    best_strength = max(float(k) for k, v in aud_grid.items() if v >= top * (1 - 0.012))
    log.info("audience strength grid (validation, %d users): %s -> %.2f (largest within 1.2%% of best)", len(idx), aud_grid, best_strength)

    # ---- headline = served model on the primary fold
    ltr, nd_b, nd_p, nd_l = lean_primary
    served = nd_l if use_ltr else nd_b
    rng = np.random.default_rng(7)
    diffs = [served[ix].mean() / nd_p[ix].mean() - 1 for ix in (rng.integers(0, len(nd_p), len(nd_p)) for _ in range(500))]
    rep["modelSelection"] = {
        "servedRanker": "lean_lambdarank" if use_ltr else "hybrid_blend",
        "rule": "A reranker is served only if it beats the tuned blend on both temporal folds; otherwise the blend is served.",
        "folds": results, "leanLtr": {"droppedFeatures": LEAN_DROP, "bestIteration": ltr["best_iteration"], "importance": ltr["importance"][:15]},
        "fullLtrVerdict": full_ltr_verdict(rep),
        "audienceRule": {"strengthGrid": aud_grid, "chosenStrength": best_strength, "tunedOn": "validation month, declared-gender visitors",
                         "note": "Rule: the largest strength whose validation NDCG is within 1.2% of the best grid point. A hard override costs ranking quality (declared women also browse men's-audience items in this data), so the nudge stays soft on the main ranking; the hero leads with the declared department and the dedicated 'For her / For him' module applies the hard filter."},
    }
    rep["hybridLiftVsPopularity"] = {"model": rep["modelSelection"]["servedRanker"], "pct": round(float(np.mean(diffs) * 100), 1),
                                     "ci95": [round(float(np.percentile(diffs, 2.5) * 100), 1), round(float(np.percentile(diffs, 97.5) * 100), 1)]}
    (C.REPORTS_DIR / "evaluation.json").write_text(json.dumps(rep, indent=2, default=float), encoding="utf-8")
    cfg["use_ltr"] = use_ltr
    cfg["audience_strength"] = best_strength
    (C.MODELS_DIR / "blend.json").write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    if use_ltr:
        joblib.dump({"model": ltr["model"], "columns": ltr["columns"], "importance": ltr["importance"], "variant": "lean"}, C.MODELS_DIR / "ltr.joblib", compress=3)
    elif (C.MODELS_DIR / "ltr.joblib").exists():
        (C.MODELS_DIR / "ltr.joblib").rename(C.MODELS_DIR / "ltr_rejected.joblib")
    log.info("model selection done in %.0fs: serve %s, audience strength %.2f", time.time() - t0, rep["modelSelection"]["servedRanker"], best_strength)
    return rep["modelSelection"]
