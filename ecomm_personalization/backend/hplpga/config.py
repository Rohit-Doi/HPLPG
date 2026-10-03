"""Central configuration: paths, split dates, taxonomy constants."""
from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _load_dotenv(path: Path, only: set[str] | None = None) -> None:
    """Load KEY=VALUE lines into the environment (real environment variables win)."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split(" #", 1)[0].strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key, val = key.strip(), val.strip().strip('"').strip("'")
        if only is not None and key not in only:
            continue
        if key and val and key not in os.environ:
            os.environ[key] = val


_load_dotenv(BACKEND_DIR / ".env")
# Development convenience: the Clerk CLI writes the app's keys to the storefront's .env.local; the API reuses
# just those two so both halves use the same Clerk instance. In production set them in backend/.env instead.
_load_dotenv(BACKEND_DIR.parent / "project" / ".env.local", only={"NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"})
PROJECT_ROOT = BACKEND_DIR.parent  # ecomm_personalization/
DATA_DIR = Path(os.getenv("HPLPGA_DATA_DIR", PROJECT_ROOT / "Data"))
ACTIVITY_CSV = DATA_DIR / "dataset1_final.csv"
TRANSACTIONS_CSV = DATA_DIR / "dataset2_final.csv"

ARTIFACTS_DIR = Path(os.getenv("HPLPGA_ARTIFACTS_DIR", BACKEND_DIR / "artifacts"))
PROCESSED_DIR = ARTIFACTS_DIR / "processed"      # cleaned parquet tables
MODELS_DIR = ARTIFACTS_DIR / "models"            # serving artifacts (production fit)
EVAL_MODELS_DIR = ARTIFACTS_DIR / "models_eval"  # artifacts fit on the train split only
REPORTS_DIR = ARTIFACTS_DIR / "reports"

FRONTEND_DIR = PROJECT_ROOT / "project"
FRONTEND_PUBLIC = FRONTEND_DIR / "public"
# the API reads storefront.json / banners.json from here; the Docker image copies them to its own folder
FRONTEND_DATA = Path(os.getenv("HPLPGA_FRONTEND_DATA", FRONTEND_DIR / "data"))

# ---- Allowed storefront origins (CORS + Clerk `azp` check) --------------------
# HPLPGA_CORS_ORIGINS: exact origins, comma-separated (e.g. https://aura.vercel.app).
# HPLPGA_CORS_ORIGIN_REGEX: optional pattern for changing URLs, e.g. Vercel previews: https://aura-[a-z0-9-]+\.vercel\.app
# Local development origins are always allowed.
LOCAL_ORIGIN_REGEX = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"


def cors_origins() -> list[str]:
    raw = os.getenv("HPLPGA_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]


def cors_origin_regex() -> str:
    extra = os.getenv("HPLPGA_CORS_ORIGIN_REGEX", "").strip()
    return f"{LOCAL_ORIGIN_REGEX}|{extra}" if extra else LOCAL_ORIGIN_REGEX


def origin_allowed(origin: str) -> bool:
    import re
    o = origin.rstrip("/")
    return o in cors_origins() or re.fullmatch(cors_origin_regex(), o) is not None

# ---- Temporal protocol -------------------------------------------------------
# Models used for evaluation are fit on everything strictly before TEST_START.
# Users *first seen* on/after TEST_START are genuinely new visitors -> cold-start test set.
FOLD2_TUNE_START = "2025-03-01"  # secondary fold: tune on March, test on April
VALID_START = "2025-04-01"   # users first seen in April tune blend weights
TEST_START = "2025-05-01"

SESSION_GAP_MIN = 30          # GA4 session timeout
BOT_MAX_EVENTS = 1500         # users above this are treated as bots / crawlers
BOT_MAX_EVENTS_PER_SESSION = 400

# ITEM219 / ITEM_BRAND2 / CATEGORY_5 is a $3.55 add-on present in ~12% of orders
# (shipping-protection style). It is excluded from merchandising modules.
NON_MERCH_CATEGORIES = {"CATEGORY_5"}

EVENT_WEIGHTS = {"view_item": 1.0, "add_to_cart": 3.0, "purchase": 5.0}

DEPARTMENTS = {
    "women": "Women",
    "men": "Men",
    "footwear": "Footwear",
    "watches": "Watches",
    "jewellery": "Jewellery",
    "accessories": "Accessories",
}
APPAREL_DEPARTMENTS = ("women", "men")
AUDIENCES = ("women", "men", "unisex")
EVENTS_DIR = ARTIFACTS_DIR / "events"

RANDOM_SEED = 42

# ---- Currency ------------------------------------------------------------------
# The datasets are in USD; the storefront is an Indian store, so catalog prices are converted once in the
# catalog stage and every price, threshold and fee downstream is in INR (whole rupees).
CURRENCY = "INR"
USD_TO_INR = 84.0


def retail_inr(x: float) -> float:
    """Round a rupee amount UP to an Indian retail price ending: ...9 below ₹1,000, ...49/...99 above."""
    import math
    if x != x or x <= 0:          # NaN / non-positive
        return x
    if x < 1000:
        return float(math.ceil(x / 10) * 10 - 1)
    return float(math.ceil(x / 50) * 50 - 1)


def usd_to_inr(usd: float) -> float:
    return retail_inr(usd * USD_TO_INR)


def ensure_dirs() -> None:
    for d in (ARTIFACTS_DIR, PROCESSED_DIR, MODELS_DIR, EVAL_MODELS_DIR, REPORTS_DIR, FRONTEND_DATA, EVENTS_DIR):
        d.mkdir(parents=True, exist_ok=True)
