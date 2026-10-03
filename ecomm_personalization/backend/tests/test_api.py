"""Integration tests - require pipeline artifacts (python -m hplpga.pipeline.run)."""
import pytest
from fastapi.testclient import TestClient

from hplpga import config as C

pytestmark = pytest.mark.skipif(not (C.MODELS_DIR / "model.joblib").exists(), reason="artifacts not built")


@pytest.fixture(scope="module")
def client():
    from hplpga.api.main import app
    with TestClient(app) as c:
        yield c


def test_health(client):
    assert client.get("/health").json()["status"] == "ok"


@pytest.mark.parametrize("ctx,session,level", [
    ({"device": "desktop"}, {}, 0),
    ({"device": "mobile", "utmSource": "Facebook", "utmMedium": "PaidSocial", "region": "California"}, {}, 1),
    ({"device": "mobile", "utmSource": "google", "utmMedium": "organic", "gender": "female", "ageGroup": "25-34"}, {}, 2),
    ({"device": "desktop", "preferredDepartment": "watches"}, {}, 2),
    ({"device": "desktop"}, {"viewedItems": ["ITEM22"], "cartedItems": ["ITEM22"]}, 3),
])
def test_landing_page_levels(client, ctx, session, level):
    page = client.post("/api/v1/landing-page", json={"context": ctx, "session": session, "options": {"variant": "agent"}}).json()
    assert page["visitor"]["coldStartLevel"] == level
    types = [m["type"] for m in page["modules"]]
    assert types[0] == "announcement" and "hero_carousel" in types and "product_carousel" in types
    ids = [p["id"] for m in page["modules"] if m["type"] == "product_carousel" and m["id"] != "recall" for p in m["products"]]
    assert len(ids) == len(set(ids)), "products must be de-duplicated across modules"
    assert all(m.get("reason") for m in page["modules"])
    assert page["experiment"]["variant"] == "agent"
    if level == 3:
        assert page["inference"]["intent"]["stage"] == "buy_now"
    if ctx.get("preferredDepartment"):
        assert page["inference"]["departmentAffinity"][0]["department"] == "watches"
        assert any(m["id"] == "audience" for m in page["modules"])


def test_gender_changes_audience(client):
    def share(gender):
        page = client.post("/api/v1/landing-page", json={"context": {"device": "mobile", "region": "Texas", "gender": gender, "ageGroup": "25-34"},
                                                        "options": {"variant": "agent", "bandit": False}}).json()
        rec = next(m for m in page["modules"] if m["id"] == "recommended")["products"]
        return sum(p["audience"] == "women" for p in rec) / len(rec), sum(p["audience"] == "men" for p in rec) / len(rec)
    fw, fm = share("female")
    mw, mm = share("male")
    assert fw > mw and mm > fm, "declared gender must move the audience mix of the recommendations"


def test_control_variant_and_events(client):
    page = client.post("/api/v1/landing-page", json={"visitorId": "v1", "context": {"device": "desktop"}, "options": {"variant": "control"}}).json()
    assert page["experiment"]["variant"] == "control"
    assert client.post("/api/v1/events", json={"visitorId": "v1", "type": "impression", "pageId": page["pageId"], "moduleId": "recommended"}).json()["ok"]
    assert client.post("/api/v1/events", json={"visitorId": "v1", "type": "click", "pageId": page["pageId"], "moduleId": "recommended", "itemId": "ITEM22"}).json()["ok"]
    summ = client.get("/api/v1/experiments").json()
    assert summ["variants"]["control"]["clicks"] >= 1


def test_products_and_related(client):
    for dept in C.DEPARTMENTS:
        r = client.get("/api/v1/products", params={"department": dept, "limit": 5}).json()
        assert r["total"] > 0 and all(p["department"] == dept for p in r["items"])
    r = client.get("/api/v1/products", params={"department": "women", "limit": 5}).json()
    rel = client.get(f"/api/v1/products/{r['items'][0]['id']}").json()
    assert rel["product"]["id"] == r["items"][0]["id"] and "viewedNext" in rel
