"""Store tests: accounts, profile, checkout maths, orders, Level-4 personalization."""

import pytest
from fastapi.testclient import TestClient

from hplpga import config as C
from cryptography.hazmat.primitives.asymmetric import rsa
from conftest import FRONTEND_API, mint, new_user

pytestmark = pytest.mark.skipif(not (C.MODELS_DIR / "model.joblib").exists(), reason="artifacts not built")


@pytest.fixture(scope="module")
def client():
    from hplpga.api.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def account(client):
    u = new_user("Test Shopper")
    return {"email": u["email"], "headers": u["h"], "sub": u["sub"]}


def test_clerk_identity_and_token_checks(client, account):
    p = client.get("/api/v1/auth/providers").json()
    assert p["provider"] == "clerk" and p["enabled"] and p["frontendApi"] == FRONTEND_API
    me = client.get("/api/v1/auth/me", headers=account["headers"]).json()
    assert me["email"] == account["email"] and me["provider"] == "clerk" and me["points"] == 250 and not me["onboarded"]
    again = client.get("/api/v1/auth/me", headers=account["headers"]).json()
    assert again["id"] == me["id"], "the same Clerk user must map to the same account"
    pts = client.get("/api/v1/me/points", headers=account["headers"]).json()
    assert [l["reason"] for l in pts["ledger"]].count("Welcome bonus") == 1
    sub = account["sub"]
    bad_tokens = {
        "expired": mint(sub, exp_in=-120),
        "wrong issuer": mint(sub, iss="https://evil.clerk.accounts.dev"),
        "wrong origin": mint(sub, azp="https://evil.example"),
        "forged key": mint(sub, key=rsa.generate_private_key(public_exponent=65537, key_size=2048)),
        "garbage": "not.a.jwt",
    }
    for why, tok in bad_tokens.items():
        r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 401, why
    assert client.get("/api/v1/auth/me").status_code == 401
    for gone in ("/api/v1/auth/signup", "/api/v1/auth/login", "/api/v1/auth/google"):
        assert client.post(gone, json={}).status_code in (404, 405), gone


def test_deployed_storefront_origins(client, account, monkeypatch):
    """Tokens from the deployed storefront (exact URL or a preview-URL pattern) are accepted; other sites are not."""
    monkeypatch.setenv("HPLPGA_CORS_ORIGINS", "https://aura-store.vercel.app")
    monkeypatch.setenv("HPLPGA_CORS_ORIGIN_REGEX", r"https://aura-store-[a-z0-9-]+\.vercel\.app")
    sub = account["sub"]
    for origin, ok in [("https://aura-store.vercel.app", True), ("https://aura-store-git-main-rohit.vercel.app", True),
                       ("http://localhost:3000", True), ("https://aura-store.vercel.app.evil.example", False),
                       ("https://evil.vercel.app", False)]:
        r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {mint(sub, azp=origin)}"})
        assert (r.status_code == 200) is ok, origin


def test_profile_feeds_level2(client, account):
    r = client.put("/api/v1/me/profile", json={"gender": "female", "ageGroup": "25-34", "country": "United States", "region": "Florida",
                                               "preferredDepartments": ["jewellery", "women"]}, headers=account["headers"])
    assert r.json()["onboarded"] is True
    page = client.post("/api/v1/landing-page", json={"context": {"device": "mobile"}, "options": {"variant": "agent", "bandit": False}},
                       headers=account["headers"]).json()
    assert page["visitor"]["coldStartLevel"] == 2
    assert page["visitor"]["resolvedContext"]["gender"] == "female" and page["visitor"]["resolvedContext"]["geo"] == "Florida"
    assert page["inference"]["departmentAffinity"][0]["department"] == "jewellery"
    assert page["user"]["name"] == "Test Shopper"


def test_checkout_quote_rules(client):
    items = [{"id": "ITEM22", "qty": 2}, {"id": "ITEM7", "qty": 1}]
    q = client.post("/api/v1/checkout/quote", json={"items": items, "coupon": "WELCOME10", "shipping": "standard", "paymentMethod": "card", "bankCard": True}).json()
    assert q["errors"] == [] and q["subtotal"] > 0
    assert q["coupon"]["code"] == "WELCOME10" and 0 < q["couponDiscount"] <= 750
    assert q["shipping"]["cost"] == 0.0            # over $75
    assert q["bankDiscount"] > 0                    # card + bankCard + over $99
    assert q["total"] == round(q["subtotal"] - q["couponDiscount"] - q["bankDiscount"], 2)
    bad = client.post("/api/v1/checkout/quote", json={"items": items, "coupon": "NOPE"}).json()
    assert bad["errors"]
    cod = client.post("/api/v1/checkout/quote", json={"items": [{"id": "ITEM22", "qty": 1}], "paymentMethod": "cod", "shipping": "express"}).json()
    assert cod["codFee"] == 49 and cod["shipping"]["cost"] == 249


def test_order_points_and_level4(client, account):
    addr = {"name": "Test Shopper", "line1": "1 Main St", "city": "Miami", "region": "Florida", "postalCode": "33101", "country": "United States"}
    r = client.post("/api/v1/checkout/order", json={"items": [{"id": "ITEM22", "qty": 1}], "coupon": "WELCOME10", "shipping": "standard",
                                                    "paymentMethod": "card", "address": addr}, headers=account["headers"])
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["orderId"].startswith("AU") and o["pointsEarned"] > 0 and o["pointsBalance"] == 250 + o["pointsEarned"]
    # second order can't use the first-order coupon
    r2 = client.post("/api/v1/checkout/order", json={"items": [{"id": "ITEM7", "qty": 1}], "coupon": "WELCOME10", "address": addr}, headers=account["headers"])
    assert r2.status_code == 400
    orders = client.get("/api/v1/me/orders", headers=account["headers"]).json()
    assert orders[0]["orderId"] == o["orderId"]
    assert client.get(f"/api/v1/orders/{o['orderId']}", headers=account["headers"]).json()["orderId"] == o["orderId"]
    client.post("/api/v1/me/history", json={"type": "view_item", "itemId": "ITEM15"}, headers=account["headers"])
    page = client.post("/api/v1/landing-page", json={"context": {"device": "desktop"}, "options": {"variant": "agent", "bandit": False}},
                       headers=account["headers"]).json()
    assert page["visitor"]["coldStartLevel"] == 4 and page["user"]["returning"] is True
    ids = [m["id"] for m in page["modules"]]
    assert "history" in ids and "hero_carousel" in ids and "offer_strip" in ids and "category_grid" in ids
    rec_ids = [p["id"] for m in page["modules"] if m["type"] == "product_carousel" and m["id"] not in ("recall", "history") for p in m["products"]]
    assert "ITEM22" not in rec_ids, "already-purchased items must not be recommended again"


def test_storefront_data(client):
    d = client.get("/api/v1/storefront").json()
    assert len(d["banners"]) >= 15 and len(d["collections"]) >= 8 and d["promoSummary"]["onSale"] > 0
    assert any(c["text"].endswith("OFF") for c in d["departmentCampaigns"])
