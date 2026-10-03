"""Dynamic catalog: search/facets, reviews, delivery, similar, wishlist/cart sync, points ledger, offers, events."""

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
    return new_user("Cat Tester")["h"]


def test_search_and_facets(client):
    r = client.get("/api/v1/catalog/search", params={"q": "sneaker"}).json()
    assert r["total"] > 0 and all("sneaker" in (p["name"] + p["subcategory"]).lower() for p in r["items"][:5])
    f = client.get("/api/v1/catalog/search", params={"department": "footwear", "colour": "Black", "minPrice": 1000, "maxPrice": 10000, "sort": "price_asc"}).json()
    assert all(p["department"] == "footwear" and p["colour"] == "Black" and 1000 <= p["price"] <= 10000 for p in f["items"])
    prices = [p["price"] for p in f["items"]]
    assert prices == sorted(prices)
    assert {"brand", "colour", "size", "style", "material"} <= set(f["facets"])
    s = client.get("/api/v1/catalog/suggest", params={"q": "rol"}).json()
    assert any("Rolex" == b for b in s["brands"])


def test_product_attributes_and_similar(client):
    p = client.get("/api/v1/products/ITEM22").json()["product"]
    assert p["description"] and p["sizes"] and p["colour"] and isinstance(p["styles"], list)
    sim = client.get("/api/v1/products/ITEM22/similar", params={"limit": 6}).json()
    assert len(sim["items"]) == 6 and all(i["id"] != "ITEM22" for i in sim["items"])
    # catalog-only items are reachable and get content-based similar items
    new = client.get("/api/v1/catalog/search", params={"isNew": "true", "limit": 5}).json()
    assert new["total"] > 0
    cid = next((i["id"] for i in new["items"] if i["catalogOnly"]), None)
    if cid:
        assert len(client.get(f"/api/v1/products/{cid}/similar").json()["items"]) > 0


def test_reviews(client, auth):
    before = client.get("/api/v1/products/ITEM22/reviews").json()
    r = client.post("/api/v1/products/ITEM22/reviews", json={"rating": 4, "title": "Nice", "body": "Good fit", "sizeFit": "true"}, headers=auth).json()
    assert r["summary"]["count"] == before["summary"]["count"] + 1
    assert r["reviews"][0]["source"] == "user" and r["reviews"][0]["author"] == "Cat Tester"
    assert all(rv["source"] in ("user", "demo") for rv in r["reviews"])


def test_delivery_estimate(client):
    d = client.get("/api/v1/delivery/estimate", params={"region": "Maharashtra", "shipping": "express"}).json()
    assert 1 <= d["minDays"] < d["maxDays"] <= 6 and "Express" in d["text"]
    assert client.get("/api/v1/delivery/estimate", params={"country": "United States"}).json()["zone"] == "intl"


def test_wishlist_cart_points_offers_settings(client, auth):
    assert client.post("/api/v1/me/wishlist", json={"itemId": "ITEM7"}, headers=auth).json()["ok"]
    assert [w["id"] for w in client.get("/api/v1/me/wishlist", headers=auth).json()] == ["ITEM7"]
    client.delete("/api/v1/me/wishlist/ITEM7", headers=auth)
    assert client.get("/api/v1/me/wishlist", headers=auth).json() == []
    cart = client.put("/api/v1/me/cart", json={"items": [{"itemId": "ITEM22", "size": "M", "qty": 2}], "merge": True}, headers=auth).json()
    assert cart == [{"id": "ITEM22", "size": "M", "qty": 2}]
    pts = client.get("/api/v1/me/points", headers=auth).json()
    assert pts["balance"] == 250 and pts["ledger"][0]["reason"] == "Welcome bonus"
    off = client.get("/api/v1/me/offers", headers=auth).json()
    assert any(c["code"] == "WELCOME10" and c["available"] for c in off["coupons"])
    st = client.put("/api/v1/me/settings", json={"newsletter": False, "theme": "dark"}, headers=auth).json()
    assert st["newsletter"] is False and st["theme"] == "dark"
    assert client.post("/api/v1/events/rich", json={"visitorId": "v9", "type": "search", "meta": {"q": "boots"}}).json()["ok"]
    assert client.get("/api/v1/events/stats").json()["byType"].get("search", 0) >= 1


def test_payment_methods(client):
    q = client.post("/api/v1/checkout/quote", json={"items": [{"id": "ITEM22", "qty": 1}], "paymentMethod": "credit_card", "bankCard": True}).json()
    assert {m["id"] for m in q["paymentMethods"]} >= {"credit_card", "debit_card", "upi", "netbanking", "wallet", "cod"}
    assert q["bankDiscount"] > 0
    assert client.post("/api/v1/checkout/quote", json={"items": [{"id": "ITEM22", "qty": 1}], "paymentMethod": "debit_card", "bankCard": True}).json()["bankDiscount"] == 0
