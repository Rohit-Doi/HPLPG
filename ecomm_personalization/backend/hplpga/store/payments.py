"""Razorpay payments (India). Test mode works on localhost with test keys; live mode needs KYC.

Flow (standard Razorpay Checkout):
  1. frontend -> POST /payments/razorpay/order  (bag, coupon, points, shipping, payment method)
     backend re-prices the bag with the promotions engine, creates a Razorpay order for that exact amount
     (paise) and remembers it as a payment intent.
  2. frontend opens Razorpay Checkout (checkout.js) with the order id; the customer pays with UPI / card /
     net banking / wallet inside Razorpay's own PCI-compliant window (we never see card data).
  3. Razorpay returns {razorpay_order_id, razorpay_payment_id, razorpay_signature}; the frontend sends them to
     POST /checkout/order. The backend verifies HMAC_SHA256(order_id|payment_id, key_secret) == signature and that
     the intent's amount equals the re-computed total before creating the order.

Keys:  RAZORPAY_KEY_ID=rzp_test_...   RAZORPAY_KEY_SECRET=...
Without keys, checkout stays in simulated mode (clearly labelled in the UI).
"""
from __future__ import annotations

import hashlib
import hmac
import os
import time
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from sqlalchemy import Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base, session

router = APIRouter(prefix="/api/v1")
API = "https://api.razorpay.com/v1"


class PaymentIntent(Base):
    __tablename__ = "payment_intents"
    razorpay_order_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    amount_paise: Mapped[int] = mapped_column(Integer)
    user_id: Mapped[int] = mapped_column(Integer, nullable=True)
    visitor_id: Mapped[str] = mapped_column(String(64), default="")
    status: Mapped[str] = mapped_column(String(16), default="created")   # created | paid | used
    payment_id: Mapped[str] = mapped_column(String(64), default="")
    meta_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


def key_id() -> str:
    return os.getenv("RAZORPAY_KEY_ID", "")


def enabled() -> bool:
    return bool(os.getenv("RAZORPAY_KEY_ID") and os.getenv("RAZORPAY_KEY_SECRET"))


def mode() -> str:
    if not enabled():
        return "simulated"
    return "test" if key_id().startswith("rzp_test_") else "live"


def verify_signature(order_id: str, payment_id: str, signature: str, secret: Optional[str] = None) -> bool:
    secret = secret or os.getenv("RAZORPAY_KEY_SECRET", "")
    expected = hmac.new(secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    return bool(secret) and hmac.compare_digest(expected, signature or "")


def create_order(amount_rupees: float, receipt: str, notes: dict) -> dict:
    """Create a Razorpay order (amount in paise). Raises HTTPException on gateway errors."""
    paise = int(round(amount_rupees * 100))
    try:
        r = httpx.post(f"{API}/orders", auth=(os.environ["RAZORPAY_KEY_ID"], os.environ["RAZORPAY_KEY_SECRET"]),
                       json={"amount": paise, "currency": "INR", "receipt": receipt[:40], "notes": {k: str(v)[:250] for k, v in notes.items()}},
                       timeout=15.0)
    except httpx.HTTPError as e:
        raise HTTPException(502, f"could not reach Razorpay: {e}") from e
    if r.status_code != 200:
        raise HTTPException(502, f"Razorpay rejected the order: {r.text[:200]}")
    return r.json()


@router.get("/payments/config")
def config() -> dict:
    return {"provider": "razorpay" if enabled() else "simulated", "mode": mode(), "keyId": key_id() if enabled() else None,
            "currency": "INR", "merchantName": os.getenv("RAZORPAY_MERCHANT_NAME", "AURA"),
            "note": None if enabled() else "Payments are simulated. Add RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET to backend/.env for Razorpay test mode."}


def register_intent(rp_order: dict, user_id: Optional[int], visitor_id: Optional[str], meta: str) -> None:
    with session() as s:
        s.add(PaymentIntent(razorpay_order_id=rp_order["id"], amount_paise=int(rp_order["amount"]), user_id=user_id,
                            visitor_id=visitor_id or "", meta_json=meta))


def consume_intent(order_id: str, payment_id: str, signature: str, expected_rupees: float) -> None:
    """Validate a Razorpay payment for an order about to be created; raises HTTPException when invalid."""
    if not verify_signature(order_id, payment_id, signature):
        raise HTTPException(400, "payment signature verification failed")
    with session() as s:
        intent = s.get(PaymentIntent, order_id)
        if intent is None:
            raise HTTPException(400, "unknown payment order")
        if intent.status == "used":
            raise HTTPException(409, "this payment was already used for an order")
        if intent.amount_paise != int(round(expected_rupees * 100)):
            raise HTTPException(409, "the bag changed after payment started - the payment amount no longer matches; please retry")
        intent.status = "used"
        intent.payment_id = payment_id
