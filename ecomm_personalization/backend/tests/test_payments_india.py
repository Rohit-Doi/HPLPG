"""Rupee pricing, Indian delivery zones, Razorpay signature/amount checks, integration health."""
import hashlib
import hmac
import uuid

import pytest
from fastapi.testclient import TestClient

from hplpga import config as C

pytestmark = pytest.mark.skipif(not (C.MODELS_DIR / "model.joblib").exists(), reason="artifacts not built")
ADDR = {"name": "Test", "line1": "12 MG Road", "city": "Bengaluru", "region": "Karnataka", "postalCode": "560001", "country": "India"}


@pytest.fixture(scope="module")
def client():
    from hplpga.api.main import app
    with TestClient(app) as c:
        yield c


def test_prices_are_rupees(client):
    p = client.get("/api/v1/products/ITEM22").json()["product"]
    assert p["price"] > 1000 and int(p["price"]) % 10 == 9          # retail ending ...9
    assert C.retail_inr(846.0) == 849.0 and C.retail_inr(9230.0) == 9249.0
    from hplpga.store.promotions import rupees
    assert rupees(123456) == "₹1,23,456" and rupees(999) == "₹999"
    h = client.get("/health").json()
    assert h["currency"] == "INR" and {"database", "payments", "email", "auth"} <= set(h["integrations"])


def test_india_delivery(client):
    metro = client.get("/api/v1/delivery/estimate", params={"region": "Karnataka"}).json()
    remote = client.get("/api/v1/delivery/estimate", params={"region": "Ladakh"}).json()
    assert metro["zone"] == "metro" and remote["zone"] == "remote" and metro["maxDays"] < remote["maxDays"]
    assert client.get("/api/v1/delivery/estimate", params={"postalCode": "400001"}).json()["zone"] == "metro"   # Mumbai PIN
    assert client.get("/api/v1/delivery/estimate", params={"postalCode": "12AB"}).status_code == 400
    assert len(client.get("/api/v1/meta/india-states").json()["states"]) == 36


def test_simulated_mode_without_keys(client, monkeypatch):
    monkeypatch.delenv("RAZORPAY_KEY_ID", raising=False)
    monkeypatch.delenv("RAZORPAY_KEY_SECRET", raising=False)
    assert client.get("/api/v1/payments/config").json()["provider"] == "simulated"
    o = client.post("/api/v1/checkout/order", json={"items": [{"id": "ITEM7", "qty": 1, "size": "One size"}], "paymentMethod": "upi", "address": ADDR}).json()
    assert o["payment"]["provider"] == "simulated"


def test_razorpay_flow(client, monkeypatch):
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_dummy")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "test_secret")
    from hplpga.store import payments as PAY
    created = {}
    oid = f"order_{uuid.uuid4().hex[:14]}"

    def fake_create(amount_rupees, receipt, notes):
        created["paise"] = int(round(amount_rupees * 100))
        return {"id": oid, "amount": created["paise"], "currency": "INR"}
    monkeypatch.setattr(PAY, "create_order", fake_create)
    cfg = client.get("/api/v1/payments/config").json()
    assert cfg["provider"] == "razorpay" and cfg["mode"] == "test"
    body = {"items": [{"id": "ITEM7", "qty": 1, "size": "One size"}], "paymentMethod": "upi", "shipping": "standard"}
    rp = client.post("/api/v1/payments/razorpay/order", json=body).json()
    assert rp["razorpayOrderId"] == oid and rp["amount"] == created["paise"] and rp["keyId"] == "rzp_test_dummy"
    # order without payment proof is refused
    assert client.post("/api/v1/checkout/order", json={**body, "address": ADDR}).status_code == 402
    # forged signature is refused
    bad = {"razorpayOrderId": oid, "razorpayPaymentId": "pay_1", "razorpaySignature": "deadbeef"}
    assert client.post("/api/v1/checkout/order", json={**body, "address": ADDR, "payment": bad}).status_code == 400
    # valid signature -> order created, intent consumed
    sig = hmac.new(b"test_secret", f"{oid}|pay_1".encode(), hashlib.sha256).hexdigest()
    good = {**bad, "razorpaySignature": sig}
    o = client.post("/api/v1/checkout/order", json={**body, "address": ADDR, "payment": good})
    assert o.status_code == 200 and o.json()["payment"]["provider"] == "razorpay"
    # replaying the same payment is refused
    assert client.post("/api/v1/checkout/order", json={**body, "address": ADDR, "payment": good}).status_code == 409
    # COD never needs Razorpay
    cod = client.post("/api/v1/checkout/order", json={**body, "paymentMethod": "cod", "address": ADDR}).json()
    assert cod["payment"]["provider"] == "cod"
