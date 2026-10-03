"""Stage 3 - User segmentation & personas + dashboard insights.

Two complementary segmentations:

* **Engagement segments** (rule-based, computed in ingest): repeat purchaser, one-time purchaser,
  cart abandoner, frequent viewer, window shopper, casual browser, bouncer - exactly the groups the
  brief asks for, and directly actionable for CTA selection.
* **Behavioural personas** (unsupervised): K-Means on standardised behavioural + acquisition features
  (depth, intent, value, department mix, device, channel). k is chosen by silhouette score on a sample.
  Clusters are auto-named from their centroid profile so they stay interpretable for marketers.

For cold start the persona is *predicted* from first-touch context (see train.py), which lets the agent
say "visitors like you usually behave like <persona>" before any behaviour is observed.
"""
from __future__ import annotations

import json
import logging

import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import MiniBatchKMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

from .. import config as C

log = logging.getLogger(__name__)

SEGMENT_INFO = {
    "repeat_purchaser": ("Repeat purchasers", "2+ orders - loyal, high lifetime value."),
    "one_time_purchaser": ("One-time purchasers", "Converted once; prime for a second-order nudge."),
    "cart_abandoner": ("Cart abandoners", "Added to bag but never checked out - high intent, needs reassurance/urgency."),
    "frequent_viewer": ("Frequent viewers", "5+ product views or 3+ sessions without a cart - researching."),
    "window_shopper": ("Window shoppers", "Viewed 1-4 products, no cart."),
    "casual_browser": ("Casual browsers", "Browsed pages/collections but never opened a product."),
    "bouncer": ("Bouncers", "Single short visit (<= 2 events)."),
}

CHANNEL_KEYS = ["Direct", "Organic Search", "Paid Search", "Paid Social", "Email", "Organic Social"]


def user_dept_mix(inter: pd.DataFrame, catalog: pd.DataFrame) -> pd.DataFrame:
    dept = catalog.set_index("item_id")["department"]
    x = inter[["uid", "item_id", "weight"]].copy()
    x["department"] = x["item_id"].map(dept)
    x = x[x["department"].isin(C.DEPARTMENTS)]
    mix = x.pivot_table(index="uid", columns="department", values="weight", aggfunc="sum", fill_value=0)
    return mix.div(mix.sum(axis=1), axis=0)


def build_features(users: pd.DataFrame, mix: pd.DataFrame) -> pd.DataFrame:
    f = pd.DataFrame(index=users["uid"])
    u = users.set_index("uid")
    for c in ["n_sessions", "n_events", "n_view_item", "n_add_to_cart", "n_purchase", "revenue", "n_items", "total_duration_s"]:
        f[f"log_{c}"] = np.log1p(u[c].astype(float).clip(lower=0))
    f["cart_rate"] = (u["n_add_to_cart"] / u["n_view_item"].clip(lower=1)).clip(0, 1)
    for d in C.DEPARTMENTS:
        f[f"share_{d}"] = mix.get(d, pd.Series(dtype=float)).reindex(f.index).fillna(0)
    ctx = pd.DataFrame(index=f.index)
    ctx["mobile"] = (u["device"] == "mobile").astype(float)
    for ch in CHANNEL_KEYS:
        ctx[f"ch_{ch}"] = (u["channel"] == ch).astype(float)
    return f, ctx


def _name_persona(p: dict, g: dict) -> tuple[str, str, str]:
    """Auto-name a persona from its centroid profile relative to global averages."""
    conv, cart, views = p["conversion_rate"], p["cart_rate_users"], p["avg_item_views"]
    if conv > 3 * g["conversion_rate"]:
        core, tag = "Decisive Buyers", "Arrive with intent and convert"
    elif cart > 2 * g["cart_rate_users"]:
        core, tag = "Cart Hesitators", "Build a bag, hesitate at checkout"
    elif views > 2 * g["avg_item_views"]:
        core, tag = "Deep Researchers", "Compare many products before committing"
    elif views > 0.6 * g["avg_item_views"]:
        core, tag = "Window Shoppers", "Browse a few products for inspiration"
    else:
        core, tag = "Quick Glancers", "Short visits, need an instant hook"
    dept = max(p["department_mix"], key=p["department_mix"].get) if p["department_mix"] else None
    dshare = p["department_mix"].get(dept, 0) if dept else 0
    ch = max(p["channel_mix"], key=p["channel_mix"].get)
    chshare = p["channel_mix"][ch]
    mods = []
    ch_word = {"Email": "Email-Loyal", "Paid Social": "Social-Discovered", "Organic Social": "Social-Discovered",
               "Paid Search": "Search-Led", "Organic Search": "Search-Led", "Direct": "Direct"}.get(ch)
    if ch_word and chshare > 0.55:
        mods.append(ch_word)
    if p["mobile_share"] > 0.75:
        mods.append("Mobile")
    dept_word = {"women": "Womenswear", "men": "Menswear", "accessories": "Accessory", "footwear": "Footwear",
                 "watches": "Watch", "jewellery": "Jewellery"}.get(dept)
    if dept_word and dshare > 0.5:
        mods.append(dept_word)
    name = " ".join(mods[:2] + [core])
    desc = (f"{tag}. {round(p['share'] * 100, 1)}% of visitors; conversion {round(p['conversion_rate'] * 100, 2)}% "
            f"(site avg {round(g['conversion_rate'] * 100, 2)}%), {round(p['avg_item_views'], 1)} product views on average; "
            f"top channel {ch} ({round(chshare * 100)}%), {round(p['mobile_share'] * 100)}% mobile.")
    return name, tag, desc


def run() -> dict:
    users = pd.read_parquet(C.PROCESSED_DIR / "users.parquet")
    inter = pd.read_parquet(C.PROCESSED_DIR / "interactions.parquet")
    catalog = pd.read_parquet(C.PROCESSED_DIR / "catalog.parquet")
    sessions = pd.read_parquet(C.PROCESSED_DIR / "sessions.parquet")
    tx = pd.read_parquet(C.PROCESSED_DIR / "transactions.parquet")
    dq = json.loads((C.REPORTS_DIR / "data_quality.json").read_text(encoding="utf-8"))
    cat_rep = json.loads((C.REPORTS_DIR / "catalog_report.json").read_text(encoding="utf-8"))

    mix = user_dept_mix(inter, catalog)
    beh, ctx = build_features(users, mix)
    X = pd.concat([beh, ctx * 0.6], axis=1)  # acquisition context down-weighted vs behaviour
    scaler = StandardScaler().fit(X)
    Xs = scaler.transform(X).astype(np.float32)

    rng = np.random.default_rng(C.RANDOM_SEED)
    sample = rng.choice(len(Xs), size=min(40000, len(Xs)), replace=False)
    scores = {}
    for k in range(5, 10):
        km = MiniBatchKMeans(n_clusters=k, random_state=C.RANDOM_SEED, batch_size=8192, n_init=5).fit(Xs)
        scores[k] = float(silhouette_score(Xs[sample], km.predict(Xs[sample])))
        log.info("k=%s silhouette=%.4f", k, scores[k])
    best_k = max(scores, key=scores.get)
    km = MiniBatchKMeans(n_clusters=best_k, random_state=C.RANDOM_SEED, batch_size=8192, n_init=10).fit(Xs)
    users["persona_cluster"] = km.predict(Xs)

    # ---- persona profiles
    u = users.set_index("uid")
    u = u.join(mix.add_prefix("mix_"))
    g = {
        "conversion_rate": float((u["n_purchase"] > 0).mean()),
        "cart_rate_users": float((u["n_add_to_cart"] > 0).mean()),
        "avg_item_views": float(u["n_view_item"].mean()),
    }
    personas = []
    for c, grp in u.groupby("persona_cluster"):
        dm = {d: float(grp[f"mix_{d}"].mean()) for d in C.DEPARTMENTS if f"mix_{d}" in grp and grp[f"mix_{d}"].notna().any()}
        tot = sum(dm.values()) or 1
        dm = {k: v / tot for k, v in dm.items()}
        p = {
            "cluster": int(c), "users": int(len(grp)), "share": len(grp) / len(u),
            "conversion_rate": float((grp["n_purchase"] > 0).mean()),
            "cart_rate_users": float((grp["n_add_to_cart"] > 0).mean()),
            "avg_item_views": float(grp["n_view_item"].mean()),
            "avg_sessions": float(grp["n_sessions"].mean()),
            "avg_revenue": float(grp["revenue"].mean()),
            "mobile_share": float((grp["device"] == "mobile").mean()),
            "department_mix": dm,
            "channel_mix": grp["channel"].value_counts(normalize=True).head(4).to_dict(),
            "segment_mix": grp["segment"].value_counts(normalize=True).head(4).to_dict(),
        }
        p["name"], p["tagline"], p["description"] = _name_persona(p, g)
        personas.append(p)
    # disambiguate duplicate names
    seen: dict = {}
    for p in sorted(personas, key=lambda x: -x["users"]):
        base = p["name"]
        seen[base] = seen.get(base, 0) + 1
        if seen[base] > 1:
            p["name"] = f"{base} {['', '', 'II', 'III', 'IV', 'V'][min(seen[base], 5)]}"
    for p in personas:
        p["id"] = f"p{p['cluster']}"
        # stage recommendation used by the agent
        p["default_stage"] = "buy_now" if p["conversion_rate"] > 2 * g["conversion_rate"] or p["cart_rate_users"] > 2 * g["cart_rate_users"] \
            else ("explore" if p["avg_item_views"] > 0.6 * g["avg_item_views"] else "discover")
        top = (inter[inter["uid"].isin(u.index[u["persona_cluster"] == p["cluster"]])]
               .groupby("item_id")["weight"].sum().sort_values(ascending=False))
        disp = set(catalog.loc[catalog["displayable"], "item_id"])
        p["top_items"] = [i for i in top.index if i in disp][:8]

    users[["uid", "persona_cluster"]].to_parquet(C.PROCESSED_DIR / "user_personas.parquet", index=False)
    joblib.dump({"scaler": scaler, "kmeans": km, "columns": list(X.columns)}, C.MODELS_DIR / "persona_kmeans.joblib")
    (C.MODELS_DIR / "personas.json").write_text(json.dumps(personas, indent=2, default=float), encoding="utf-8")

    insights = _insights(users, sessions, tx, inter, catalog, personas, dq, cat_rep, scores, best_k)
    (C.REPORTS_DIR / "insights.json").write_text(json.dumps(insights, indent=2, default=float), encoding="utf-8")
    log.info("personas: %s", [(p["name"], p["users"]) for p in personas])
    return {"k": best_k, "silhouette": scores}


def _insights(users, sessions, tx, inter, catalog, personas, dq, cat_rep, sil, k) -> dict:
    orders = sessions["n_purchase"].gt(0)
    ov = {
        "events": dq["events_clean"], "users": int(len(users)), "sessions": int(len(sessions)),
        "transactions": int(tx["transaction_id"].nunique()), "revenue": round(float(tx["revenue"].sum()), 2),
        "items": int(catalog["displayable"].sum()), "dateRange": dq["date_range"],
    }
    n = len(sessions)
    funnel = [
        {"stage": "Sessions", "sessions": n},
        {"stage": "Viewed a product", "sessions": int((sessions["n_view_item"] > 0).sum())},
        {"stage": "Added to bag", "sessions": int((sessions["n_add_to_cart"] > 0).sum())},
        {"stage": "Purchased", "sessions": int(orders.sum())},
    ]
    for f in funnel:
        f["rate"] = round(f["sessions"] / n, 4)

    def by(col, name):
        s = sessions.groupby(col, observed=True).agg(
            sessions=("sid", "size"), users=("uid", "nunique"),
            cart=("n_add_to_cart", lambda x: (x > 0).mean()), conv=("n_purchase", lambda x: (x > 0).mean()),
            revenue=("revenue", "sum"))
        s = s.sort_values("sessions", ascending=False).reset_index()
        return [{name: str(r[col]), "users": int(r["users"]), "sessions": int(r["sessions"]),
                 "cartRate": round(float(r["cart"]), 4), "conversionRate": round(float(r["conv"]), 4),
                 "revenue": round(float(r["revenue"]), 2)} for _, r in s.iterrows()]

    geo = sessions.groupby("geo", observed=True).agg(users=("uid", "nunique"), conv=("n_purchase", lambda x: (x > 0).mean()))
    geo = geo.sort_values("users", ascending=False).head(15).reset_index()
    hourly = sessions.groupby("hour").agg(sessions=("sid", "size"), conv=("n_purchase", lambda x: (x > 0).mean())).reset_index()

    seg = users.groupby("segment").agg(users=("uid", "size"), conv=("n_purchase", lambda x: (x > 0).mean()), rev=("revenue", "mean"))
    segments = [{"id": s, "label": SEGMENT_INFO[s][0], "description": SEGMENT_INFO[s][1], "users": int(r["users"]),
                 "share": round(r["users"] / len(users), 4), "conversionRate": round(float(r["conv"]), 4),
                 "avgRevenue": round(float(r["rev"]), 2)} for s, r in seg.sort_values("users", ascending=False).iterrows()]

    dept = catalog.set_index("item_id")["department"]
    it = inter.assign(department=inter["item_id"].map(dept))
    txd = tx.assign(department=tx["item_id"].map(dept))
    departments = []
    for d, lab in C.DEPARTMENTS.items():
        departments.append({"department": d, "label": lab,
                            "views": int(((it["department"] == d) & (it["event"] == "view_item")).sum()),
                            "carts": int(((it["department"] == d) & (it["event"] == "add_to_cart")).sum()),
                            "orders": int(txd.loc[txd["department"] == d, "transaction_id"].nunique()),
                            "revenue": round(float(txd.loc[txd["department"] == d, "revenue"].sum()), 2)})

    pers = [{"id": p["id"], "name": p["name"], "tagline": p["tagline"], "description": p["description"],
             "users": p["users"], "share": round(p["share"], 4), "conversionRate": round(p["conversion_rate"], 4),
             "topDepartments": [{"department": k, "share": round(v, 3)} for k, v in sorted(p["department_mix"].items(), key=lambda x: -x[1])],
             "topChannels": [{"channel": k, "share": round(v, 3)} for k, v in p["channel_mix"].items()],
             "topItemIds": p["top_items"][:4], "defaultStage": p["default_stage"]} for p in sorted(personas, key=lambda x: -x["users"])]

    dq_small = {k: v for k, v in dq.items() if k not in ("channel_mapping",)}
    return {
        "overview": ov, "dataQuality": dq_small, "funnel": funnel,
        "channels": by("channel", "channel"), "devices": by("device", "device"),
        "geo": [{"geo": str(r["geo"]), "users": int(r["users"]), "conversionRate": round(float(r["conv"]), 4)} for _, r in geo.iterrows()],
        "hourly": [{"hour": int(r["hour"]), "sessions": int(r["sessions"]), "conversionRate": round(float(r["conv"]), 4)} for _, r in hourly.iterrows()],
        "segments": segments, "personas": pers, "departments": departments,
        "catalog": {**cat_rep.get("catalog", {}), "categoryInference": cat_rep.get("category_inference"), "markdowns": cat_rep.get("markdowns")},
        "clustering": {"k": k, "silhouette": sil},
    }
