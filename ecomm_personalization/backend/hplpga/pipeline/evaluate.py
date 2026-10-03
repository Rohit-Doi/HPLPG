"""Stage 5 - Offline evaluation with a strict temporal protocol.

Primary fold
    tune  : models fit on data < 2025-04-01 -> blend/chain weights, alpha, kNN K, gender boost tuned on
            visitors FIRST SEEN in April 2025; the LTR reranker is trained on the same month.
    test  : models fit on data < 2025-05-01 -> evaluated on visitors FIRST SEEN 2025-05-01 .. 2025-06-08.
Secondary fold (robustness)
    tune on March visitors (fit < 2025-03-01), test on April visitors (fit < 2025-04-01).

Test visitors are genuinely new (no history in the training window), so this measures cold start honestly.
For each visitor only first-touch context is revealed; ground truth = every catalog item they viewed,
carted or bought during the test window. Metrics @K=10: HitRate, Precision, Recall, NDCG, MRR,
catalog coverage and intra-list subcategory diversity. 95% CIs by bootstrap over visitors.

Also reported: warm start (first item revealed), signal ablations (what does geo / gender / kNN add?),
a "what moves the page" sensitivity study, and breakdowns by channel, device, gender, and state.
"""
from __future__ import annotations

import json
import logging
import time

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, log_loss, roc_auc_score

from .. import config as C
from ..engine import features as F, ltr as LTR
from ..engine.recommender import Artifacts, Recommender, COMPONENTS
from . import train

log = logging.getLogger(__name__)
K = 10
NON_SESSION = [c for c in COMPONENTS if c != "session"]


# ------------------------------------------------------------------ data
def eval_users(tb: dict, art: Artifacts, start: str, end: str | None) -> dict:
    users, inter = tb["users"], tb["inter"]
    s, e = pd.Timestamp(start), (pd.Timestamp(end) if end else inter["ts"].max() + pd.Timedelta(seconds=1))
    u = users[(users["first_seen"] >= s) & (users["first_seen"] < e)]
    it = inter[(inter["ts"] >= s) & (inter["ts"] < e) & inter["uid"].isin(u["uid"]) & inter["item_id"].isin(art.item_idx)]
    it = it.sort_values("ts")
    truth = it.groupby("uid")["item_id"].agg(lambda x: list(dict.fromkeys(x)))
    u = u[u["uid"].isin(truth.index)].reset_index(drop=True)
    ctx = F.users_to_context(u)
    t = [set(art.item_idx[i] for i in truth[uid]) for uid in u["uid"]]
    ordered = [[art.item_idx[i] for i in truth[uid]] for uid in u["uid"]]
    return {"users": u, "ctx": ctx, "truth": t, "ordered": ordered, "M": truth_matrix(t, art.n_items)}


# ------------------------------------------------------------------ metrics
def truth_matrix(truth: list[set], n_items: int) -> np.ndarray:
    M = np.zeros((len(truth), n_items), bool)
    for i, t in enumerate(truth):
        if t:
            M[i, list(t)] = True
    return M


def metrics(top: np.ndarray, truth, sub_of: np.ndarray, n_items: int) -> tuple[dict, np.ndarray]:
    M = truth if isinstance(truth, np.ndarray) else truth_matrix(truth, n_items)
    n, k = top.shape
    rel = M[np.arange(n)[:, None], top].astype(np.float32)
    tlen = M.sum(1)
    disc = 1.0 / np.log2(np.arange(2, k + 2))
    cdisc = np.r_[0.0, np.cumsum(disc)]
    h = rel.sum(1)
    idcg = cdisc[np.minimum(tlen, k)]
    ndcg = np.where(idcg > 0, (rel * disc).sum(1) / np.maximum(idcg, 1e-9), 0.0)
    first = rel.argmax(1)
    mrr = np.where(h > 0, 1.0 / (first + 1), 0.0)
    div = np.mean([len(set(r)) / k for r in sub_of[top]])
    m = {"hitRate": (h > 0).mean(), "precision": (h / k).mean(), "recall": (h / np.maximum(tlen, 1)).mean(),
         "ndcg": ndcg.mean(), "mrr": mrr.mean(), "coverage": len(np.unique(top)) / n_items, "diversity": div}
    return {k2: round(float(v), 4) for k2, v in m.items()}, ndcg


def bootstrap_ci(x: np.ndarray, n: int = 500, seed: int = 0) -> list[float]:
    rng = np.random.default_rng(seed)
    means = [x[rng.integers(0, len(x), len(x))].mean() for _ in range(n)]
    return [round(float(np.percentile(means, 2.5)), 4), round(float(np.percentile(means, 97.5)), 4)]


def blend(comps: dict, w: dict) -> np.ndarray:
    out = None
    for k, v in comps.items():
        if w.get(k, 0) <= 0:
            continue
        out = w[k] * v if out is None else out + w[k] * v
    return out


# ------------------------------------------------------------------ tuning
def tune(rec: Recommender, ev: dict, sub_of, rng, n_users: int = 8000, n_trials: int = 200) -> dict:
    """Joint random search over component weights, chain weights, alpha and kNN K (NDCG@10 on a sample)."""
    idx = rng.choice(len(ev["ctx"]), size=min(n_users, len(ev["ctx"])), replace=False)
    ctx = ev["ctx"].iloc[idx].reset_index(drop=True)
    M = ev["M"][idx]
    nI = rec.a.n_items
    best = {"ndcg": -1.0}
    # kNN K candidates computed once each (the expensive part)
    knn_by_k = {}
    for kk in (100, 300, 600):
        rec.knn_k = kk
        knn_by_k[kk] = rec.knn(ctx, use_demo=False)
    for alpha in (10.0, 30.0, 100.0):
        rec.alpha = alpha
        rec._prior_cache.clear()
        res = rec.score(ctx, use_demo=False, components=["pop", "trend", "dept", "persona", "ctx"])
        comps = {k: np.asarray(v) for k, v in res.components.items() if k != "ctx"}
        chains = res.chains
        names = list(comps) + ["knn"]
        cnames = list(chains)
        cands = []
        for one in names + ["ctx"]:
            cands.append(({n: 1.0 if n == one else 0.0 for n in names + ["ctx"]}, dict(F.DEFAULT_CHAIN_WEIGHTS), 300))
        for _ in range(n_trials):
            cw = dict(zip(cnames, rng.dirichlet(np.ones(len(cnames)) * 0.8)))
            w = dict(zip(names + ["ctx"], rng.dirichlet(np.ones(len(names) + 1) * 0.7)))
            cands.append((w, cw, int(rng.choice([100, 300, 600]))))
        for w, cw, kk in cands:
            ctxm = sum(cw[c] * chains[c] for c in cnames) / max(sum(cw.values()), 1e-9)
            sc = blend({**comps, "knn": knn_by_k[kk], "ctx": ctxm}, w)
            m, _ = metrics(rec.top_k(sc, K), M, sub_of, nI)
            if m["ndcg"] > best["ndcg"]:
                best = {"ndcg": m["ndcg"], "weights": w, "chain_weights": cw, "alpha": alpha, "knn_k": kk}
        # local refinement
        for _ in range(60):
            w0, cw0 = best["weights"], best["chain_weights"]
            w = {n: max(0.0, w0.get(n, 0) + rng.normal(0, 0.04)) for n in names + ["ctx"]}
            cw = {n: max(0.0, cw0.get(n, 0) + rng.normal(0, 0.06)) for n in cnames}
            ctxm = sum(cw[c] * chains[c] for c in cnames) / max(sum(cw.values()), 1e-9)
            sc = blend({**comps, "knn": knn_by_k[best["knn_k"]], "ctx": ctxm}, w)
            m, _ = metrics(rec.top_k(sc, K), M, sub_of, nI)
            if m["ndcg"] > best["ndcg"]:
                best = {**best, "ndcg": m["ndcg"], "weights": w, "chain_weights": cw}
        log.info("alpha=%s best ndcg so far %.4f (K=%s)", alpha, best["ndcg"], best["knn_k"])
    s = sum(best["weights"].values()) or 1
    best["weights"] = {k: round(v / s, 4) for k, v in best["weights"].items()}
    best["chain_weights"] = {k: round(v, 4) for k, v in best["chain_weights"].items()}
    return best


def tune_demo(rec: Recommender, ev: dict, sub_of, rng) -> dict:
    """With L1 weights fixed, tune the demographic chain weights and the kNN gender boost on declared-gender visitors."""
    idx = np.where(ev["ctx"]["gender"].isin(["female", "male"]).to_numpy())[0]
    idx = rng.choice(idx, size=min(8000, len(idx)), replace=False)
    ctx = ev["ctx"].iloc[idx].reset_index(drop=True)
    M = ev["M"][idx]
    best = (-1.0, 0.0, 0.0, 1.0)
    for gb in (1.0, 3.0, 6.0):
        rec.gender_boost = gb
        res = rec.score(ctx, use_demo=True, components=NON_SESSION)
        base = {k: v for k, v in res.components.items() if k not in ("ctx",)}
        for wd in (0.0, 0.5, 1.0, 2.0, 4.0):
            for wdg in (0.0, 0.5, 1.0, 2.0):
                cw = {**rec.chain_weights, "demo": wd, "demo_geo": wdg}
                tot = sum(cw[c] for c in res.chains)
                ctxm = sum(cw[c] * res.chains[c] for c in res.chains) / max(tot, 1e-9)
                sc = blend({**base, "ctx": ctxm}, rec.weights)
                m, _ = metrics(rec.top_k(sc, K), M, sub_of, rec.a.n_items)
                if m["ndcg"] > best[0]:
                    best = (m["ndcg"], wd, wdg, gb)
    return {"ndcg": best[0], "demo": best[1], "demo_geo": best[2], "gender_boost": best[3], "users": int(len(idx))}


def tune_session(rec: Recommender, ev: dict, sub_of) -> dict:
    sel = [i for i, o in enumerate(ev["ordered"]) if len(o) >= 2][:6000]
    ctx = ev["ctx"].iloc[sel].reset_index(drop=True)
    first = [[rec.a.items[ev["ordered"][i][0]]] for i in sel]
    M = truth_matrix([set(ev["ordered"][i][1:]) for i in sel], rec.a.n_items)
    excl = [{ev["ordered"][i][0]} for i in sel]
    best = (-1.0, 0.0, 0.5)
    for tm in (0.0, 0.5, 1.0):
        rec.trans_mix = tm
        res = rec.score(ctx, session_items=first, use_demo=False)
        for ws in (0.5, 1.0, 2.0, 4.0, 8.0, 16.0):
            w = {**rec.weights, "session": ws}
            m, _ = metrics(rec.top_k(blend(res.components, w), K, excl), M, sub_of, rec.a.n_items)
            if m["ndcg"] > best[0]:
                best = (m["ndcg"], ws, tm)
    return {"ndcg": best[0], "session": best[1], "trans_mix": best[2]}


def configure(art: Artifacts, cfg: dict) -> Recommender:
    return Recommender(art, weights=cfg["weights"], alpha=cfg["alpha"], chain_weights=cfg["chain_weights"],
                       knn_k=cfg["knn_k"], gender_boost=cfg.get("gender_boost", 3.0), trans_mix=cfg.get("trans_mix", 0.5))


def tune_all(art: Artifacts, ev: dict, sub_of, rng) -> dict:
    rec = Recommender(art)
    best = tune(rec, ev, sub_of, rng)
    cfg = {"weights": best["weights"], "chain_weights": best["chain_weights"], "alpha": best["alpha"], "knn_k": best["knn_k"],
           "validationNdcg": best["ndcg"]}
    rec = configure(art, cfg)
    d = tune_demo(rec, ev, sub_of, rng)
    cfg["chain_weights"].update({"demo": d["demo"], "demo_geo": d["demo_geo"]})
    cfg["gender_boost"] = d["gender_boost"]
    cfg["demoTuning"] = d
    rec = configure(art, cfg)
    s = tune_session(rec, ev, sub_of)
    cfg["weights"]["session"] = s["session"]
    cfg["trans_mix"] = s["trans_mix"]
    cfg["sessionTuning"] = s
    return cfg


# ------------------------------------------------------------------ evaluation of one fold
def run_fold(art: Artifacts, cfg: dict, ev: dict, sub_of, ltr: dict | None, labels: dict) -> tuple[list, dict, dict]:
    rec = configure(art, cfg)
    res_l1 = rec.score(ev["ctx"], use_demo=False, components=NON_SESSION)
    res_l2 = rec.score(ev["ctx"], use_demo=True, components=NON_SESSION)
    runs = {"random": np.random.default_rng(1).random((len(ev["ctx"]), art.n_items)),
            **{k: np.asarray(v) for k, v in res_l1.components.items()},
            "hybrid_l1": res_l1.scores, "hybrid_l2": res_l2.scores}
    if ltr is not None:
        runs["hybrid_ltr"] = LTR.rerank(ltr, rec, res_l1, ev["ctx"], use_demo=False)
        runs["hybrid_ltr_l2"] = LTR.rerank(ltr, rec, res_l2, ev["ctx"], use_demo=True)
    # merchandising rule on top of L2 for declared-gender visitors
    g = ev["ctx"]["gender"].to_numpy()
    mult = np.vstack([rec.audience_multiplier(gg if gg in ("female", "male") else None) for gg in g])
    runs["hybrid_l2_audience"] = (runs.get("hybrid_ltr_l2", res_l2.scores) - (runs.get("hybrid_ltr_l2", res_l2.scores).min() if ltr else 0)) * mult
    results, per_user = [], {}
    for name, sc in runs.items():
        m, nd = metrics(rec.top_k(sc, K), ev["M"], sub_of, art.n_items)
        per_user[name] = nd
        results.append({"name": name, "label": labels[name][0], "description": labels[name][1], "metrics": m, "ci": {"ndcg": bootstrap_ci(nd)}})
    base = per_user["pop"].mean()
    for r in results:
        r["liftVsPopularityPct"] = round(float((per_user[r["name"]].mean() / base - 1) * 100), 1)
    return results, per_user, {"rec": rec, "res_l1": res_l1, "res_l2": res_l2}


LABELS = {
    "random": ("Random", "Uniformly random catalog items (sanity floor)."),
    "pop": ("Global popularity", "All-time bestsellers - the classic cold-start fallback."),
    "trend": ("Trending (time-decayed)", "Recency-weighted popularity, half-life 21 days."),
    "ctx": ("Context back-off priors", "Weighted mix of hierarchical Bayesian chains: channel x device x region, location, time, landing page, season."),
    "knn": ("kNN similar visitors", "Items of the K most similar historical visitors (MI-weighted context)."),
    "dept": ("LightGBM department affinity", "Predicted department x in-department trend."),
    "persona": ("LightGBM persona", "Predicted persona x persona item mix."),
    "hybrid_l1": ("Hybrid blend (context only)", "Tuned blend of all components - Level 1: device, channel, geo, time, landing, season."),
    "hybrid_l2": ("Hybrid blend (+ declared demographics)", "Level 2: adds the demographic and demographic x geo chains and a gender-boosted kNN."),
    "hybrid_ltr": ("Hybrid + LTR reranker (context only)", "LambdaRank re-ranking of the blend's top-50 with item, context and cross features."),
    "hybrid_ltr_l2": ("Hybrid + LTR reranker (+ demographics)", "Same reranker with declared age/gender available."),
    "hybrid_l2_audience": ("Agent (+ demographics + audience rule)", "What the agent serves at Level 2: reranked scores x audience-match multiplier for declared gender."),
}


# ------------------------------------------------------------------ main
def run() -> dict:
    t0 = time.time()
    rng = np.random.default_rng(C.RANDOM_SEED)
    tb = train.load_tables()
    dirs = {k: C.EVAL_MODELS_DIR / k for k in ("fold2_tune", "valid", "test")}
    train.fit(C.FOLD2_TUNE_START, dirs["fold2_tune"], tb)
    train.fit(C.VALID_START, dirs["valid"], tb)
    train.fit(C.TEST_START, dirs["test"], tb)
    cat = tb["catalog"].set_index("item_id")

    # ---- primary fold: tune on April (valid fit), train LTR on April, test on May-June (test fit)
    art_v = Artifacts(dirs["valid"])
    sub_v = cat.loc[art_v.items, "subcategory"].to_numpy()
    ev_v = eval_users(tb, art_v, C.VALID_START, C.TEST_START)
    cfg = tune_all(art_v, ev_v, sub_v, rng)
    log.info("tuned config: %s", {k: v for k, v in cfg.items() if k not in ("demoTuning", "sessionTuning")})
    rec_v = configure(art_v, cfg)
    res_v = rec_v.score(ev_v["ctx"], use_demo=True, components=NON_SESSION)   # LTR sees demographics when declared
    ltr = LTR.train(rec_v, res_v, ev_v["ctx"], ev_v["truth"], use_demo=True)
    log.info("LTR trained: %d iterations, top features %s", ltr["best_iteration"], ltr["importance"][:8])

    art = Artifacts(dirs["test"])
    sub_of = cat.loc[art.items, "subcategory"].to_numpy()
    ev = eval_users(tb, art, C.TEST_START, None)
    log.info("test visitors: %s", len(ev["ctx"]))
    results, per_user, st = run_fold(art, cfg, ev, sub_of, ltr, LABELS)
    rec, res_l1 = st["rec"], st["res_l1"]

    # ---- warm start
    sel = [i for i, o in enumerate(ev["ordered"]) if len(o) >= 2]
    ctx_w = ev["ctx"].iloc[sel].reset_index(drop=True)
    first = [[art.items[ev["ordered"][i][0]]] for i in sel]
    M_w = truth_matrix([set(ev["ordered"][i][1:]) for i in sel], art.n_items)
    excl = [{ev["ordered"][i][0]} for i in sel]
    res_w = rec.score(ctx_w, session_items=first, use_demo=False)
    warm_runs = {
        "pop": ("Global popularity", "Bestsellers, excluding the item just viewed.", res_w.components["pop"]),
        "session": ("Item-item graph (co-view + transitions)", "Items co-viewed with / viewed right after the item just viewed.", res_w.components["session"]),
        "hybrid_cold": ("Hybrid agent (ignores session)", "Level-1 blend without the session signal.", blend(res_w.components, {**rec.weights, "session": 0})),
        "hybrid_warm": ("Hybrid agent (Level 3, in-session)", "Level-1 blend + in-session graph signal.", res_w.scores),
    }
    warm, warm_nd = [], {}
    for name, (lab, desc, sc) in warm_runs.items():
        m, nd = metrics(rec.top_k(np.asarray(sc), K, excl), M_w, sub_of, art.n_items)
        warm_nd[name] = nd
        warm.append({"name": name, "label": lab, "description": desc, "metrics": m, "ci": {"ndcg": bootstrap_ci(nd)}})
    for r in warm:
        r["liftVsPopularityPct"] = round(float((warm_nd[r["name"]].mean() / warm_nd["pop"].mean() - 1) * 100), 1)

    # ---- ablations: remove one signal group from the L1 blend
    ablations = []
    base_nd = per_user["hybrid_l1"].mean()
    comps = {k: np.asarray(v) for k, v in res_l1.components.items() if k != "ctx"}
    chains = res_l1.chains

    def ctx_mix(cw):
        tot = sum(cw.get(c, 0) for c in chains)
        return sum(cw.get(c, 0) * chains[c] for c in chains) / max(tot, 1e-9)

    variants = {
        "no_geo": ("Without geography", "geo & place chains removed, geo/macro masked in kNN"),
        "no_time": ("Without time of day / season", "time & season chains removed"),
        "no_channel": ("Without traffic source", "channel-based chains removed"),
        "no_knn": ("Without kNN similar visitors", "kNN weight set to 0"),
        "no_ctx": ("Without back-off priors", "ctx weight set to 0"),
        "no_ml": ("Without LightGBM (dept + persona)", "department and persona weights set to 0"),
    }
    for name, (lab, desc) in variants.items():
        w, cw = dict(rec.weights), dict(rec.chain_weights)
        if name == "no_geo":
            cw.update({"geo": 0, "place": 0})
            ctx2 = ev["ctx"].copy(); ctx2["geo"] = "Unknown"; ctx2["macro"] = "Unknown"
            knn2 = rec.knn(ctx2, use_demo=False)
            sc = blend({**comps, "knn": knn2, "ctx": ctx_mix(cw)}, w)
        elif name == "no_time":
            cw.update({"time": 0, "season": 0}); sc = blend({**comps, "ctx": ctx_mix(cw)}, w)
        elif name == "no_channel":
            cw.update({"geo": 0, "time": 0, "landing": 0}); sc = blend({**comps, "ctx": ctx_mix(cw)}, w)
        elif name == "no_knn":
            w["knn"] = 0; sc = blend({**comps, "ctx": ctx_mix(cw)}, w)
        elif name == "no_ctx":
            w["ctx"] = 0; sc = blend({**comps, "ctx": ctx_mix(cw)}, w)
        else:
            w["dept"] = 0; w["persona"] = 0; sc = blend({**comps, "ctx": ctx_mix(cw)}, w)
        m, nd = metrics(rec.top_k(sc, K), ev["M"], sub_of, art.n_items)
        ablations.append({"name": name, "label": lab, "description": desc, "ndcg": m["ndcg"],
                          "deltaPct": round(float((nd.mean() / base_nd - 1) * 100), 1)})

    # ---- sensitivity: how much does the top-10 change when one signal changes?
    sens = []
    sidx = rng.choice(len(ev["ctx"]), size=min(400, len(ev["ctx"])), replace=False)
    base_ctx = ev["ctx"].iloc[sidx].reset_index(drop=True)
    base_top = rec.top_k(LTR.rerank(ltr, rec, rec.score(base_ctx, use_demo=False, components=NON_SESSION), base_ctx, False), K)
    dept_arr = np.asarray(art.dept_of)
    aud_arr = np.asarray(art.audience)

    def jacc(a, b):
        return np.mean([len(set(x) & set(y)) / len(set(x) | set(y)) for x, y in zip(a, b)])

    perturb = {
        "region": lambda c: c.assign(geo=np.where(c["geo"] == "California", "New York", "California"),
                                     macro=np.where(c["geo"] == "California", "US Northeast", "US West")),
        "device": lambda c: c.assign(device=np.where(c["device"] == "mobile", "desktop", "mobile")),
        "channel": lambda c: c.assign(channel=np.where(c["channel"] == "Paid Social", "Organic Search", "Paid Social")),
        "daypart": lambda c: c.assign(daypart=np.where(c["daypart"] == "night", "afternoon", "night"), hour=np.where(c["daypart"] == "night", 14, 1)),
    }
    for name, fn in perturb.items():
        c2 = fn(base_ctx)
        top2 = rec.top_k(LTR.rerank(ltr, rec, rec.score(c2, use_demo=False, components=NON_SESSION), c2, False), K)
        sens.append({"signal": name, "label": f"Change {name}", "itemsChangedOf10": round(float(10 * (1 - jacc(base_top, top2))), 1)})
    for gname, gval in (("gender=female", "female"), ("gender=male", "male")):
        c2 = base_ctx.assign(gender=gval, age="25-34")
        r2 = rec.score(c2, use_demo=True, components=NON_SESSION)
        sc = (LTR.rerank(ltr, rec, r2, c2, True) - 0.0)
        sc = (sc - sc.min()) * rec.audience_multiplier(gval)
        top2 = rec.top_k(sc, K)
        want = "women" if gval == "female" else "men"
        sens.append({"signal": gname, "label": f"Declare {gname.split('=')[1]}", "itemsChangedOf10": round(float(10 * (1 - jacc(base_top, top2))), 1),
                     "audienceShareBefore": round(float(np.mean(aud_arr[base_top] == want)), 3),
                     "audienceShareAfter": round(float(np.mean(aud_arr[top2] == want)), 3),
                     "womenDeptShareAfter": round(float(np.mean(dept_arr[top2] == "women")), 3)})

    # ---- classifiers on test visitors
    X1 = F.to_model_frame(F.mask_demographics(ev["ctx"]), art.categories)
    X2 = F.to_model_frame(ev["ctx"], art.categories)
    di = {d: i for i, d in enumerate(art.dept_classes)}
    y_dept = np.array([np.bincount([di[dept_arr[j]] for j in o], minlength=len(di)).argmax() for o in ev["ordered"]])
    prior = np.bincount(y_dept, minlength=len(di)) / len(y_dept)
    classifiers = []
    for lvl, X in (("context", X1), ("context + demographics", X2)):
        p = art.dept_model.predict_proba(X)
        classifiers.append({"name": f"dept_{lvl}", "label": f"Department affinity, {len(di)} classes ({lvl})", "metric": "accuracy",
                            "value": round(float(accuracy_score(y_dept, p.argmax(1))), 4), "baseline": round(float(prior.max()), 4)})
        classifiers.append({"name": f"dept_ll_{lvl}", "label": f"Department affinity ({lvl})", "metric": "log-loss (lower is better)",
                            "value": round(float(log_loss(y_dept, p, labels=range(len(di)))), 4),
                            "baseline": round(float(log_loss(y_dept, np.tile(prior, (len(y_dept), 1)), labels=range(len(di)))), 4)})
    s = tb["sessions"]
    allnew = tb["users"][tb["users"]["first_seen"] >= pd.Timestamp(C.TEST_START)].reset_index(drop=True)
    first_s = s[s["session_idx"] == 0].set_index("uid").reindex(allnew["uid"])
    ctx_all = F.users_to_context(allnew)
    for lvl, cx in (("context", F.mask_demographics(ctx_all)), ("context + demographics", ctx_all)):
        Xa = F.to_model_frame(cx, art.categories)
        for name, col in (("cart", "n_add_to_cart"), ("purchase", "n_purchase")):
            y = (first_s[col].fillna(0).to_numpy() > 0).astype(int)
            p = art.intent_models[name][0].predict_proba(Xa)[:, 1]
            classifiers.append({"name": f"intent_{name}_{lvl}", "label": f"{name.title()} propensity, 1st session ({lvl})",
                                "metric": "ROC-AUC", "value": round(float(roc_auc_score(y, p)), 4), "baseline": 0.5})
    per = tb["personas"].set_index("uid")["persona_cluster"].reindex(allnew["uid"]).to_numpy()
    okp = ~np.isnan(per)
    pp = art.persona_model.predict_proba(F.to_model_frame(ctx_all, art.categories))[okp]
    yp = per[okp].astype(int)
    classifiers.append({"name": "persona", "label": f"Persona membership ({art.persona_count} classes)", "metric": "accuracy",
                        "value": round(float(accuracy_score(yp, pp.argmax(1))), 4), "baseline": round(float(np.bincount(yp).max() / len(yp)), 4)})

    # ---- breakdowns
    main = "hybrid_ltr"
    def breakdown(col, minn=150, top=12):
        out = []
        vals = ev["ctx"][col].to_numpy()
        for v in pd.Series(vals).value_counts().index[:top]:
            msk = vals == v
            if msk.sum() < minn:
                continue
            out.append({col: str(v), "users": int(msk.sum()), "ndcgModel": round(float(per_user[main][msk].mean()), 4),
                        "ndcgPopularity": round(float(per_user["pop"][msk].mean()), 4),
                        "liftPct": round(float((per_user[main][msk].mean() / max(per_user["pop"][msk].mean(), 1e-9) - 1) * 100), 1)})
        return out
    by_gender = []
    for v in ("female", "male"):
        msk = ev["ctx"]["gender"].to_numpy() == v
        by_gender.append({"gender": v, "users": int(msk.sum()), "ndcgPopularity": round(float(per_user["pop"][msk].mean()), 4),
                          "ndcgContextOnly": round(float(per_user["hybrid_ltr"][msk].mean()), 4),
                          "ndcgWithDemographics": round(float(per_user["hybrid_ltr_l2"][msk].mean()), 4),
                          "ndcgAgentAudienceRule": round(float(per_user["hybrid_l2_audience"][msk].mean()), 4)})

    # ---- secondary fold
    art2t = Artifacts(dirs["fold2_tune"])
    sub2 = cat.loc[art2t.items, "subcategory"].to_numpy()
    ev2t = eval_users(tb, art2t, C.FOLD2_TUNE_START, C.VALID_START)
    cfg2 = tune_all(art2t, ev2t, sub2, np.random.default_rng(C.RANDOM_SEED + 1))
    rec2 = configure(art2t, cfg2)
    ltr2 = LTR.train(rec2, rec2.score(ev2t["ctx"], use_demo=True, components=NON_SESSION), ev2t["ctx"], ev2t["truth"], use_demo=True)
    res2, pu2, _ = run_fold(art_v, cfg2, ev_v, sub_v, ltr2, LABELS)
    fold2 = [{"name": r["name"], "label": r["label"], "ndcg": r["metrics"]["ndcg"], "hitRate": r["metrics"]["hitRate"],
              "liftVsPopularityPct": r["liftVsPopularityPct"]} for r in res2 if r["name"] in ("pop", "ctx", "knn", "hybrid_l1", "hybrid_ltr", "hybrid_ltr_l2")]

    # paired bootstrap of the headline lift
    rng2 = np.random.default_rng(7)
    b = per_user["pop"]; h = per_user[main]
    diffs = [h[ix].mean() / b[ix].mean() - 1 for ix in (rng2.integers(0, len(b), len(b)) for _ in range(500))]
    report = {
        "protocol": {
            "trainEnd": C.TEST_START, "testStart": C.TEST_START, "testEnd": str(tb["inter"]["ts"].max())[:10],
            "validationWindow": f"{C.VALID_START} .. {C.TEST_START}", "testUsers": int(len(ev["ctx"])), "warmUsers": int(len(sel)), "k": K,
            "secondaryFold": f"tune on {C.FOLD2_TUNE_START}..{C.VALID_START} (fit < {C.FOLD2_TUNE_START}), test on {C.VALID_START}..{C.TEST_START} (fit < {C.VALID_START})",
            "description": ("Models are fit only on data before the test start. Test visitors are first seen after it, so they have "
                            "no history. Only first-touch context is revealed; ground truth is every catalog item they viewed, "
                            "carted or bought in the test window. Blend and chain weights, alpha, kNN K and the LTR reranker were "
                            "tuned/trained on a separate validation month."),
        },
        "coldStart": results, "warmStart": warm, "classifiers": classifiers, "ablations": ablations, "sensitivity": sens,
        "byChannel": breakdown("channel"), "byDevice": breakdown("device"), "byGeo": breakdown("geo", 300), "byGender": by_gender,
        "secondaryFold": fold2,
        "blendWeights": {**cfg["weights"], "alpha": cfg["alpha"], "knnK": cfg["knn_k"], "genderBoost": cfg["gender_boost"], "transMix": cfg["trans_mix"]},
        "chainWeights": cfg["chain_weights"],
        "ltr": {"bestIteration": ltr["best_iteration"], "trainUsers": ltr["train_users"], "importance": ltr["importance"][:25]},
        "hybridLiftVsPopularity": {"model": main, "pct": round(float(np.mean(diffs) * 100), 1),
                                   "ci95": [round(float(np.percentile(diffs, 2.5) * 100), 1), round(float(np.percentile(diffs, 97.5) * 100), 1)]},
        "validationNdcg": cfg["validationNdcg"], "demoTuning": cfg["demoTuning"], "sessionTuning": cfg["sessionTuning"],
        "seconds": round(time.time() - t0, 1),
    }
    (C.REPORTS_DIR / "evaluation.json").write_text(json.dumps(report, indent=2, default=float), encoding="utf-8")
    serve_cfg = {k: cfg[k] for k in ("weights", "chain_weights", "alpha", "knn_k", "gender_boost", "trans_mix")}
    (C.MODELS_DIR / "blend.json").write_text(json.dumps(serve_cfg, indent=2), encoding="utf-8")
    joblib.dump({"model": ltr["model"], "columns": ltr["columns"], "importance": ltr["importance"]}, C.MODELS_DIR / "ltr.joblib", compress=3)
    log.info("evaluation done in %.1fs", time.time() - t0)
    for r in results + warm:
        log.info("%-45s ndcg=%.4f hr=%.4f lift=%s%%", r["label"], r["metrics"]["ndcg"], r["metrics"]["hitRate"], r["liftVsPopularityPct"])
    return report
