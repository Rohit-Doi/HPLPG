"""FastAPI service exposing the Landing Page Generator Agent.

    uvicorn hplpga.api.main:app --port 8000
"""
from __future__ import annotations

import json
import logging
import threading
import time
from collections import Counter, deque
from typing import Any, Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .. import __version__, config as C, taxonomy as T
from ..engine import copywriter
from ..engine.agent import LandingPageAgent
from ..store import api as store_api, catalog_api, ops, payments, mailer
from ..store.db import user_history

log = logging.getLogger("hplpga.api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="HPLPGA - Hyper-Personalized Landing Page Generator Agent", version=__version__,
              docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(
    CORSMiddleware,
    allow_origins=C.cors_origins(),
    allow_origin_regex=C.cors_origin_regex(),
    allow_methods=["*"], allow_headers=["*"],
)

app.include_router(store_api.router)
app.include_router(catalog_api.router)
app.include_router(ops.router)
app.include_router(payments.router)
_agent: Optional[LandingPageAgent] = None
_lock = threading.Lock()
_events: deque = deque(maxlen=50_000)
_stats = {"pages": 0, "latency_ms": deque(maxlen=500)}


def agent() -> LandingPageAgent:
    global _agent
    if _agent is None:
        with _lock:
            if _agent is None:
                if not (C.MODELS_DIR / "model.joblib").exists():
                    raise HTTPException(503, "Model artifacts missing - run `python -m hplpga.pipeline.run` first.")
                _agent = LandingPageAgent(C.MODELS_DIR)
                store_api.set_products(_agent.products)
                catalog_api.set_agent(_agent)
                from ..store.db import init_db
                init_db()
                ops.seed_inventory()
                n = catalog_api.seed_demo_reviews()
                if n:
                    log.info("seeded %d demo reviews (source='demo'; SEED_DEMO_REVIEWS=0 to disable)", n)
                log.info("agent loaded in %ss", _agent.load_seconds)
    return _agent


@app.on_event("startup")
def _warm() -> None:
    try:
        agent().generate({"context": {"device": "desktop"}})  # warm caches / LightGBM
    except HTTPException as e:
        log.warning(e.detail)


def _report(name: str) -> dict:
    p = C.REPORTS_DIR / name
    if not p.exists():
        raise HTTPException(404, f"{name} not found - run the pipeline")
    return json.loads(p.read_text(encoding="utf-8"))


# ----------------------------------------------------------------------------- models
class Ctx(BaseModel):
    device: Optional[str] = None
    userAgent: Optional[str] = None
    utmSource: Optional[str] = None
    utmMedium: Optional[str] = None
    utmCampaign: Optional[str] = None
    referrer: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None
    city: Optional[str] = None
    timezone: Optional[str] = None
    localHour: Optional[int] = Field(None, ge=0, le=23)
    dayOfWeek: Optional[int] = Field(None, ge=0, le=6)
    landingPageType: Optional[str] = None
    ageGroup: Optional[str] = None
    gender: Optional[str] = None
    incomeGroup: Optional[str] = None
    preferredDepartment: Optional[str] = None   # from the on-page style quiz


class Session(BaseModel):
    viewedItems: list[str] = []
    cartedItems: list[str] = []


class Options(BaseModel):
    useLlm: Optional[bool] = None      # None = automatic (non-blocking Claude copy when ANTHROPIC_API_KEY is set)
    maxModules: Optional[int] = None
    variant: Optional[str] = None      # "agent" | "control" - Lab override of the A/B bucket
    bandit: bool = True


class LandingReq(BaseModel):
    visitorId: Optional[str] = None
    context: Ctx = Ctx()
    session: Session = Session()
    options: Options = Options()


class Event(BaseModel):
    visitorId: Optional[str] = None
    type: str
    pageId: Optional[str] = None
    moduleId: Optional[str] = None
    itemId: Optional[str] = None


# ----------------------------------------------------------------------------- routes
@app.get("/health")
def health() -> dict:
    from ..store import clerk
    from ..store.db import DB_URL
    return {"status": "ok", "artifactsLoaded": _agent is not None, "version": __version__,
            "llmCopywriter": copywriter.llm_available(), "modelCutoff": _agent.art.cutoff if _agent else None,
            "currency": C.CURRENCY,
            "integrations": {"database": "postgresql" if DB_URL.startswith("postgresql") else "sqlite",
                             "auth": "clerk" if clerk.enabled() else "not-configured", "clerkUserLookup": bool(clerk.secret_key()),
                             "payments": payments.mode(), "email": "smtp" if mailer.enabled() else "outbox-log",
                             "llmCopy": copywriter.llm_available()}}


@app.post("/api/v1/landing-page")
def landing_page(req: LandingReq, uid: Optional[int] = Depends(store_api.current_user_id)) -> dict:
    a = agent()
    body = req.model_dump()
    if uid is not None:
        # signed-in customer: onboarding profile -> declared signals, order/browse history -> Level 4
        from ..store.db import User, session as db_session
        with db_session() as s:
            u = s.get(User, uid)
            prof = u.profile if u else {}
            body["user"] = {"id": uid, "name": (u.name if u else ""), "points": (u.points if u else 0), "profile": prof}
        for k_src, k_dst in (("gender", "gender"), ("ageGroup", "ageGroup"), ("country", "country"), ("region", "region"), ("city", "city")):
            if prof.get(k_src) and not body["context"].get(k_dst):
                body["context"][k_dst] = prof[k_src]
        if prof.get("preferredDepartments") and not body["context"].get("preferredDepartment"):
            body["context"]["preferredDepartment"] = prof["preferredDepartments"][0]
        body["history"] = user_history(uid, None)
    elif req.visitorId:
        body["history"] = user_history(None, req.visitorId)
    page = a.generate(body)
    _stats["pages"] += 1
    _stats["latency_ms"].append(page["latencyMs"])
    return page


@app.get("/api/v1/products")
def products(department: Optional[str] = None, subcategory: Optional[str] = None, q: Optional[str] = None,
             onSale: Optional[bool] = None, sort: str = "popular", limit: int = Query(48, le=500), offset: int = 0) -> dict:
    items = list(agent().products.values())
    if department:
        items = [p for p in items if p["department"] == department]
    if subcategory:
        items = [p for p in items if p["subcategory"].lower() == subcategory.lower()]
    if onSale:
        items = [p for p in items if p["onSale"]]
    if q:
        ql = q.lower()
        items = [p for p in items if ql in f"{p['name']} {p['brand']} {p['subcategory']} {p['departmentLabel']}".lower()]
    keyf = {"price_asc": lambda p: p["price"], "price_desc": lambda p: -p["price"], "discount": lambda p: -p["discountPct"],
            "new": lambda p: (not p["isNew"], -int(p["id"][4:])), "popular": lambda p: -(p["stats"]["orders"] * 5 + p["stats"]["carts"])}
    items.sort(key=keyf.get(sort, keyf["popular"]))
    return {"total": len(items), "items": items[offset: offset + limit]}


@app.get("/api/v1/products/{item_id}")
def product(item_id: str) -> dict:
    r = agent().related(item_id)
    if not r:
        raise HTTPException(404, "product not found")
    return r


PRESETS = [
    {"id": "insta-mobile-ca", "label": "Instagram ad · mobile · California · 9pm",
     "description": "Paid social first-timer on a phone in the evening.",
     "context": {"device": "mobile", "utmSource": "Facebook", "utmMedium": "PaidSocial", "country": "United States", "region": "California", "localHour": 21, "dayOfWeek": 4}},
    {"id": "google-desktop-ny", "label": "Google search ad · desktop · New York · lunch",
     "description": "High-intent paid search visitor landing on a product page.",
     "context": {"device": "desktop", "utmSource": "google", "utmMedium": "cpc", "country": "United States", "region": "New York", "localHour": 13, "dayOfWeek": 1, "landingPageType": "products"}},
    {"id": "klaviyo-email", "label": "Klaviyo email · mobile · Texas · morning",
     "description": "Subscriber clicking a campaign email.",
     "context": {"device": "mobile", "utmSource": "Klaviyo", "utmMedium": "campaign", "country": "United States", "region": "Texas", "localHour": 8, "dayOfWeek": 2}},
    {"id": "anonymous", "label": "Anonymous direct visit",
     "description": "No UTM, no referrer, no geo - pure level-0 cold start.", "context": {"device": "desktop"}},
    {"id": "chatgpt", "label": "ChatGPT referral · desktop · Illinois",
     "description": "Visitor arriving from an AI assistant recommendation.",
     "context": {"device": "desktop", "referrer": "https://chatgpt.com/", "country": "United States", "region": "Illinois", "localHour": 16, "dayOfWeek": 3}},
    {"id": "female-25-34", "label": "Organic search · declared woman 25-34 · Florida",
     "description": "Level 2: visitor answered the optional style quiz.",
     "context": {"device": "mobile", "utmSource": "google", "utmMedium": "organic", "country": "United States", "region": "Florida", "localHour": 19, "dayOfWeek": 5, "ageGroup": "25-34", "gender": "female"}},
    {"id": "india-night", "label": "International · India · late night",
     "description": "Non-US visitor, organic search, 11pm.",
     "context": {"device": "mobile", "utmSource": "google", "utmMedium": "organic", "country": "India", "localHour": 23, "dayOfWeek": 6}},
    {"id": "female-texas", "label": "Declared woman · Texas · Instagram · evening",
     "description": "Level 2 with gender: the page should lead with womenswear.",
     "context": {"device": "mobile", "utmSource": "l.instagram.com", "utmMedium": "referral", "country": "United States", "region": "Texas", "localHour": 20, "dayOfWeek": 5, "gender": "female", "ageGroup": "35-44"}},
    {"id": "male-illinois-watches", "label": "Declared man · Illinois · quiz: watches",
     "description": "Level 2 with a declared interest from the style quiz.",
     "context": {"device": "desktop", "utmSource": "google", "utmMedium": "cpc", "country": "United States", "region": "Illinois", "localHour": 11, "dayOfWeek": 2, "gender": "male", "ageGroup": "45-54", "preferredDepartment": "watches"}},
    {"id": "warm-cart", "label": "Returning in-session shopper with a bag",
     "description": "Level 3: has viewed and bagged items this session.",
     "context": {"device": "desktop", "utmSource": "(direct)", "utmMedium": "(none)", "country": "United States", "region": "Georgia", "localHour": 20, "dayOfWeek": 6},
     "session": {"viewedItems": ["ITEM22", "ITEM7"], "cartedItems": ["ITEM22"]}},
]
CHANNEL_OPTIONS = [
    {"id": "direct", "label": "Direct", "utmSource": "(direct)", "utmMedium": "(none)"},
    {"id": "google-organic", "label": "Organic Search (Google)", "utmSource": "google", "utmMedium": "organic"},
    {"id": "google-cpc", "label": "Paid Search (Google Ads)", "utmSource": "google", "utmMedium": "cpc"},
    {"id": "facebook-paid", "label": "Paid Social (Facebook/Instagram)", "utmSource": "Facebook", "utmMedium": "PaidSocial"},
    {"id": "instagram-organic", "label": "Organic Social (Instagram)", "utmSource": "l.instagram.com", "utmMedium": "referral"},
    {"id": "klaviyo", "label": "Email (Klaviyo)", "utmSource": "Klaviyo", "utmMedium": "campaign"},
    {"id": "sms", "label": "SMS", "utmSource": "attentive", "utmMedium": "sms"},
    {"id": "chatgpt", "label": "AI Assistant (ChatGPT)", "utmSource": "chatgpt.com", "utmMedium": "referral"},
    {"id": "affiliate", "label": "Affiliate", "utmSource": "shareasale-analytics.com", "utmMedium": "referral"},
    {"id": "referral", "label": "Referral", "utmSource": "blog.example.com", "utmMedium": "referral"},
]


@app.get("/api/v1/meta/options")
def options() -> dict:
    return {
        "devices": ["mobile", "desktop", "tablet"], "channels": CHANNEL_OPTIONS, "regions": T.US_STATES,
        "countries": ["United States", "Canada", "India", "Philippines", "Mexico", "United Kingdom", "Germany", "Australia", "France", "Japan"],
        "ageGroups": T.AGE_GROUPS, "genders": T.GENDERS, "incomeGroups": T.INCOME_GROUPS,
        "landingTypes": ["homepage", "collections", "products", "search", "pages", "blogs"], "presets": PRESETS,
        "departments": [{"id": k, "label": v} for k, v in C.DEPARTMENTS.items()],
    }


@app.get("/api/v1/insights")
def insights() -> dict:
    ins = _report("insights.json")
    a = agent()
    for p in ins.get("personas", []):
        p["topProducts"] = [a.products[i] for i in p.pop("topItemIds", []) if i in a.products]
    return ins


@app.get("/api/v1/evaluation")
def evaluation() -> dict:
    return _report("evaluation.json")


@app.post("/api/v1/events")
def events(ev: Event) -> dict:
    e = {**ev.model_dump(), "ts": time.time()}
    _events.append(e)
    agent().experiments.record(e)
    return {"ok": True}


@app.get("/api/v1/experiments")
def experiments() -> dict:
    a = agent()
    lat = list(_stats["latency_ms"])
    return {**a.experiments.summary(), "pagesGenerated": _stats["pages"],
            "avgLatencyMs": round(sum(lat) / len(lat), 1) if lat else None}


@app.get("/api/v1/events/summary")
def events_summary() -> dict[str, Any]:
    by_type = Counter(e["type"] for e in _events)
    clicks = Counter(e["moduleId"] for e in _events if e["type"] == "click" and e.get("moduleId"))
    imps = Counter(e["moduleId"] for e in _events if e["type"] == "impression" and e.get("moduleId"))
    lat = list(_stats["latency_ms"])
    return {"events": dict(by_type), "pagesGenerated": _stats["pages"],
            "avgLatencyMs": round(sum(lat) / len(lat), 1) if lat else None,
            "moduleCtr": {m: round(clicks[m] / imps[m], 4) for m in imps if imps[m]}}
