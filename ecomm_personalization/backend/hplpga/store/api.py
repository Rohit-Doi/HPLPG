"""Storefront API: accounts, onboarding profile, addresses, checkout, orders, history, merchandising data."""
from __future__ import annotations

import json
import secrets
import time
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from .. import config as C
from . import clerk, promotions as P
from .db import Address, Order, User, UserEvent, init_db, session, user_history

router = APIRouter(prefix="/api/v1")
init_db()

_products_ref: dict = {}   # injected by api.main (item id -> product dict)


def set_products(products: dict) -> None:
    _products_ref.clear()
    _products_ref.update(products)


# ------------------------------------------------------------------ auth plumbing
def current_user_id(authorization: Optional[str] = Header(None)) -> Optional[int]:
    """Signed-in user from a Clerk session token (Authorization: Bearer <jwt>); None for guests or invalid tokens."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    claims = clerk.verify(authorization.split(" ", 1)[1].strip())
    return clerk.link_user(claims) if claims else None


def require_user(uid: Optional[int] = Depends(current_user_id)) -> int:
    if uid is None:
        raise HTTPException(401, "sign in required")
    return uid


def _public(u: User) -> dict:
    prof = u.profile
    return {"id": u.id, "email": u.email, "name": u.name or u.email.split("@")[0], "provider": u.provider, "avatar": u.avatar,
            "points": u.points, "profile": prof, "onboarded": bool(prof.get("onboarded")),
            "memberSince": time.strftime("%Y-%m-%d", time.gmtime(u.created_at))}


# ------------------------------------------------------------------ models
class ProfileReq(BaseModel):
    name: Optional[str] = None
    gender: Optional[str] = None
    ageGroup: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None
    city: Optional[str] = None
    preferredDepartments: list[str] = []
    styles: list[str] = []
    sizes: dict = {}
    budget: Optional[str] = None
    newsletter: bool = True
    onboarded: bool = True


class AddressReq(BaseModel):
    name: str
    line1: str
    line2: str = ""
    city: str
    region: str
    postalCode: str
    country: str = "India"
    phone: str = ""
    isDefault: bool = False


class CartItem(BaseModel):
    id: str
    qty: int = 1
    size: Optional[str] = None


class QuoteReq(BaseModel):
    items: list[CartItem]
    coupon: Optional[str] = None
    usePoints: int = 0
    shipping: str = "standard"
    paymentMethod: str = "card"
    bankCard: bool = False
    visitorId: Optional[str] = None


class PaymentProof(BaseModel):
    provider: str = "razorpay"
    razorpayOrderId: str
    razorpayPaymentId: str
    razorpaySignature: str


class OrderReq(QuoteReq):
    address: AddressReq
    payment: Optional[PaymentProof] = None
    email: Optional[str] = None


class HistoryEvent(BaseModel):
    visitorId: Optional[str] = None
    type: str
    itemId: str


# ------------------------------------------------------------------ auth routes
@router.get("/auth/providers")
def providers() -> dict:
    """Sign-in is handled by Clerk (email codes, Google, phone OTP... configured in the Clerk dashboard)."""
    return {"provider": "clerk", "enabled": clerk.enabled(), "frontendApi": clerk.frontend_api() or None,
            "backendLookup": bool(clerk.secret_key())}


@router.get("/auth/me")
def me(uid: int = Depends(require_user)) -> dict:
    with session() as s:
        u = s.get(User, uid)
        if not u:
            raise HTTPException(401, "unknown user")
        u.last_login = time.time()
        return _public(u)


# ------------------------------------------------------------------ profile / addresses
@router.put("/me/profile")
def put_profile(req: ProfileReq, uid: int = Depends(require_user)) -> dict:
    with session() as s:
        u = s.get(User, uid)
        data = req.model_dump()
        if data.pop("name", None):
            u.name = req.name.strip()[:120]
        prof = {**u.profile, **{k: v for k, v in data.items() if v not in (None, [], {})}, "onboarded": req.onboarded,
                "updatedAt": time.time()}
        u.profile_json = json.dumps(prof)
        return _public(u)


@router.get("/me/addresses")
def addresses(uid: int = Depends(require_user)) -> list[dict]:
    with session() as s:
        rows = s.execute(select(Address).where(Address.user_id == uid)).scalars().all()
        return [{"id": a.id, **json.loads(a.data_json), "isDefault": bool(a.is_default)} for a in rows]


@router.post("/me/addresses")
def add_address(req: AddressReq, uid: int = Depends(require_user)) -> dict:
    with session() as s:
        if req.isDefault:
            for a in s.execute(select(Address).where(Address.user_id == uid)).scalars():
                a.is_default = 0
        a = Address(user_id=uid, data_json=json.dumps(req.model_dump(exclude={"isDefault"})), is_default=int(req.isDefault))
        s.add(a)
        s.flush()
        return {"id": a.id, **req.model_dump()}


@router.put("/me/addresses/{aid}")
def put_address(aid: int, req: AddressReq, uid: int = Depends(require_user)) -> dict:
    with session() as s:
        a = s.get(Address, aid)
        if not a or a.user_id != uid:
            raise HTTPException(404, "address not found")
        if req.isDefault:
            for other in s.execute(select(Address).where(Address.user_id == uid)).scalars():
                other.is_default = 0
        a.data_json = json.dumps(req.model_dump(exclude={"isDefault"}))
        a.is_default = int(req.isDefault)
        return {"id": a.id, **req.model_dump()}


@router.delete("/me/addresses/{aid}")
def del_address(aid: int, uid: int = Depends(require_user)) -> dict:
    with session() as s:
        a = s.get(Address, aid)
        if a and a.user_id == uid:
            s.delete(a)
    return {"ok": True}


# ------------------------------------------------------------------ history (feeds Level-4 personalization)
@router.post("/me/history")
def history_event(ev: HistoryEvent, uid: Optional[int] = Depends(current_user_id)) -> dict:
    if ev.type not in ("view_item", "add_to_cart", "purchase") or ev.itemId not in _products_ref:
        return {"ok": False}
    with session() as s:
        s.add(UserEvent(user_id=uid, visitor_id=ev.visitorId or "", type=ev.type, item_id=ev.itemId))
    return {"ok": True}


@router.get("/me/history")
def get_history(uid: Optional[int] = Depends(current_user_id), visitorId: Optional[str] = None) -> dict:
    h = user_history(uid, visitorId)
    return {k: [_products_ref[i] for i in v if i in _products_ref] for k, v in h.items()}


# ------------------------------------------------------------------ checkout
def _first_order(uid: Optional[int], visitor_id: Optional[str]) -> bool:
    with session() as s:
        q = select(Order.id)
        if uid:
            q = q.where(Order.user_id == uid)
        elif visitor_id:
            q = q.where(Order.visitor_id == visitor_id)
        else:
            return True
        return s.execute(q.limit(1)).first() is None


def _points(uid: Optional[int]) -> int:
    if not uid:
        return 0
    with session() as s:
        u = s.get(User, uid)
        return u.points if u else 0


@router.post("/checkout/quote")
def checkout_quote(req: QuoteReq, uid: Optional[int] = Depends(current_user_id)) -> dict:
    q = P.quote([i.model_dump() for i in req.items], _products_ref, req.coupon, req.usePoints, req.shipping, req.paymentMethod,
                _first_order(uid, req.visitorId), _points(uid), req.bankCard)
    q["pointsBalance"] = _points(uid)
    q["signedIn"] = uid is not None
    return q


@router.post("/payments/razorpay/order")
def razorpay_order(req: QuoteReq, uid: Optional[int] = Depends(current_user_id)) -> dict:
    from . import payments as PAY
    if not PAY.enabled():
        raise HTTPException(400, "Razorpay is not configured (payments are simulated)")
    if req.paymentMethod == "cod":
        raise HTTPException(400, "cash on delivery does not need an online payment")
    q = P.quote([i.model_dump() for i in req.items], _products_ref, req.coupon, req.usePoints, req.shipping, req.paymentMethod,
                _first_order(uid, req.visitorId), _points(uid), req.bankCard)
    if q["errors"] or not q["lines"]:
        raise HTTPException(400, "; ".join(q["errors"]) or "your bag is empty")
    rp = PAY.create_order(q["total"], receipt=f"aura-{int(time.time())}", notes={"user": uid or "", "visitor": req.visitorId or "",
                                                                              "items": ",".join(l["id"] for l in q["lines"])})
    PAY.register_intent(rp, uid, req.visitorId, json.dumps({"items": [i.model_dump() for i in req.items], "total": q["total"]}))
    prefill = {}
    if uid:
        with session() as s:
            u = s.get(User, uid)
            prefill = {"name": u.name, "email": u.email}
    return {"razorpayOrderId": rp["id"], "amount": rp["amount"], "currency": "INR", "keyId": PAY.key_id(),
            "merchantName": "AURA", "description": f"{len(q['lines'])} item(s)", "prefill": prefill, "total": q["total"]}


@router.post("/checkout/order")
def place_order(req: OrderReq, uid: Optional[int] = Depends(current_user_id)) -> dict:
    q = P.quote([i.model_dump() for i in req.items], _products_ref, req.coupon, req.usePoints, req.shipping, req.paymentMethod,
                _first_order(uid, req.visitorId), _points(uid), req.bankCard)
    if q["errors"]:
        raise HTTPException(400, "; ".join(q["errors"]))
    if not q["lines"]:
        raise HTTPException(400, "your bag is empty")
    from . import payments as PAY
    payment_info = {"provider": "simulated", "mode": PAY.mode()}
    if PAY.enabled() and req.paymentMethod != "cod":
        if req.payment is None:
            raise HTTPException(402, "payment required: complete the Razorpay payment first")
        PAY.consume_intent(req.payment.razorpayOrderId, req.payment.razorpayPaymentId, req.payment.razorpaySignature, q["total"])
        payment_info = {"provider": "razorpay", "mode": PAY.mode(), "razorpayOrderId": req.payment.razorpayOrderId,
                        "razorpayPaymentId": req.payment.razorpayPaymentId, "status": "captured"}
    elif req.paymentMethod == "cod":
        payment_info = {"provider": "cod", "mode": "cash", "status": "pay_on_delivery"}
    from .ops import reserve_stock
    for l, it in zip(q["lines"], req.items):
        l["size"] = it.size
    problems = reserve_stock(q["lines"])
    if problems:
        raise HTTPException(409, "; ".join(problems))
    oid = "AU" + time.strftime("%y%m%d") + secrets.token_hex(3).upper()
    eta = time.time() + (2 if req.shipping == "express" else 5) * 86400
    data = {**q, "address": req.address.model_dump(), "paymentMethod": req.paymentMethod, "email": req.email, "payment": payment_info,
            "placedAt": time.time(), "eta": eta, "timeline": [{"status": "confirmed", "ts": time.time()}]}
    with session() as s:
        s.add(Order(id=oid, user_id=uid, visitor_id=req.visitorId or "", total=q["total"], status="confirmed", data_json=json.dumps(data)))
        for l in q["lines"]:
            s.add(UserEvent(user_id=uid, visitor_id=req.visitorId or "", type="purchase", item_id=l["id"]))
        if uid:
            u = s.get(User, uid)
            u.points = max(0, u.points - q["pointsUsed"]) + q["pointsEarned"]
            from .models_ext import CouponRedemption, PointsLedger
            if q["pointsUsed"]:
                s.add(PointsLedger(user_id=uid, delta=-q["pointsUsed"], reason="Redeemed at checkout", ref=oid))
            s.add(PointsLedger(user_id=uid, delta=q["pointsEarned"], reason="Earned on order", ref=oid))
            if q.get("coupon"):
                s.add(CouponRedemption(user_id=uid, visitor_id=req.visitorId or "", code=q["coupon"]["code"], order_id=oid, discount=q["couponDiscount"]))
    to = req.email
    if not to and uid:
        with session() as s:
            u = s.get(User, uid)
            to = u.email if u else None
    if to:
        from .mailer import order_confirmation
        order_confirmation(to, {"orderId": oid, **data})
    return {"orderId": oid, "status": "confirmed", "eta": eta, **data, "pointsBalance": _points(uid)}


def _order_view(o) -> dict:
    from .ops import order_status
    data = json.loads(o.data_json)
    status, timeline = order_status(data, o.status)
    return {"orderId": o.id, "status": status, "total": o.total, "createdAt": o.created_at, **data, "timeline": timeline,
            "canCancel": status in ("confirmed", "packed"), "canReturn": status == "delivered"}


@router.get("/me/orders")
def orders(uid: int = Depends(require_user)) -> list[dict]:
    with session() as s:
        rows = s.execute(select(Order).where(Order.user_id == uid).order_by(Order.created_at.desc())).scalars().all()
        return [_order_view(o) for o in rows]


@router.get("/orders/{oid}")
def order(oid: str, uid: Optional[int] = Depends(current_user_id), visitorId: Optional[str] = None) -> dict:
    with session() as s:
        o = s.get(Order, oid)
        if not o or (o.user_id and o.user_id != uid) or (not o.user_id and visitorId and o.visitor_id != visitorId):
            raise HTTPException(404, "order not found")
        return _order_view(o)


# ------------------------------------------------------------------ merchandising data
@router.get("/storefront")
def storefront() -> dict:
    p = C.FRONTEND_DATA / "storefront.json"
    b = C.FRONTEND_DATA / "banners.json"
    return {**(json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}),
            "banners": json.loads(b.read_text(encoding="utf-8")) if b.exists() else []}
