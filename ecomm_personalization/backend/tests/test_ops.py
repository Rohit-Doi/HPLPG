"""Inventory, order lifecycle (cancel/return), live trending, password reset, privacy export/delete, currency."""

import pytest
from fastapi.testclient import TestClient

from hplpga import config as C
from conftest import new_user

pytestmark = pytest.mark.skipif(not (C.MODELS_DIR / "model.joblib").exists(), reason="artifacts not built")


@pytest.fixture(scope="module")
def client():
    from hplpga.api.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def auth(client):
    return new_user("Ops Tester")


def test_stock_and_order_lifecycle(client, auth):
    st = client.get("/api/v1/products/ITEM22/stock").json()
    assert "sizes" in st
    size = next((s for s, q in st["sizes"].items() if q >= 1), None)
    assert size, "expected at least one size in stock"
    before = st["sizes"][size]
    addr = {"name": "Ops", "line1": "1 St", "city": "Miami", "region": "Florida", "postalCode": "33101"}
    o = client.post("/api/v1/checkout/order", json={"items": [{"id": "ITEM22", "qty": 1, "size": size}], "address": addr}, headers=auth["h"]).json()
    assert client.get("/api/v1/products/ITEM22/stock").json()["sizes"][size] == before - 1
    view = client.get(f"/api/v1/orders/{o['orderId']}", headers=auth["h"]).json()
    assert view["status"] == "confirmed" and view["canCancel"] and len(view["timeline"]) == 5
    r = client.post(f"/api/v1/orders/{o['orderId']}/cancel", json={"reason": "changed my mind"}, headers=auth["h"]).json()
    assert r["status"] == "cancelled"
    assert client.get("/api/v1/products/ITEM22/stock").json()["sizes"][size] == before   # restocked
    assert client.post(f"/api/v1/orders/{o['orderId']}/return", json={}, headers=auth["h"]).status_code == 400


def test_live_trending_and_currency(client):
    for _ in range(3):
        client.post("/api/v1/events/rich", json={"visitorId": "t1", "type": "add_to_cart", "itemId": "ITEM7"})
    t = client.get("/api/v1/trending/live").json()
    assert t["items"] and t["items"][0]["id"] == "ITEM7"
    cur = client.get("/api/v1/meta/currency").json()
    assert cur["base"] == "INR" and cur["rates"]["INR"] == 1 and cur["rates"]["USD"] < 1


def test_privacy_export_and_delete(client, auth):
    exp = client.get("/api/v1/me/export", headers=auth["h"]).json()
    assert exp["orders"], "the lifecycle test above placed an order for this account"
    assert exp["user"]["email"] == auth["email"] and "orders" in exp and "pointsLedger" in exp
    assert client.delete("/api/v1/me", headers=auth["h"]).json()["ok"]
    # the old account is gone; the same Clerk identity signing in again gets a brand-new, empty account
    again = client.get("/api/v1/auth/me", headers=auth["h"]).json()
    assert again["points"] == 250 and client.get("/api/v1/me/orders", headers=auth["h"]).json() == []
    ledger = client.get("/api/v1/me/points", headers=auth["h"]).json()["ledger"]
    assert [l["reason"] for l in ledger] == ["Welcome bonus"]
