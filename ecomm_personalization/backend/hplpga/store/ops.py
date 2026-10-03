"""Operational features a real shop needs: inventory, order lifecycle (cancel / return), live trending
from the event store, account deletion & data export (privacy), rate limiting, currency."""
from __future__ import annotations

import json
import time
from collections import defaultdict, deque
from typing import Optional

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import Integer, String, UniqueConstraint, func, select
from sqlalchemy.orm import Mapped, mapped_column

from .. import config as C
from .api import _products_ref, current_user_id, require_user
from .db import Address, Base, Order, User, UserEvent, session
from .models_ext import CartItem, CouponRedemption, PointsLedger, Review, RichEvent, WishlistItem

router = APIRouter(prefix="/api/v1")


# ------------------------------------------------------------------ tables
class Stock(Base):
    __tablename__ = "inventory"
    __table_args__ = (UniqueConstraint("item_id", "size", name="uq_stock"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    item_id: Mapped[str] = mapped_column(String(32), index=True)
    size: Mapped[str] = mapped_column(String(16), default="")
    qty: Mapped[int] = mapped_column(Integer, default=0)


# ------------------------------------------------------------------ rate limiting (per IP, in-memory)
_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(limit: int, window_s: int):
    def dep(request: Request) -> None:
        key = f"{request.client.host if request.client else 'x'}:{request.url.path}"
        now = time.time()
        q = _hits[key]
        while q and q[0] < now - window_s:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(429, f"too many attempts, try again in {int(window_s - (now - q[0]))}s")
        q.append(now)
    return dep


# ------------------------------------------------------------------ inventory
def seed_inventory() -> int:
    """Stock per (item, size) seeded from demand: popular items carry more units; a few sizes start low or sold out."""
    with session() as s:
        if s.execute(select(func.count(Stock.id))).scalar():
            return 0
        rng = np.random.default_rng(11)
        n = 0
        for p in _products_ref.values():
            base = int(np.clip(3 + np.log1p(p["stats"]["orders"]) * 6, 3, 60))
            for size in (p.get("sizes") or ["One size"]):
                r = rng.random()
                qty = 0 if r < 0.04 else (int(rng.integers(1, 4)) if r < 0.15 else int(base * rng.uniform(0.5, 1.5)))
                s.add(Stock(item_id=p["id"], size=size, qty=qty))
                n += 1
        return n


@router.get("/products/{item_id}/stock")
def stock(item_id: str) -> dict:
    with session() as s:
        rows = s.execute(select(Stock).where(Stock.item_id == item_id)).scalars().all()
    sizes = {r.size: r.qty for r in rows}
    total = sum(sizes.values())
    return {"sizes": sizes, "total": total, "status": "sold_out" if total == 0 else ("low" if total <= 5 else "in_stock"),
            "lowStockSizes": [k for k, v in sizes.items() if 0 < v <= 3], "soldOutSizes": [k for k, v in sizes.items() if v == 0]}


def reserve_stock(lines: list[dict]) -> list[str]:
    """Decrement inventory for ordered lines; returns a list of problems (empty when fine)."""
    problems = []
    with session() as s:
        for l in lines:
            size = l.get("size") or (next(iter(_products_ref.get(l["id"], {}).get("sizes", ["One size"])), "One size"))
            row = s.execute(select(Stock).where(Stock.item_id == l["id"], Stock.size == size)).scalar_one_or_none()
            if row is None:
                continue
            if row.qty < l["qty"]:
                problems.append(f"{l['name']} (size {size}) has only {row.qty} left")
            else:
                row.qty -= l["qty"]
    return problems


# ------------------------------------------------------------------ order lifecycle
STAGES = [("confirmed", 0), ("packed", 6 * 3600), ("shipped", 24 * 3600), ("out_for_delivery", None), ("delivered", None)]


def order_status(data: dict, stored_status: str) -> tuple[str, list[dict]]:
    """Time-driven progression unless the order was cancelled/returned."""
    if stored_status in ("cancelled", "return_requested", "returned"):
        tl = data.get("timeline", [])
        return stored_status, tl
    placed, eta = data.get("placedAt", time.time()), data.get("eta", time.time() + 5 * 86400)
    now = time.time()
    steps = {"confirmed": placed, "packed": placed + 6 * 3600, "shipped": placed + 24 * 3600, "out_for_delivery": eta - 12 * 3600, "delivered": eta}
    status = "confirmed"
    tl = []
    for k, t in steps.items():
        done = now >= t
        tl.append({"status": k, "ts": t, "done": done})
        if done:
            status = k
    return status, tl


class OrderAction(BaseModel):
    reason: str = ""


@router.post("/orders/{oid}/cancel")
def cancel_order(oid: str, req: OrderAction, uid: Optional[int] = Depends(current_user_id), visitorId: Optional[str] = None) -> dict:
    with session() as s:
        o = s.get(Order, oid)
        if not o or (o.user_id and o.user_id != uid) or (not o.user_id and visitorId and o.visitor_id != visitorId):
            raise HTTPException(404, "order not found")
        data = json.loads(o.data_json)
        status, _ = order_status(data, o.status)
        if status in ("shipped", "out_for_delivery", "delivered"):
            raise HTTPException(400, "this order has already shipped - request a return after delivery instead")
        if status == "cancelled":
            return {"status": "cancelled"}
        o.status = "cancelled"
        data.setdefault("timeline", []).append({"status": "cancelled", "ts": time.time(), "reason": req.reason})
        o.data_json = json.dumps(data)
        # restock + refund points
        for l in data.get("lines", []):
            row = s.execute(select(Stock).where(Stock.item_id == l["id"], Stock.size == (l.get("size") or "One size"))).scalar_one_or_none()
            if row:
                row.qty += l["qty"]
        if o.user_id:
            u = s.get(User, o.user_id)
            u.points = max(0, u.points - data.get("pointsEarned", 0) + data.get("pointsUsed", 0))
            s.add(PointsLedger(user_id=o.user_id, delta=-data.get("pointsEarned", 0) + data.get("pointsUsed", 0), reason="Order cancelled", ref=oid))
    return {"status": "cancelled"}


@router.post("/orders/{oid}/return")
def return_order(oid: str, req: OrderAction, uid: Optional[int] = Depends(current_user_id), visitorId: Optional[str] = None) -> dict:
    with session() as s:
        o = s.get(Order, oid)
        if not o or (o.user_id and o.user_id != uid) or (not o.user_id and visitorId and o.visitor_id != visitorId):
            raise HTTPException(404, "order not found")
        data = json.loads(o.data_json)
        status, _ = order_status(data, o.status)
        if status != "delivered":
            raise HTTPException(400, "returns can be requested once the order is delivered")
        if time.time() > data.get("eta", 0) + 30 * 86400:
            raise HTTPException(400, "the 30-day return window has closed")
        o.status = "return_requested"
        data.setdefault("timeline", []).append({"status": "return_requested", "ts": time.time(), "reason": req.reason})
        o.data_json = json.dumps(data)
    return {"status": "return_requested", "pickup": "A courier will collect the parcel within 2 business days; refund to the original method within 5 days of pickup."}


# ------------------------------------------------------------------ live trending (closing the loop without a retrain)
@router.get("/trending/live")
def trending_live(window_h: int = 24, limit: int = 12) -> dict:
    since = time.time() - window_h * 3600
    w = {"view_item": 1.0, "add_to_cart": 3.0, "wishlist": 2.0, "purchase": 5.0, "click": 0.5}
    with session() as s:
        rows = s.execute(select(RichEvent.item_id, RichEvent.type, func.count(RichEvent.id)).where(RichEvent.ts >= since, RichEvent.item_id != "")
                         .group_by(RichEvent.item_id, RichEvent.type)).all()
    score: dict[str, float] = defaultdict(float)
    for iid, t, n in rows:
        score[iid] += w.get(t, 0.5) * n
    top = sorted(score.items(), key=lambda x: -x[1])[:limit]
    return {"windowHours": window_h, "events": int(sum(n for _, _, n in rows)),
            "items": [{**_products_ref[i], "liveScore": round(v, 1), "why": f"Trending in the last {window_h}h"} for i, v in top if i in _products_ref]}


def live_trend_vector(items: list[str], window_h: int = 24) -> np.ndarray | None:
    """Normalised live-trend distribution over the model's item list (None when there is no signal)."""
    try:
        t = trending_live(window_h, limit=500)
    except Exception:  # noqa: BLE001
        return None
    if not t["items"]:
        return None
    idx = {it: i for i, it in enumerate(items)}
    v = np.zeros(len(items), np.float32)
    for p in t["items"]:
        j = idx.get(p["id"])
        if j is not None:
            v[j] = p["liveScore"]
    return v / v.sum() if v.sum() > 0 else None


# ------------------------------------------------------------------ privacy: export & delete my data
@router.get("/me/export")
def export_me(uid: int = Depends(require_user)) -> dict:
    with session() as s:
        u = s.get(User, uid)
        out = {"user": {"email": u.email, "name": u.name, "provider": u.provider, "points": u.points, "profile": u.profile, "createdAt": u.created_at},
               "addresses": [json.loads(a.data_json) for a in s.execute(select(Address).where(Address.user_id == uid)).scalars()],
               "orders": [{"orderId": o.id, "status": o.status, "total": o.total, "createdAt": o.created_at} for o in s.execute(select(Order).where(Order.user_id == uid)).scalars()],
               "wishlist": [w.item_id for w in s.execute(select(WishlistItem).where(WishlistItem.user_id == uid)).scalars()],
               "reviews": [{"itemId": r.item_id, "rating": r.rating, "title": r.title, "body": r.body, "ts": r.ts} for r in s.execute(select(Review).where(Review.user_id == uid)).scalars()],
               "pointsLedger": [{"delta": p.delta, "reason": p.reason, "ts": p.ts} for p in s.execute(select(PointsLedger).where(PointsLedger.user_id == uid)).scalars()],
               "events": [{"type": e.type, "itemId": e.item_id, "ts": e.ts} for e in s.execute(select(UserEvent).where(UserEvent.user_id == uid)).scalars()]}
    return out


@router.delete("/me")
def delete_me(uid: int = Depends(require_user)) -> dict:
    with session() as s:
        for model in (Address, WishlistItem, CartItem, PointsLedger, UserEvent, RichEvent, CouponRedemption):
            for r in s.execute(select(model).where(model.user_id == uid)).scalars():
                s.delete(r)
        for r in s.execute(select(Review).where(Review.user_id == uid)).scalars():
            r.user_id = None; r.author = "Deleted user"
        for o in s.execute(select(Order).where(Order.user_id == uid)).scalars():
            o.user_id = None                      # orders kept for accounting, unlinked from the person
        u = s.get(User, uid)
        sub = u.provider_sub if u.provider == "clerk" else ""
        s.delete(u)
    from . import clerk
    if sub:
        clerk.forget(sub)
        clerk.delete_user(sub)       # also remove the sign-in identity at Clerk (best effort)
    return {"ok": True, "message": "Account deleted. Orders were anonymised and kept for accounting."}


# ------------------------------------------------------------------ currency (prices are stored in INR; others are display conversions)
RATES = {"INR": 1.0, "USD": round(1 / C.USD_TO_INR, 6), "EUR": round(0.92 / C.USD_TO_INR, 6), "GBP": round(0.78 / C.USD_TO_INR, 6), "AED": round(3.67 / C.USD_TO_INR, 6)}


@router.get("/meta/currency")
def currency() -> dict:
    return {"base": "INR", "default": "INR", "rates": RATES, "symbols": {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£", "AED": "AED "}, "locale": "en-IN"}
