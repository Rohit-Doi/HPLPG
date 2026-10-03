"""Dynamic catalog API: search with facets/filters, product detail (reviews, delivery, similar), reviews,
wishlist / cart sync, points ledger, offers, settings, rich behavioural events and their export."""
from __future__ import annotations

import json
import math
import os
import re
import time
from collections import Counter
from typing import Optional

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from . import promotions as P
from .api import _products_ref, current_user_id, require_user
from .db import User, UserEvent, session, user_history
from .models_ext import CartItem, CouponRedemption, PointsLedger, Review, RichEvent, WishlistItem

router = APIRouter(prefix="/api/v1")
_agent_ref: dict = {}


def set_agent(agent) -> None:
    _agent_ref["agent"] = agent


def products() -> dict:
    return _products_ref


# ------------------------------------------------------------------ search & filters
FILTER_FIELDS = ("department", "subcategory", "brand", "colour", "material", "pattern", "audience")


def _tokens(q: str) -> list[str]:
    return [t for t in re.sub(r"[^a-z0-9 ]", " ", q.lower()).split() if len(t) > 1]


def _text(p: dict) -> str:
    return " ".join(str(p.get(k) or "") for k in ("name", "brand", "subcategory", "departmentLabel", "colour", "material", "pattern", "detail")).lower() + " " + " ".join(p.get("styles", [])).lower()


def _score(p: dict, toks: list[str]) -> float:
    t = _text(p)
    name = (p.get("name") or "").lower()
    s = 0.0
    for tok in toks:
        if tok in name:
            s += 3.0
        elif tok in t:
            s += 1.0
        elif any(w.startswith(tok) for w in t.split()):
            s += 0.5
        else:
            return 0.0
    return s + math.log1p(p["stats"]["orders"] * 5 + p["stats"]["carts"]) * 0.05


@router.get("/catalog/search")
def search(q: Optional[str] = None, department: Optional[str] = None, subcategory: Optional[str] = None, brand: Optional[str] = None,
           colour: Optional[str] = None, material: Optional[str] = None, pattern: Optional[str] = None, style: Optional[str] = None,
           size: Optional[str] = None, audience: Optional[str] = None, minPrice: Optional[float] = None, maxPrice: Optional[float] = None,
           minDiscount: Optional[int] = None, onSale: Optional[bool] = None, minRating: Optional[float] = None, isNew: Optional[bool] = None,
           collection: Optional[str] = None, ids: Optional[str] = None, sort: str = "relevance", limit: int = Query(48, le=200), offset: int = 0,
           visitorId: Optional[str] = None, uid: Optional[int] = Depends(current_user_id)) -> dict:
    items = list(products().values())
    toks = _tokens(q) if q else []
    multi = lambda v: [x.strip() for x in v.split(",") if x.strip()]  # noqa: E731
    if collection:
        sf = _agent_ref["agent"].storefront if "agent" in _agent_ref else {}
        col = next((c for c in sf.get("collections", []) if c["id"] == collection), None)
        if col:
            keep = set(col["itemIds"]); items = [p for p in items if p["id"] in keep]
    if ids:
        keep = set(multi(ids)); items = [p for p in items if p["id"] in keep]
    for field, val in (("department", department), ("subcategory", subcategory), ("brand", brand), ("colour", colour),
                       ("material", material), ("pattern", pattern), ("audience", audience)):
        if val:
            vals = {v.lower() for v in multi(val)}
            items = [p for p in items if str(p.get(field) or "").lower() in vals]
    if style:
        vals = {v.lower() for v in multi(style)}
        items = [p for p in items if any(s.lower() in vals for s in p.get("styles", []))]
    if size:
        vals = {v.lower() for v in multi(size)}
        items = [p for p in items if any(s.lower() in vals for s in p.get("sizes", []))]
    if minPrice is not None:
        items = [p for p in items if p["price"] >= minPrice]
    if maxPrice is not None:
        items = [p for p in items if p["price"] <= maxPrice]
    if minDiscount:
        items = [p for p in items if p["discountPct"] >= minDiscount]
    if onSale:
        items = [p for p in items if p["onSale"]]
    if isNew:
        items = [p for p in items if p["isNew"]]
    ratings = rating_summary_bulk([p["id"] for p in items]) if minRating or sort == "rating" else {}
    if minRating:
        items = [p for p in items if ratings.get(p["id"], {}).get("average", 0) >= minRating]
    scored = None
    if toks:
        scored = [(p, _score(p, toks)) for p in items]
        scored = [(p, s) for p, s in scored if s > 0]
        items = [p for p, _ in sorted(scored, key=lambda x: -x[1])]
    keyf = {"price_asc": lambda p: p["price"], "price_desc": lambda p: -p["price"], "discount": lambda p: -p["discountPct"],
            "new": lambda p: (not p["isNew"], -p["stats"]["views"]), "popular": lambda p: -(p["stats"]["orders"] * 5 + p["stats"]["carts"]),
            "rating": lambda p: -(ratings.get(p["id"], {}).get("average", 0))}
    if sort in keyf:
        items.sort(key=keyf[sort])
    elif not toks:
        items.sort(key=keyf["popular"])
    facets = {f: Counter(str(p.get(f) or "") for p in items) for f in FILTER_FIELDS}
    facets["style"] = Counter(s for p in items for s in p.get("styles", []))
    facets["size"] = Counter(s for p in items for s in p.get("sizes", []))
    prices = [p["price"] for p in items] or [0]
    if q or any([department, subcategory, brand, colour, style]):
        log_event(uid, visitorId, "search" if q else "filter", meta={"q": q, "department": department, "subcategory": subcategory, "brand": brand,
                                                                     "colour": colour, "style": style, "results": len(items)})
    return {"total": len(items), "items": items[offset: offset + limit],
            "facets": {k: [{"value": v, "count": n} for v, n in c.most_common(40) if v] for k, c in facets.items()},
            "priceRange": {"min": float(min(prices)), "max": float(max(prices))}, "query": q}


@router.get("/catalog/suggest")
def suggest(q: str, limit: int = 8) -> dict:
    toks = _tokens(q)
    if not toks:
        return {"products": [], "brands": [], "categories": []}
    items = sorted(((p, _score(p, toks)) for p in products().values()), key=lambda x: -x[1])
    prods = [p for p, s in items if s > 0][:limit]
    brands = sorted({p["brand"] for p in products().values() if any(t in p["brand"].lower() for t in toks)})[:5]
    cats = sorted({(p["department"], p["subcategory"]) for p in products().values() if any(t in p["subcategory"].lower() or t in p["departmentLabel"].lower() for t in toks)})[:6]
    return {"products": [{"id": p["id"], "name": p["name"], "brand": p["brand"], "image": p["image"], "price": p["price"]} for p in prods],
            "brands": brands, "categories": [{"department": d, "subcategory": s, "href": f"/shop/{d}?sub={s}"} for d, s in cats]}


# ------------------------------------------------------------------ reviews
class ReviewReq(BaseModel):
    rating: int = Field(ge=1, le=5)
    title: str = Field(default="", max_length=120)
    body: str = Field(default="", max_length=2000)
    sizeFit: str = ""
    author: str = ""


def rating_summary_bulk(item_ids: list[str]) -> dict:
    if not item_ids:
        return {}
    with session() as s:
        rows = s.execute(select(Review.item_id, func.avg(Review.rating), func.count(Review.id)).where(Review.item_id.in_(item_ids)).group_by(Review.item_id)).all()
    return {iid: {"average": round(float(avg), 2), "count": int(n)} for iid, avg, n in rows}


def rating_summary(item_id: str) -> dict:
    with session() as s:
        rows = s.execute(select(Review.rating, func.count(Review.id)).where(Review.item_id == item_id).group_by(Review.rating)).all()
    dist = {str(k): 0 for k in range(1, 6)}
    for r, n in rows:
        dist[str(int(r))] = int(n)
    n = sum(dist.values())
    avg = round(sum(int(k) * v for k, v in dist.items()) / n, 2) if n else 0.0
    return {"average": avg, "count": n, "distribution": dist}


@router.get("/products/{item_id}/reviews")
def get_reviews(item_id: str, limit: int = 20, offset: int = 0, sort: str = "recent") -> dict:
    with session() as s:
        q = select(Review).where(Review.item_id == item_id)
        q = q.order_by(Review.helpful.desc(), Review.ts.desc()) if sort == "helpful" else q.order_by(Review.ts.desc())
        rows = s.execute(q.offset(offset).limit(limit)).scalars().all()
    return {"summary": rating_summary(item_id),
            "reviews": [{"id": r.id, "author": r.author, "rating": r.rating, "title": r.title, "body": r.body, "sizeFit": r.size_fit,
                         "verified": bool(r.verified), "source": r.source, "helpful": r.helpful, "ts": r.ts} for r in rows]}


@router.post("/products/{item_id}/reviews")
def post_review(item_id: str, req: ReviewReq, uid: Optional[int] = Depends(current_user_id), visitorId: Optional[str] = None) -> dict:
    if item_id not in products():
        raise HTTPException(404, "product not found")
    with session() as s:
        name = req.author.strip()
        verified = 0
        if uid:
            u = s.get(User, uid)
            name = name or (u.name if u else "") or "AURA member"
            bought = s.execute(select(UserEvent.id).where(UserEvent.user_id == uid, UserEvent.item_id == item_id, UserEvent.type == "purchase").limit(1)).first()
            verified = 1 if bought else 0
        r = Review(item_id=item_id, user_id=uid, author=name or "AURA shopper", rating=req.rating, title=req.title.strip(), body=req.body.strip(),
                   size_fit=req.sizeFit, verified=verified, source="user")
        s.add(r)
    log_event(uid, visitorId, "review", item_id, {"rating": req.rating})
    return get_reviews(item_id)


@router.post("/reviews/{rid}/helpful")
def helpful(rid: int) -> dict:
    with session() as s:
        r = s.get(Review, rid)
        if r:
            r.helpful += 1
            return {"helpful": r.helpful}
    raise HTTPException(404, "review not found")


DEMO_REVIEW_TEXTS = {
    5: [("Exactly as pictured", "Great quality and fast delivery. Fits true to size."), ("Worth every penny", "Feels premium, got compliments the first day."),
        ("Love it", "Colour is rich and the finish is excellent.")],
    4: [("Very good", "Solid quality, slightly longer delivery than expected."), ("Nice piece", "Good value on sale; runs a touch large.")],
    3: [("Okay", "Decent, but the material feels thinner than I hoped."), ("Average", "Looks good, sizing is inconsistent.")],
    2: [("Not for me", "Returned it - colour looked different in person.")],
}


def seed_demo_reviews() -> int:
    """Seed clearly-labelled demo reviews (source='demo') so the prototype shows a populated review section.
    Ratings are derived from each product's real add-to-cart rate percentile; disable with SEED_DEMO_REVIEWS=0."""
    if os.getenv("SEED_DEMO_REVIEWS", "1") != "1":
        return 0
    with session() as s:
        if s.execute(select(func.count(Review.id))).scalar():
            return 0
    rng = np.random.default_rng(7)
    prods = [p for p in products().values() if p["stats"]["views"] >= 300]
    rates = np.array([p["stats"]["cartRate"] for p in prods])
    n = 0
    names = ["Priya S.", "Daniel K.", "Aisha R.", "Marco L.", "Chen W.", "Sofia M.", "Rahul V.", "Emma T.", "Liam O.", "Nora B.", "Arjun P.", "Grace H."]
    with session() as s:
        for p, r in zip(prods, rates):
            pct = float((rates < r).mean())
            k = int(rng.integers(2, 7))
            for _ in range(k):
                base = 5 if pct > 0.75 else 4 if pct > 0.4 else 3
                rating = int(np.clip(base + rng.choice([-1, 0, 0, 1]), 2, 5))
                title, body = DEMO_REVIEW_TEXTS[rating][rng.integers(0, len(DEMO_REVIEW_TEXTS[rating]))]
                s.add(Review(item_id=p["id"], user_id=None, author=names[rng.integers(0, len(names))], rating=rating, title=title, body=body,
                             size_fit=str(rng.choice(["small", "true", "true", "large"])), verified=int(rng.random() < 0.7), source="demo",
                             helpful=int(rng.integers(0, 12)), ts=time.time() - float(rng.integers(3, 200)) * 86400))
                n += 1
    return n


# ------------------------------------------------------------------ delivery estimate
# Fulfilment from Mumbai and Bengaluru; zones by Indian state (or the first digit of the 6-digit PIN code).
ZONE_DAYS = {"metro": (2, 3), "india": (3, 6), "remote": (5, 9), "intl": (8, 14)}
INDIA_STATES = ["Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
                "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
                "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
                "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
                "Uttar Pradesh", "Uttarakhand", "West Bengal"]
METRO_STATES = {"Maharashtra", "Karnataka", "Delhi", "Tamil Nadu", "Telangana", "West Bengal", "Gujarat", "Haryana"}
REMOTE_STATES = {"Andaman and Nicobar Islands", "Lakshadweep", "Ladakh", "Jammu and Kashmir", "Arunachal Pradesh", "Manipur", "Meghalaya",
                 "Mizoram", "Nagaland", "Sikkim", "Tripura"}
PIN_FIRST_DIGIT = {"1": "Delhi", "4": "Maharashtra", "5": "Karnataka", "6": "Tamil Nadu", "7": "West Bengal", "3": "Gujarat"}   # coarse PIN regions


@router.get("/delivery/estimate")
def delivery_estimate(country: str = "India", region: Optional[str] = None, postalCode: Optional[str] = None, shipping: str = "standard") -> dict:
    pin = (postalCode or "").strip()
    if pin and country == "India" and not re.fullmatch(r"[1-9][0-9]{5}", pin):
        raise HTTPException(400, "enter a valid 6-digit PIN code")
    if country != "India":
        zone = "intl"
    else:
        state = region if region in INDIA_STATES else PIN_FIRST_DIGIT.get(pin[:1]) if pin else region
        zone = "metro" if state in METRO_STATES else ("remote" if state in REMOTE_STATES else "india")
    lo, hi = ZONE_DAYS[zone]
    if shipping == "express" and zone != "intl":
        lo, hi = 1, max(2, hi - 3)
    now = time.time()
    where = f"PIN {pin}" if pin else (region or country)
    return {"zone": zone, "minDays": lo, "maxDays": hi, "earliest": now + lo * 86400, "latest": now + hi * 86400,
            "text": f"{'Express' if shipping == 'express' else 'Standard'} delivery in {lo}-{hi} days to {where}",
            "cutoff": "Order before 2 PM for same-day dispatch", "freeOver": P.FREE_SHIPPING_OVER, "codAvailable": zone != "intl",
            "currency": "INR"}


@router.get("/meta/india-states")
def india_states() -> dict:
    return {"states": INDIA_STATES}


# ------------------------------------------------------------------ similar products (personalised)
@router.get("/products/{item_id}/similar")
def similar(item_id: str, visitorId: Optional[str] = None, uid: Optional[int] = Depends(current_user_id), limit: int = 12) -> dict:
    a = _agent_ref.get("agent")
    p = products().get(item_id)
    if not p:
        raise HTTPException(404, "product not found")
    hist = user_history(uid, visitorId)
    liked = set(hist["viewed"][:10] + hist["carted"][:10])
    scores: dict[str, float] = {}
    reasons: dict[str, str] = {}
    if a is not None and item_id in a.art.item_idx:
        j = a.art.item_idx[item_id]
        for src, w, why in ((a.art.coview, 1.0, "Shoppers also viewed"), (a.art.transitions, 0.8, "Often viewed next")):
            if j in src:
                nb, sc = src[j][0], src[j][1]
                for k, v in zip(nb, sc):
                    iid = a.art.items[int(k)]
                    scores[iid] = scores.get(iid, 0) + w * float(v) / (max(float(sc.max()), 1e-9))
                    reasons.setdefault(iid, why)
    # content similarity (works for brand-new items too)
    for q in products().values():
        if q["id"] == item_id:
            continue
        sim = (2.0 * (q["department"] == p["department"]) + 3.0 * (q["subcategory"] == p["subcategory"]) + 1.0 * (q["brand"] == p["brand"])
               + 1.0 * (q["colour"] == p["colour"]) + 0.8 * (q["material"] == p["material"]) + 0.6 * len(set(q["styles"]) & set(p["styles"]))
               + 1.0 * (q["audience"] == p["audience"] or "unisex" in (q["audience"], p["audience"]))
               - 0.8 * abs(math.log(max(q["price"], 1) / max(p["price"], 1))))
        scores[q["id"]] = scores.get(q["id"], 0) + 0.12 * sim
        reasons.setdefault(q["id"], "Similar style")
    # personal taste: boost items co-viewed with what the visitor liked
    if a is not None and liked:
        for lid in liked:
            j = a.art.item_idx.get(lid)
            if j is not None and j in a.art.coview:
                nb, sc = a.art.coview[j]
                for k, v in zip(nb, sc):
                    iid = a.art.items[int(k)]
                    if iid != item_id:
                        scores[iid] = scores.get(iid, 0) + 0.5 * float(v) / max(float(sc.max()), 1e-9)
                        reasons[iid] = "Because of what you liked"
    top = sorted(scores.items(), key=lambda x: -x[1])[:limit]
    return {"items": [{**products()[i], "why": reasons.get(i, "Similar"), "score": round(float(s), 3)} for i, s in top if i in products()],
            "personalised": bool(liked)}


# ------------------------------------------------------------------ wishlist & cart sync
class WishReq(BaseModel):
    itemId: str
    size: str = ""


class CartReq(BaseModel):
    itemId: str
    size: str = ""
    qty: int = 1


class CartBulk(BaseModel):
    items: list[CartReq]
    merge: bool = True


@router.get("/me/wishlist")
def get_wishlist(uid: int = Depends(require_user)) -> list[dict]:
    with session() as s:
        rows = s.execute(select(WishlistItem).where(WishlistItem.user_id == uid).order_by(WishlistItem.ts.desc())).scalars().all()
    return [{**products()[r.item_id], "size": r.size, "addedAt": r.ts} for r in rows if r.item_id in products()]


@router.post("/me/wishlist")
def add_wishlist(req: WishReq, uid: int = Depends(require_user)) -> dict:
    with session() as s:
        if not s.execute(select(WishlistItem).where(WishlistItem.user_id == uid, WishlistItem.item_id == req.itemId)).scalar_one_or_none():
            s.add(WishlistItem(user_id=uid, item_id=req.itemId, size=req.size))
    log_event(uid, None, "wishlist", req.itemId)
    return {"ok": True}


@router.delete("/me/wishlist/{item_id}")
def del_wishlist(item_id: str, uid: int = Depends(require_user)) -> dict:
    with session() as s:
        for r in s.execute(select(WishlistItem).where(WishlistItem.user_id == uid, WishlistItem.item_id == item_id)).scalars():
            s.delete(r)
    return {"ok": True}


@router.get("/me/cart")
def get_cart(uid: int = Depends(require_user)) -> list[dict]:
    with session() as s:
        rows = s.execute(select(CartItem).where(CartItem.user_id == uid)).scalars().all()
    return [{"id": r.item_id, "size": r.size, "qty": r.qty} for r in rows if r.item_id in products()]


@router.put("/me/cart")
def put_cart(req: CartBulk, uid: int = Depends(require_user)) -> list[dict]:
    with session() as s:
        existing = {(r.item_id, r.size): r for r in s.execute(select(CartItem).where(CartItem.user_id == uid)).scalars()}
        if not req.merge:
            for r in existing.values():
                s.delete(r)
            existing = {}
        for it in req.items:
            key = (it.itemId, it.size or "")
            if key in existing:
                existing[key].qty = max(existing[key].qty, it.qty) if req.merge else it.qty
            else:
                s.add(CartItem(user_id=uid, item_id=it.itemId, size=it.size or "", qty=max(1, it.qty)))
    return get_cart(uid)


@router.delete("/me/cart/{item_id}")
def del_cart(item_id: str, size: str = "", uid: int = Depends(require_user)) -> dict:
    with session() as s:
        for r in s.execute(select(CartItem).where(CartItem.user_id == uid, CartItem.item_id == item_id, CartItem.size == size)).scalars():
            s.delete(r)
    return {"ok": True}


# ------------------------------------------------------------------ points, offers, settings
@router.get("/me/points")
def points(uid: int = Depends(require_user)) -> dict:
    with session() as s:
        u = s.get(User, uid)
        rows = s.execute(select(PointsLedger).where(PointsLedger.user_id == uid).order_by(PointsLedger.ts.desc()).limit(50)).scalars().all()
    return {"balance": u.points if u else 0, "rules": P.public_rules()["points"],
            "ledger": [{"delta": r.delta, "reason": r.reason, "ref": r.ref, "ts": r.ts} for r in rows]}


@router.get("/me/offers")
def offers(uid: Optional[int] = Depends(current_user_id), visitorId: Optional[str] = None) -> dict:
    rules = P.public_rules()
    used = set()
    first = True
    if uid:
        with session() as s:
            used = {r.code for r in s.execute(select(CouponRedemption).where(CouponRedemption.user_id == uid)).scalars()}
            from .db import Order
            first = s.execute(select(Order.id).where(Order.user_id == uid).limit(1)).first() is None
    coupons = [{**c, "available": (not c["firstOrderOnly"] or first) and not (c["firstOrderOnly"] and c["code"] in used), "used": c["code"] in used}
               for c in rules["coupons"]]
    return {"coupons": coupons, "bankOffer": rules["bankOffer"], "freeShippingOver": rules["freeShippingOver"], "points": rules["points"]}


class SettingsReq(BaseModel):
    newsletter: Optional[bool] = None
    smsAlerts: Optional[bool] = None
    personalization: Optional[bool] = None
    currency: Optional[str] = None
    language: Optional[str] = None
    theme: Optional[str] = None


@router.get("/me/settings")
def get_settings(uid: int = Depends(require_user)) -> dict:
    with session() as s:
        u = s.get(User, uid)
        return {"newsletter": True, "smsAlerts": False, "personalization": True, "currency": "INR", "language": "en", "theme": "light",
                **(u.profile.get("settings", {}) if u else {})}


@router.put("/me/settings")
def put_settings(req: SettingsReq, uid: int = Depends(require_user)) -> dict:
    with session() as s:
        u = s.get(User, uid)
        prof = u.profile
        prof["settings"] = {**prof.get("settings", {}), **{k: v for k, v in req.model_dump().items() if v is not None}}
        u.profile_json = json.dumps(prof)
    return get_settings(uid)


@router.delete("/me/personalization")
def reset_personalization(uid: int = Depends(require_user)) -> dict:
    with session() as s:
        for r in s.execute(select(UserEvent).where(UserEvent.user_id == uid)).scalars():
            s.delete(r)
        u = s.get(User, uid)
        prof = u.profile
        for k in ("gender", "ageGroup", "preferredDepartments", "styles", "budget"):
            prof.pop(k, None)
        prof["onboarded"] = False
        u.profile_json = json.dumps(prof)
    return {"ok": True}


# ------------------------------------------------------------------ rich events
class RichEventReq(BaseModel):
    visitorId: Optional[str] = None
    type: str
    itemId: Optional[str] = None
    pageId: Optional[str] = None
    moduleId: Optional[str] = None
    meta: dict = {}
    device: Optional[str] = None
    channel: Optional[str] = None
    region: Optional[str] = None


def log_event(uid: Optional[int], visitor_id: Optional[str], etype: str, item_id: str | None = None, meta: dict | None = None, **kw) -> None:
    try:
        with session() as s:
            s.add(RichEvent(user_id=uid, visitor_id=visitor_id or "", type=etype, item_id=item_id or "", meta_json=json.dumps(meta or {}, default=str),
                            page_id=kw.get("page_id", ""), module_id=kw.get("module_id", ""), device=kw.get("device", ""), channel=kw.get("channel", ""), region=kw.get("region", "")))
    except Exception:  # noqa: BLE001 - analytics must never break a request
        pass


@router.post("/events/rich")
def rich_event(ev: RichEventReq, uid: Optional[int] = Depends(current_user_id)) -> dict:
    log_event(uid, ev.visitorId, ev.type, ev.itemId, ev.meta, page_id=ev.pageId or "", module_id=ev.moduleId or "", device=ev.device or "", channel=ev.channel or "", region=ev.region or "")
    if ev.type in ("view_item", "add_to_cart", "purchase") and ev.itemId in products():
        with session() as s:
            s.add(UserEvent(user_id=uid, visitor_id=ev.visitorId or "", type=ev.type, item_id=ev.itemId))
    return {"ok": True}


@router.get("/events/stats")
def event_stats() -> dict:
    with session() as s:
        rows = s.execute(select(RichEvent.type, func.count(RichEvent.id)).group_by(RichEvent.type)).all()
        users = s.execute(select(func.count(func.distinct(RichEvent.user_id)))).scalar()
        visitors = s.execute(select(func.count(func.distinct(RichEvent.visitor_id)))).scalar()
    return {"byType": {t: int(n) for t, n in rows}, "users": int(users or 0), "visitors": int(visitors or 0),
            "export": "python -m hplpga.store.export -> artifacts/feedback/*.parquet (same schema as the training interactions)"}
