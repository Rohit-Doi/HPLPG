"""The Landing Page Generator Agent.

perceive -> infer -> plan -> compose -> explain (-> learn)

1. perceive : resolve raw request signals into the cold-start context (and cold-start level 0-3)
2. infer    : hybrid recommender + LTR reranker, department affinity, persona, intent stage, back-off path
3. plan     : pick a layout template by intent stage (discover / explore / buy_now) and device, then let the
              online bandit re-order the movable modules from live click evidence
4. compose  : fill each module (hero, carousels, tiles, bundle, deals, CTA) with de-duplicated,
              diversity-aware products; write hero copy (templates or Claude)
5. explain  : every module and product carries a reason; the full decision trace is returned
6. learn    : impressions/clicks flow back into the bandit and the A/B experiment (see bandit.py)
"""
from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from .. import config as C
from ..pipeline.catalog import product_record
from ..store import promotions as PR
from . import copywriter, features as F, ltr as LTR
from .bandit import ExperimentState
from .context import LEVEL_LABELS, resolve
from .recommender import Artifacts, Recommender

ACCENT = {"women": "#db2777", "men": "#2563eb", "footwear": "#0f766e", "watches": "#4338ca", "jewellery": "#b45309", "accessories": "#be123c"}
STAGE_LABEL = {"discover": "Discover - new & curious", "explore": "Explore - comparing options", "buy_now": "Buy now - high intent"}
WHY = {
    "ctx": "Popular with {channel} visitors{geo}",
    "knn": "Loved by shoppers similar to you",
    "persona": "A favourite of {persona}",
    "trend": "Trending this week",
    "pop": "All-time bestseller",
    "dept": "Matches your predicted interest in {dept}",
    "session": "Often viewed with what you just browsed",
}
NORTH = {"United States", "Canada", "United Kingdom", "Germany", "France", "India", "Mexico", "Philippines", "Japan", "Ireland", "Netherlands", "Sweden", "Spain"}
SOUTH = {"Australia", "New Zealand", "South Africa", "Argentina", "Brazil", "Chile"}


def season_for(month: int, country: str | None) -> str | None:
    if country in SOUTH:
        month = (month + 6 - 1) % 12 + 1
    elif country not in NORTH:
        return None
    return {12: "Winter", 1: "Winter", 2: "Winter", 3: "Spring", 4: "Spring", 5: "Spring", 6: "Summer", 7: "Summer", 8: "Summer",
            9: "Fall", 10: "Fall", 11: "Fall"}[month]


class LandingPageAgent:
    def __init__(self, model_dir: Path = C.MODELS_DIR):
        t = time.time()
        self.art = Artifacts(model_dir)
        blend = json.loads((model_dir / "blend.json").read_text(encoding="utf-8")) if (model_dir / "blend.json").exists() else {}
        self.rec = Recommender(self.art, weights=blend.get("weights"), alpha=blend.get("alpha", 30.0), chain_weights=blend.get("chain_weights"),
                               knn_k=blend.get("knn_k", 300), gender_boost=blend.get("gender_boost", 3.0), trans_mix=blend.get("trans_mix", 0.5))
        self.blend = blend
        self.ltr = joblib.load(model_dir / "ltr.joblib") if (model_dir / "ltr.joblib").exists() and blend.get("use_ltr", True) else None
        self.audience_strength = float(blend.get("audience_strength", 0.3))
        cat = pd.read_parquet(C.PROCESSED_DIR / "catalog.parquet")
        self.catalog = cat
        self.products = {r["item_id"]: product_record(r) for _, r in cat[cat["displayable"]].iterrows()}
        self.personas = json.loads((C.MODELS_DIR / "personas.json").read_text(encoding="utf-8"))
        self.persona_by_cluster = {p["cluster"]: p for p in self.personas}
        items = self.art.items
        self.sub_of = np.array([self.products[i]["subcategory"] for i in items])
        self.dept_of = np.asarray(self.art.dept_of)
        self.aud_of = np.asarray(self.art.audience)
        self.on_sale = np.array([self.products[i]["onSale"] for i in items])
        self.dept_prior = {d: float(self.art.pop[self.dept_of == d].sum()) for d in self.art.dept_classes}
        self.experiments = ExperimentState(C.EVENTS_DIR / "events.jsonl")
        bp, sp = C.FRONTEND_DATA / "banners.json", C.FRONTEND_DATA / "storefront.json"
        self.banners = json.loads(bp.read_text(encoding="utf-8")) if bp.exists() else []
        self.storefront = json.loads(sp.read_text(encoding="utf-8")) if sp.exists() else {}
        self.brand_of = np.array([self.products[i]["brand"] for i in items])
        self.load_seconds = round(time.time() - t, 2)

    # ------------------------------------------------------------------ helpers
    def _p(self, j: int, why: str | None = None, score: float | None = None) -> dict:
        p = dict(self.products[self.art.items[j]])
        if why:
            p["why"] = why
        if score is not None:
            p["score"] = round(float(max(min(score, 1.0), 0.0)), 3)
        return p

    def _why(self, j: int, comps: dict, rc: dict, persona_name: str) -> str:
        best, val = "pop", -1.0
        for k, v in comps.items():
            w = self.rec.weights.get(k, 0)
            c = w * float(v[0, j]) / max(float(v[0].max()), 1e-12)
            if c > val:
                best, val = k, c
        geo = f" in {rc['geo']}" if rc["geo"] not in ("Unknown", "") else ""
        return WHY[best].format(channel=rc["channel"], geo=geo, persona=persona_name, dept=C.DEPARTMENTS.get(self.dept_of[j], ""))

    def _pick(self, order: np.ndarray, used: set, n: int, mask: np.ndarray | None = None, max_per_sub: int = 3) -> list[int]:
        """Greedy diversity-aware selection (limits items per subcategory) with cross-module de-duplication."""
        out, per = [], {}
        for j in order:
            j = int(j)
            if j in used or (mask is not None and not mask[j]):
                continue
            s = self.sub_of[j]
            if per.get(s, 0) >= max_per_sub:
                continue
            out.append(j)
            per[s] = per.get(s, 0) + 1
            if len(out) >= n:
                break
        if len(out) < n:
            for j in order:
                j = int(j)
                if j not in used and j not in out and (mask is None or mask[j]):
                    out.append(j)
                    if len(out) >= n:
                        break
        used.update(out)
        return out

    # ------------------------------------------------------------------ main
    def generate(self, req: dict) -> dict:
        t0 = time.perf_counter()
        trace = []

        def step(name, detail, t_start):
            trace.append({"step": name, "detail": detail, "durationMs": round((time.perf_counter() - t_start) * 1000, 1)})

        opts = req.get("options") or {}
        session = req.get("session") or {}
        viewed = [i for i in (session.get("viewedItems") or []) if i in self.art.item_idx]
        carted = [i for i in (session.get("cartedItems") or []) if i in self.art.item_idx]
        hist = req.get("history") or {}
        h_viewed = [i for i in hist.get("viewed", []) if i in self.art.item_idx and i not in viewed][:20]
        h_carted = [i for i in hist.get("carted", []) if i in self.art.item_idx][:10]
        h_bought = [i for i in hist.get("purchased", []) if i in self.art.item_idx][:20]
        user = req.get("user") or {}
        returning = bool(h_viewed or h_carted or h_bought)
        variant, bucket = self.experiments.variant_for(req.get("visitorId"), opts.get("variant"))

        # 1. perceive
        t = time.perf_counter()
        rc = resolve(req.get("context") or {}, session)
        row = rc.row
        gender = row["gender"] if row["gender"] in ("female", "male") else None
        pref = row.get("_preferred")
        if returning:
            rc.level = 4
            rc.signals.append(f"Returning customer: {len(h_viewed)} viewed, {len(h_carted)} bagged, {len(h_bought)} bought in the last 90 days"
                              + (f"; profile of {user.get('name') or 'member'}" if user else ""))
        step("Perceive", f"Cold-start level {rc.level} ({LEVEL_LABELS[rc.level]}); experiment variant '{variant}'. " + "; ".join(rc.signals), t)

        # 2. infer
        t = time.perf_counter()
        frame = pd.DataFrame([{k: row[k] for k in F.CAT_FEATURES + F.NUM_FEATURES}])
        sess_items = list(dict.fromkeys(carted + viewed))
        graph_items = list(dict.fromkeys(sess_items + h_carted + h_viewed + h_bought))   # history after this session -> lower decay
        res = self.rec.score(frame, session_items=[graph_items] if graph_items else None, use_demo=rc.declared_demo, want_trace=True)
        comps = {k: np.asarray(v)[:1] for k, v in res.components.items()}
        live = None
        try:
            from ..store.ops import live_trend_vector
            live = live_trend_vector(self.art.items)
        except Exception:  # noqa: BLE001
            live = None
        if live is not None and "trend" in comps:
            comps["trend"] = (0.6 * comps["trend"] + 0.4 * live[None, :]).astype(np.float32)   # live clicks refresh "trending" without a retrain
            res.scores[0] += self.rec.weights.get("trend", 0) * 0.4 * (live - np.asarray(self.art.trend))
        excl = {self.art.item_idx[i] for i in sess_items} | {self.art.item_idx[i] for i in h_bought}
        used_ltr = False
        if variant == "control":
            scores = np.asarray(self.art.pop, dtype=np.float32).copy()
        else:
            if self.ltr is not None and not graph_items:
                scores = LTR.rerank(self.ltr, self.rec, res, frame, use_demo=rc.declared_demo)[0].copy()
                scores = scores - scores[scores > -500].min()          # candidates >= 0, non-candidates stay far below
                used_ltr = True
            else:
                scores = res.scores[0].copy()
            if gender or pref:
                # soft merchandising nudge on the main ranking (strength tuned on the validation month);
                # the dedicated "For her / For him" module applies the hard audience filter
                mult = self.rec.audience_multiplier(gender, pref, self.audience_strength if not pref else 1.0)
                scores = np.where(scores >= 0, scores * mult, scores)
        step("Score catalog", f"{'Popularity-only control' if variant == 'control' else 'Hybrid blend of ' + ', '.join(k for k in comps if self.rec.weights.get(k, 0) > 0)}"
             + (" -> LambdaRank reranker over top-50" if used_ltr else "") + (f"; audience nudge x{self.audience_strength:g} for {gender}" if gender and not pref and variant != 'control' else "") + (f"; declared interest {pref}" if pref and variant != 'control' else "")
             + f" over {self.art.n_items} items", t)

        t = time.perf_counter()
        dept_aff = {d: float(p) for d, p in zip(self.art.dept_classes, res.dept_proba[0])}
        if gender and self.art.dept_by_gender.get(gender):
            dg = self.art.dept_by_gender[gender]
            dept_aff = {d: 0.5 * v + 0.5 * dg.get(d, 0.0) for d, v in dept_aff.items()}
            # merchandising rule: a declared gender leads with its own apparel department (documented trade-off)
            lead = "women" if gender == "female" else "men"
            dept_aff[lead] = dept_aff.get(lead, 0.0) + 0.5
        if pref:
            dept_aff = {d: 0.3 * v + (0.7 if d == pref else 0.0) for d, v in dept_aff.items()}
        if graph_items:
            mix = pd.Series([self.dept_of[self.art.item_idx[i]] for i in graph_items]).value_counts(normalize=True)
            dept_aff = {d: 0.4 * v + 0.6 * float(mix.get(d, 0)) for d, v in dept_aff.items()}
        tot = sum(dept_aff.values()) or 1
        dept_aff = {d: v / tot for d, v in dept_aff.items()}
        dept_rank = sorted(dept_aff, key=dept_aff.get, reverse=True)
        top_dept = dept_rank[0]
        pp = res.persona_proba[0]
        order_p = np.argsort(-pp)
        persona = self.persona_by_cluster.get(int(order_p[0]), self.personas[0])
        pc = float(res.intent["cart"][0]); pbuy = float(res.intent["purchase"][0])
        bc = self.art.intent_models["cart"][1]; bb = self.art.intent_models["purchase"][1]
        lift = max(pc / bc, pbuy / bb)
        if carted or h_carted or pc >= 2.5 * bc or pbuy >= 2.5 * bb:
            stage = "buy_now"
        elif viewed or returning or pc >= 1.0 * bc or row["landing"] in ("products", "collections", "search"):
            stage = "explore"
        else:
            stage = "discover"
        order = np.argsort(-scores)
        sub_scores: dict = {}
        top40 = order[:40]
        for r_, j in enumerate(top40):
            sub_scores[(self.sub_of[j], self.dept_of[j])] = sub_scores.get((self.sub_of[j], self.dept_of[j]), 0) + 1.0 / (r_ + 3)
        tot = sum(sub_scores.values()) or 1
        sub_aff = sorted(({"subcategory": s, "department": d, "score": round(v / tot, 3)} for (s, d), v in sub_scores.items()),
                         key=lambda x: -x["score"])[:8]
        season = season_for(row["month"], row["_country"])
        step("Infer visitor", f"Persona '{persona['name']}' ({pp[order_p[0]]:.0%}); stage {stage} "
             f"(cart propensity {pc:.1%} vs {bc:.1%} baseline); top department {top_dept} ({dept_aff[top_dept]:.0%})"
             + (f"; season {season}" if season else ""), t)

        # 3-4. plan & compose
        t = time.perf_counter()
        is_mobile = row["device"] == "mobile"
        n_car = 8 if is_mobile else 12
        used: set = set(excl)
        persona_name = persona["name"]
        geo_known = row["geo"] not in ("Unknown", "")
        region_label = row["geo"] if geo_known else None
        smax = float(scores[order[0]]) or 1.0
        mods: dict = {}

        def carousel(mid, title, subtitle, idx, strategy, reason, signals=None, href=None, why_fn=None):
            return {"id": mid, "type": "product_carousel", "title": title, "subtitle": subtitle, "strategy": strategy,
                    "reason": reason, "signals": signals or [], "viewAllHref": href,
                    "products": [self._p(j, why_fn(j) if why_fn else self._why(j, comps, row, persona_name), scores[j] / smax) for j in idx]}

        hero_idx = self._pick(order, used, 3, mask=self.dept_of == top_dept, max_per_sub=1)
        top_sub = self.sub_of[hero_idx[0]] if hero_idx else None
        fallback = copywriter.template_copy(stage, top_dept, top_sub, row["channel"], row["daypart"], region_label)
        if season and region_label:
            fallback["eyebrow"] = f"{season} in {region_label}"
        copy = fallback
        # Claude copy whenever a key is configured: blocking only when the caller explicitly asks (Lab),
        # otherwise non-blocking (template now, Claude copy cached for the next visitor of this archetype).
        use_llm = opts.get("useLlm")
        if use_llm is not False and copywriter.llm_available():
            copy = (copywriter.llm_copy if use_llm else copywriter.llm_copy_async)({"stage": stage, "department": top_dept, "subcategory": top_sub, "channel": row["channel"],
                                        "daypart": row["daypart"], "region": region_label, "persona": persona_name, "season": season,
                                        "gender": gender, "device": row["device"], "offer": f"10% off first order with WELCOME10; free delivery over {PR.rupees(PR.FREE_SHIPPING_OVER)}", "currency": "INR"}, fallback)
        mods["hero"] = {
            "id": "hero", "type": "hero", "eyebrow": copy["eyebrow"], "title": copy["title"], "subtitle": copy["subtitle"],
            "image": self.products[self.art.items[hero_idx[0]]]["image"] if hero_idx else "", "department": top_dept,
            "cta": {"label": copy["cta"], "href": f"/shop/{top_dept}"},
            "secondaryCta": {"label": f"Explore {C.DEPARTMENTS[dept_rank[1]]}" if len(dept_rank) > 1 else "View bestsellers", "href": "/shop/" + (dept_rank[1] if len(dept_rank) > 1 else top_dept)},
            "products": [self._p(j, self._why(j, comps, row, persona_name)) for j in hero_idx],
            "strategy": f"department_affinity+{copy.get('source', 'template')}",
            "reason": f"{C.DEPARTMENTS[top_dept]} has the highest inferred affinity ({dept_aff[top_dept]:.0%}, "
                      f"{dept_aff[top_dept] / max(self.dept_prior.get(top_dept, 1e-9), 1e-9):.2f}x the site average"
                      + (f"; blended with P(department | {gender})" if gender else "") + (f"; declared interest {pref}" if pref else "")
                      + f"). Copy tuned to stage '{stage}'.",
            "signals": rc.signals[:3],
        }

        if stage == "discover":
            ann = ("New here? Take 10% off your first order with code WELCOME10", "promo")
        elif stage == "explore":
            ann = (f"Free delivery on orders over {PR.rupees(PR.FREE_SHIPPING_OVER)} · Easy 30-day returns", "info")
        else:
            ann = ("Your bag ships free today - complete checkout in 2 taps", "urgency") if carted else (f"Free delivery on orders over {PR.rupees(PR.FREE_SHIPPING_OVER)} · Express in 1-2 days", "urgency")
        if row["channel"] == "Email":
            ann = ("Subscriber perk: early access to this week's drop", "promo")
        mods["announcement"] = {"id": "announcement", "type": "announcement", "text": ann[0], "tone": ann[1],
                                "strategy": f"stage:{stage}", "reason": f"Message matched to intent stage '{stage}' and channel {row['channel']}."}

        if sess_items:
            sj = [self.art.item_idx[i] for i in sess_items][:n_car]
            mods["recall"] = {"id": "recall", "type": "product_carousel", "title": "Pick up where you left off",
                              "subtitle": "Items you viewed this visit", "strategy": "session_recall",
                              "reason": "Level-3 warm start: the visitor has already interacted with these products.",
                              "products": [self._p(j, "In your bag" if self.art.items[j] in carted else "Recently viewed") for j in sj]}

        rec_idx = self._pick(order, used, n_car)
        title = {0: "Trending right now", 1: "Picked for you", 2: "Picked for you", 3: "Inspired by what you viewed", 4: "Picked for you, from your history"}[rc.level]
        mods["recommended"] = carousel("recommended", title,
                                       f"Personalised for {row['device']} · {row['channel']}" + (f" · {region_label}" if region_label else ""),
                                       rec_idx, "hybrid_blend" + ("+ltr" if used_ltr else "") + ("+audience_rule" if gender or pref else ""),
                                       ("Popularity-only control page (A/B experiment)." if variant == "control" else
                                        "Top items from the tuned hybrid blend" + (" re-ranked by the LambdaRank model" if used_ltr else "")
                                        + " (context priors + similar visitors + persona + trend" + (" + in-session graph" if sess_items else "")
                                        + "), diversified across subcategories."),
                                       rc.signals, "/shop/" + top_dept)

        # audience edit for declared gender / interest (Level 2)
        if (gender or pref) and variant != "control":
            want = pref or ("women" if gender == "female" else "men")
            mask = (self.dept_of == want) if pref else np.isin(self.aud_of, [want, "unisex"])
            a_idx = self._pick(order, used, n_car, mask=mask)
            lab = C.DEPARTMENTS.get(want, want)
            mods["audience"] = carousel("audience", f"The {lab} edit" if pref else ("For her" if gender == "female" else "For him"),
                                        "Because you told us what you're shopping for", a_idx, "declared_interest",
                                        f"Level-2 signal: {'declared interest ' + pref if pref else 'declared gender ' + gender}. Items whose target audience matches, ranked by the blended score.",
                                        why_fn=lambda j: f"Made for {'women' if self.aud_of[j] == 'women' else 'men' if self.aud_of[j] == 'men' else 'everyone'}")

        # department tiles (6 departments ranked by affinity)
        dtiles = []
        for d in dept_rank:
            js = [j for j in order if self.dept_of[j] == d]
            if js:
                dtiles.append({"label": C.DEPARTMENTS[d], "subtitle": f"{dept_aff[d]:.0%} affinity", "href": f"/shop/{d}",
                               "image": self.products[self.art.items[js[0]]]["image"], "score": round(dept_aff[d], 3)})
        mods["departments"] = {"id": "departments", "type": "category_tiles", "title": "Shop by department", "tiles": dtiles,
                               "strategy": "department_affinity", "reason": "Departments ordered by inferred affinity (LightGBM on first-touch context"
                               + (", blended with declared attributes" if gender or pref else "") + ")."}
        tiles = []
        for s_ in sub_aff[:6]:
            m = (self.sub_of == s_["subcategory"]) & (self.dept_of == s_["department"])
            js = [j for j in order if m[j]]
            if js:
                tiles.append({"label": s_["subcategory"], "subtitle": C.DEPARTMENTS[s_["department"]],
                              "href": f"/shop/{s_['department']}?sub={s_['subcategory']}", "image": self.products[self.art.items[js[0]]]["image"], "score": s_["score"]})
        mods["tiles"] = {"id": "tiles", "type": "category_tiles", "title": "Categories for you", "tiles": tiles,
                         "strategy": "subcategory_affinity", "reason": "Subcategories ranked by rank-weighted share of the visitor's top-40 scored items."}

        place = res.chains.get("place")
        loc_order = np.argsort(-(place[0] if place is not None else comps["ctx"][0])) if "ctx" in comps else order
        mods["local"] = carousel("local", f"Trending in {region_label}" if region_label else "Trending with visitors like you",
                                 ("What shoppers in " + region_label + " are into right now") if region_label else
                                 "What people arriving " + {"Paid Social": "from social ads", "Organic Social": "from social", "Email": "from our emails",
                                                           "Paid Search": "from search ads", "Organic Search": "from search"}.get(row["channel"], "right now") + f" on {row['device']} are into",
                                 self._pick(loc_order, used, n_car), "location_backoff_priors" if place is not None else "context_backoff_priors",
                                 ("Location prior P(item | state -> census region -> global) with Dirichlet back-off: " if place is not None else "Context prior: ")
                                 + " -> ".join(f"{b['level']}({b['support']})" for b in res.backoff[0] if b["support"] > 0 and (place is None or b["level"].startswith(("geo", "macro"))))[:220],
                                 why_fn=lambda j: (f"Popular in {region_label}" if region_label else WHY["ctx"].format(channel=row["channel"], geo="")))

        sim = comps.get("knn", comps.get("persona"))
        sim_order = np.argsort(-(sim[0] + comps.get("persona", sim)[0]))
        mods["similar"] = carousel("similar", "Popular with shoppers like you", f"Visitors who look like you usually become '{persona_name}'",
                                   self._pick(sim_order, used, n_car), "knn_similar_visitors+persona",
                                   f"Items of the {self.rec.knn_k} most similar historical visitors (feature weights learned by mutual information"
                                   + (f", gender weight x{self.rec.gender_boost:g} because it was declared" if gender else "") + ") blended with the predicted persona's item mix.",
                                   why_fn=lambda j: WHY["knn"])

        deal_idx = self._pick(order, used, n_car, mask=self.on_sale)
        if deal_idx:
            mods["deals"] = carousel("deals", "Late-night deals" if row["daypart"] == "night" else "Deals picked for you",
                                     "Real markdowns detected from recent transaction prices", deal_idx, "markdowns_ranked_by_affinity",
                                     "On-sale items (recent price >= 7% below reference price) ranked by the visitor's blended scores.",
                                     href="/sale", why_fn=lambda j: f"{self.products[self.art.items[j]]['discountPct']}% below its usual price")

        anchor_candidates = [self.art.item_idx[i] for i in sess_items] + [int(j) for j in order[:20]]
        for a_ in anchor_candidates:
            if a_ in self.art.copurchase:
                nb, cnt, lf = self.art.copurchase[a_]
                its = [(int(j), float(c), float(l)) for j, c, l in zip(nb, cnt, lf) if int(j) != a_][:3]
                if its:
                    anchor = self._p(a_)
                    items_ = [self._p(j, f"Bought together {int(c)}x (lift {l:.1f})") for j, c, l in its]
                    mods["bundle"] = {"id": "bundle", "type": "bundle", "title": "Complete the look", "subtitle": "Frequently bought together",
                                      "anchor": anchor, "items": items_, "totalPrice": round(anchor["price"] + sum(p["price"] for p in items_), 2),
                                      "strategy": "copurchase_lift", "reason": "Co-purchase pairs from transaction baskets ranked by support x log(lift)."}
                    break

        if len(dept_rank) > 1:
            d2 = dept_rank[1]
            mods["dept2"] = carousel("dept2", f"Bestsellers in {C.DEPARTMENTS[d2]}", "Broaden the edit",
                                     self._pick(np.argsort(-comps["trend"][0]), used, n_car, mask=self.dept_of == d2), "exploration_second_department",
                                     f"Exploration slot: second-highest department affinity ({dept_aff[d2]:.0%}) to avoid a filter bubble.",
                                     href=f"/shop/{d2}", why_fn=lambda j: WHY["trend"])

        if stage == "discover":
            cta = {"variant": "newsletter", "title": "10% off your first order", "subtitle": "Join AURA for early access to new drops and members-only edits.",
                   "cta": {"label": "Unlock 10% off", "href": "/shop/" + top_dept}, "code": "WELCOME10"}
        elif stage == "explore":
            cta = {"variant": "explore", "title": f"Explore the full {C.DEPARTMENTS[top_dept]} edit",
                   "subtitle": f"{sum(1 for p in self.products.values() if p['department'] == top_dept)} styles, filtered to what visitors like you love.",
                   "cta": {"label": f"Shop {C.DEPARTMENTS[top_dept]}", "href": "/shop/" + top_dept}}
        else:
            cta = {"variant": "urgency" if carted else "offer", "title": "Ready when you are" if carted else f"Free delivery on orders over {PR.rupees(PR.FREE_SHIPPING_OVER)}",
                   "subtitle": "Your bag is saved. Checkout takes under a minute." if carted else "Plus easy 30-day returns on everything.",
                   "cta": {"label": "Go to bag" if carted else "Shop bestsellers", "href": "/cart" if carted else "/shop/" + top_dept}}
        mods["cta"] = {"id": "cta", "type": "cta_banner", **cta, "image": mods["hero"]["image"], "strategy": f"stage:{stage}",
                       "reason": f"CTA adapted to funnel stage '{stage}' (cart propensity {pc:.1%}, {pc / bc:.1f}x baseline)."}
        mods["trust"] = {"id": "trust", "type": "trust_bar", "strategy": "static", "reason": "Reassurance for first-time visitors.",
                         "items": [{"icon": "truck", "label": f"Free delivery over {PR.rupees(PR.FREE_SHIPPING_OVER)}"}, {"icon": "refresh", "label": "30-day easy returns"},
                                   {"icon": "shield", "label": "Secure checkout"}, {"icon": "sparkles", "label": "Personalised by AI"}]}

        # ---- hero carousel: agent-selected creatives (the brief's "hero images" module)
        slides = []
        for b in self.banners:
            tg = b.get("target", {})
            sc, why = 0.0, []
            if b.get("department") == top_dept:
                sc += 3.5; why.append(f"top department {C.DEPARTMENTS[top_dept]}")
            elif b.get("department") and b["department"] in dept_rank[1:2]:
                sc += 1.2; why.append("second department")
            if stage in tg.get("stage", []):
                sc += 2; why.append(f"stage {stage}")
            if season and season in tg.get("season", []):
                sc += 1.8; why.append(f"season {season}")
            if row["channel"] in tg.get("channel", []):
                sc += 1.2; why.append(f"channel {row['channel']}")
            if row["age"] in tg.get("age", []):
                sc += 1.0; why.append(f"age {row['age']}")
            if row["daypart"] in tg.get("daypart", []):
                sc += 0.6; why.append(row["daypart"])
            if rc.level in tg.get("level", []):
                sc += 0.8
            if b["kind"] == "welcome_offer" and returning:
                sc -= 5
            if b["kind"] == "brand":
                bshare = float(np.mean(self.brand_of[order[:40]] == b.get("brand")))
                sc += 4 * bshare
                if bshare > 0.08:
                    why.append(f"brand share {bshare:.0%}")
            if b["kind"] == "sale" and self.on_sale[order[:20]].mean() > 0.25:
                sc += 1
            slides.append((sc, b, why))
        slides.sort(key=lambda x: -x[0])
        chosen, kinds = [], set()
        for sc, b, why in slides:
            if b["kind"] in kinds and b["kind"] != "department":
                continue
            kinds.add(b["kind"])
            chosen.append({"id": b["id"], "kind": b["kind"], "image": b["image"], "imageSquare": b["imageSquare"], "eyebrow": b["eyebrow"],
                           "title": b["title"], "subtitle": b["subtitle"], "cta": {"label": b["cta"], "href": b["href"]}, "badge": b.get("badge"),
                           "department": b.get("department"), "score": round(sc, 2), "why": ", ".join(why) or "general campaign"})
            if len(chosen) >= 4:
                break
        if chosen and chosen[0]["kind"] == "department":   # personalised copy on the lead creative
            chosen[0].update({"eyebrow": copy["eyebrow"], "title": copy["title"], "subtitle": copy["subtitle"],
                              "cta": {"label": copy["cta"], "href": f"/shop/{top_dept}"}, "copySource": copy.get("source", "template")})
        mods["hero_carousel"] = {"id": "hero_carousel", "type": "hero_carousel", "slides": chosen, "strategy": "creative_selection",
                                 "reason": "Campaign creatives scored by department affinity, intent stage, season, channel, age and brand share; "
                                           "the lead slide carries the agent's own copy.", "signals": rc.signals[:3]}

        # ---- offer strip (bank offer, coupons, shipping, points)
        rules = self.storefront
        offers = []
        bo = rules.get("bankOffer")
        if bo:
            offers.append({"icon": "credit-card", "title": f"{bo['pct']}% instant discount", "text": f"{bo['bank']} credit cards · up to {PR.rupees(bo['cap'])} · min {PR.rupees(bo['min'])}", "code": None})
        coupons = {c["code"]: c for c in rules.get("coupons", [])}
        if not returning and "WELCOME10" in coupons:
            offers.append({"icon": "tag", "title": "10% off your first order", "text": coupons["WELCOME10"]["label"], "code": "WELCOME10"})
        elif "AURA20" in coupons:
            offers.append({"icon": "tag", "title": f"20% off above {PR.rupees(PR.COUPONS['AURA20']['min'])}", "text": coupons["AURA20"]["label"], "code": "AURA20"})
        dept_coupon = {"watches": "WATCH15", "women": "STYLE25"}.get(top_dept)
        if dept_coupon and dept_coupon in coupons:
            offers.append({"icon": "sparkles", "title": coupons[dept_coupon]["label"], "text": f"Because you're into {C.DEPARTMENTS[top_dept]}", "code": dept_coupon})
        offers.append({"icon": "truck", "title": f"Free delivery over {PR.rupees(rules.get('freeShippingOver', PR.FREE_SHIPPING_OVER))}", "text": "Standard 3-6 days · express 1-2 days", "code": None})
        if user:
            offers.append({"icon": "gift", "title": f"{user.get('points', 0)} reward points", "text": "1 point = ₹1 at checkout", "code": None})
        else:
            offers.append({"icon": "gift", "title": "Earn 5% back in points", "text": f"Sign up and get {PR.WELCOME_POINTS} points (₹{PR.WELCOME_POINTS}) instantly", "code": None})
        mods["offer_strip"] = {"id": "offer_strip", "type": "offer_strip", "offers": offers[:4], "strategy": "rules_by_stage_and_department",
                               "reason": "Offers chosen by customer status (new vs returning), top department and sign-in state."}

        # ---- category grid (Myntra-style tiles with data-derived offer labels), ordered by affinity
        tiles_all = rules.get("categoryTiles", [])
        aff_rank = {(t_["subcategory"], t_["department"]): i for i, t_ in enumerate(sub_aff)}
        dept_pos = {d: i for i, d in enumerate(dept_rank)}
        grid = sorted(tiles_all, key=lambda t_: (aff_rank.get((t_["subcategory"], t_["department"]), 99), dept_pos.get(t_["department"], 9), -t_["popularity"]))
        mods["category_grid"] = {"id": "category_grid", "type": "category_grid", "title": "Shop by category",
                                 "tiles": [{k: t_[k] for k in ("label", "departmentLabel", "department", "subcategory", "image", "href", "offer", "items")} for t_ in grid[:12 if is_mobile else 18]],
                                 "strategy": "subcategory_affinity+department_affinity",
                                 "reason": "Tiles ordered by the visitor's subcategory and department affinities; offer labels come from real markdown ranges."}

        # ---- brand spotlight
        bshares = pd.Series(self.brand_of[order[:60]]).value_counts(normalize=True)
        brands = [b for b in rules.get("brands", []) if b["name"] != "AURA Studio"]
        if brands:
            pmax = max(b["popularity"] for b in brands) or 1
            brands.sort(key=lambda b: -(bshares.get(b["name"], 0) * 5 + b["popularity"] / pmax))
            mods["brand_spotlight"] = {"id": "brand_spotlight", "type": "brand_spotlight", "title": "Brands in focus",
                                       "brands": [{"id": b["id"], "name": b["name"], "image": b["image"], "items": b["items"], "href": f"/brands/{b['id']}",
                                                   "offer": (f"UP TO {b['maxDiscount']}% OFF" if b["maxDiscount"] >= 10 else "NEW COLLECTION"),
                                                   "why": f"{bshares.get(b['name'], 0):.0%} of your top picks" if bshares.get(b["name"], 0) > 0 else "Popular brand"}
                                                  for b in brands[:4 if is_mobile else 6]],
                                       "strategy": "brand_affinity", "reason": "Brands ranked by their share of the visitor's top-60 scored items, then popularity."}

        # ---- returning customer modules
        if h_viewed:
            hj = [self.art.item_idx[i] for i in h_viewed][:n_car]
            mods["history"] = {"id": "history", "type": "product_carousel", "title": "Recently viewed", "subtitle": "From your last visits",
                               "strategy": "user_history", "reason": "Level 4: the customer's own browsing history from previous sessions.",
                               "products": [self._p(j, "You looked at this before") for j in hj]}
        if h_bought:
            aj = self.art.item_idx[h_bought[0]]
            if aj in self.art.copurchase:
                nb, cnt, lf = self.art.copurchase[aj]
                bj = [int(j) for j in nb if int(j) not in used and int(j) not in excl][:n_car]
                if bj:
                    used.update(bj)
                    mods["because_bought"] = carousel("because_bought", f"Goes with your {self.products[h_bought[0]]['name'][:40]}",
                                                      "Customers who bought it also bought", bj, "copurchase_from_order_history",
                                                      "Level 4: co-purchase graph seeded with the customer's most recent order.",
                                                      why_fn=lambda j: "Often bought together with your purchase")

        # ---- new arrivals incl. catalog-only products (no behavioural data yet -> content match on department/audience)
        fresh = [p for p in self.products.values() if p.get("isNew") and p["id"] not in {self.art.items[j] for j in used}]
        fresh.sort(key=lambda p: (-(dept_aff.get(p["department"], 0)), -(p["audience"] in ((("women" if gender == "female" else "men") if gender else p["audience"]), "unisex")), -p["stats"]["views"]))
        if fresh:
            mods["new_arrivals"] = {"id": "new_arrivals", "type": "product_carousel", "title": "New arrivals", "subtitle": "Just added to the catalog",
                                    "strategy": "content_match_new_items", "reason": "Items without behavioural history are ranked by department affinity and audience match (item cold start).",
                                    "products": [{**p, "why": f"New in {C.DEPARTMENTS[p['department']]}"} for p in fresh[:n_car]]}

        layouts = {
            "discover": ["announcement", "hero_carousel", "offer_strip", "category_grid", "audience", "recommended", "local", "new_arrivals", "brand_spotlight", "cta", "similar", "tiles", "deals", "dept2", "trust"],
            "explore": ["announcement", "hero_carousel", "offer_strip", "recall", "history", "audience", "recommended", "category_grid", "local", "bundle", "deals", "new_arrivals", "brand_spotlight", "similar", "cta", "dept2", "trust"],
            "buy_now": ["announcement", "hero_carousel", "offer_strip", "recall", "history", "because_bought", "audience", "recommended", "bundle", "deals", "cta", "local", "category_grid", "similar", "brand_spotlight", "trust"],
        }
        max_mods = int(opts.get("maxModules") or (12 if is_mobile else 16))
        modules = [mods[m] for m in layouts[stage] if m in mods][:max_mods]
        modules, reordered = self.experiments.order_modules(stage, row["device"], modules) if opts.get("bandit", True) else (modules, False)
        step("Compose layout", f"Template '{stage}' for {row['device']}: {len(modules)} modules -> " + ", ".join(m["id"] for m in modules)
             + f". Hero copy: {copy.get('source', 'template')}." + (" Bandit re-ordered the middle modules from live clicks." if reordered else " Bandit kept the offline order."), t)

        t = time.perf_counter()
        page_id = uuid.uuid4().hex[:12]
        self.experiments.register_page(page_id, stage, row["device"], variant, [m["id"] for m in modules])
        out = {
            "pageId": page_id,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "experiment": {"variant": variant, "bucket": bucket, "banditReordered": reordered,
                           "description": "10% of visitors see a popularity-only control page; module order is learned online by Thompson sampling."},
            "visitor": {
                "coldStartLevel": rc.level, "levelLabel": LEVEL_LABELS[rc.level],
                "resolvedContext": {
                    "device": row["device"], "channel": row["channel"], "source": row["_source"], "medium": row["_medium"],
                    "country": row["_country"], "region": row["_region"], "city": row.get("_city"), "geo": row["geo"], "macroRegion": row["macro"],
                    "daypart": row["daypart"], "localHour": row["hour"], "dayOfWeek": row["dow"], "month": row["month"], "season": season,
                    "landingPageType": row["landing"],
                    "ageGroup": None if row["age"] == F.UNKNOWN else row["age"],
                    "gender": None if row["gender"] == F.UNKNOWN else row["gender"], "incomeGroup": row["_income"],
                    "preferredDepartment": pref,
                },
                "signalsUsed": rc.signals,
            },
            "inference": {
                "persona": {"id": persona.get("id", f"p{persona['cluster']}"), "name": persona_name, "tagline": persona["tagline"],
                            "description": persona["description"], "confidence": round(float(pp[order_p[0]]), 3),
                            "alternatives": [{"id": f"p{int(i)}", "name": self.persona_by_cluster[int(i)]["name"], "probability": round(float(pp[i]), 3)}
                                             for i in order_p[1:4]]},
                "intent": {"stage": stage, "stageLabel": STAGE_LABEL[stage], "cartPropensity": round(pc, 4), "purchasePropensity": round(pbuy, 4),
                           "baselineCart": round(bc, 4), "baselinePurchase": round(bb, 4), "lift": round(float(lift), 2)},
                "departmentAffinity": [{"department": d, "label": C.DEPARTMENTS[d], "probability": round(dept_aff[d], 3),
                                        "lift": round(dept_aff[d] / max(self.dept_prior.get(d, 1e-9), 1e-9), 2)} for d in dept_rank],
                "subcategoryAffinity": sub_aff,
                "similarVisitors": {"count": self.rec.knn_k, "description": f"Matched against {self.art.knn['U'].shape[0]:,} recent visitors on "
                                    + ", ".join(f for f, w in sorted(self.art.knn["weights"].items(), key=lambda x: -x[1]) if w > 0.25)},
                "backoffPath": res.backoff[0] if res.backoff else [],
                "ranking": {"reranker": "lambdarank" if used_ltr else ("popularity" if variant == "control" else "blend"),
                            "audienceRule": bool((gender or pref) and variant != "control"), "candidates": LTR.N_CANDIDATES if used_ltr else self.art.n_items},
            },
            "theme": {"accent": ACCENT.get(top_dept, "#e11d48"), "department": top_dept},
            "user": ({"name": user.get("name"), "points": user.get("points", 0), "returning": returning} if user else ({"returning": True} if returning else None)),
            "modules": modules,
            "trace": trace,
        }
        step("Explain", "Attached per-module reasons, per-product 'why' and this trace.", t)
        out["latencyMs"] = round((time.perf_counter() - t0) * 1000, 1)
        return out

    # ------------------------------------------------------------------ product page helpers
    def related(self, item_id: str) -> dict:
        p = self.products.get(item_id)
        if p is None:
            return {}
        j = self.art.item_idx.get(item_id)
        also, bought, nxt = [], [], []
        if j is not None and j in self.art.coview:
            nb, sim = self.art.coview[j]
            also = [self._p(int(k), f"Co-viewed (similarity {s:.2f})") for k, s in zip(nb, sim) if self.art.items[int(k)] in self.products][:10]
        if j is not None and j in self.art.transitions:
            nb, pr = self.art.transitions[j]
            nxt = [self._p(int(k), f"{pr_:.0%} of shoppers view this next") for k, pr_ in zip(nb, pr) if self.art.items[int(k)] in self.products][:8]
        if j is not None and j in self.art.copurchase:
            nb, cnt, lf = self.art.copurchase[j]
            bought = [self._p(int(k), f"Bought together {int(c)}x") for k, c, l in zip(nb, cnt, lf) if self.art.items[int(k)] in self.products][:4]
        same = [q for q in self.products.values() if q["subcategory"] == p["subcategory"] and q["department"] == p["department"] and q["id"] != item_id]
        same.sort(key=lambda q: abs(np.log(max(q["price"], 1) / max(p["price"], 1))) - 0.1 * np.log1p(q["stats"]["orders"]))
        return {"product": p, "alsoViewed": also, "viewedNext": nxt, "boughtTogether": bought, "similar": same[:10]}
