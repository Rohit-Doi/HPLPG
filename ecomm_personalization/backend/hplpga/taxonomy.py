"""Feature taxonomies shared by the offline pipeline and the online agent.

Keeping these in one module guarantees there is no train/serve skew: the same
function maps a raw (source, medium) pair to a channel group whether it comes
from a GA4 row or from a live visitor's UTM parameters / referrer.
"""
from __future__ import annotations

import re

SEARCH_ENGINES = {
    "google", "bing", "yahoo", "duckduckgo", "ecosia.org", "search.brave.com", "baidu",
    "yandex", "aol", "search.leisure.com", "ask", "startpage.com", "qwant.com",
}
SOCIAL_PAT = re.compile(
    r"facebook|instagram|fb\b|meta|tiktok|pinterest|reddit|youtube|twitter|t\.co|x\.com|linkedin|snapchat|threads|whatsapp"
)
AI_PAT = re.compile(r"chatgpt|openai|perplexity|gemini|copilot|claude|bard|you\.com")
AFFILIATE_PAT = re.compile(r"shareasale|couponcause|coupon|affiliate|rakuten|impact|skimlinks|honey|retailmenot")
EMAIL_SOURCES = re.compile(r"klaviyo|mailchimp|email|newsletter|omnisend|attentive")

CHANNELS = [
    "Direct", "Organic Search", "Paid Search", "Paid Social", "Organic Social",
    "Email", "SMS", "AI Assistant", "Affiliate", "Referral", "Other",
]


def channel_group(source: str | None, medium: str | None) -> str:
    """GA4-style default channel grouping (+ an 'AI Assistant' channel)."""
    s = (source or "").strip().lower()
    m = (medium or "").strip().lower()
    if s in ("", "(not set)", "data not available") and m in ("", "(not set)", "data not available"):
        return "Other"
    if s == "(direct)" or (m in ("(none)", "") and s in ("", "(direct)")):
        return "Direct"
    if AI_PAT.search(s):
        return "AI Assistant"
    if m == "sms" or s in ("attentive", "postscript"):
        return "SMS"
    if EMAIL_SOURCES.search(s) or m in ("email", "flow", "campaign", "newsletter"):
        return "Email"
    if AFFILIATE_PAT.search(s) or m in ("affiliate",):
        return "Affiliate"
    paid = m in ("cpc", "ppc", "paid", "paidsearch", "paidsocial", "display", "cpm", "paid_social", "paid-social")
    if SOCIAL_PAT.search(s) or m in ("social", "paidsocial", "paid_social"):
        return "Paid Social" if paid else "Organic Social"
    if s in SEARCH_ENGINES or "search" in s:
        return "Paid Search" if paid else "Organic Search"
    if m == "organic":
        return "Organic Search"
    if paid:
        return "Paid Search"
    if m in ("referral", "website", "company_profile", "copy_link", "landing_page"):
        return "Referral"
    if s in ("loyalty", "subscriptions_system"):
        return "Email"
    return "Other"


def channel_from_referrer(referrer: str | None) -> tuple[str, str]:
    """Map a raw document.referrer host to (source, medium) the way GA4 would."""
    if not referrer:
        return "(direct)", "(none)"
    host = re.sub(r"^https?://", "", referrer.strip().lower()).split("/")[0]
    host = host.removeprefix("www.")
    for eng in SEARCH_ENGINES:
        if eng.split(".")[0] in host:
            return eng, "organic"
    if SOCIAL_PAT.search(host):
        return host, "social"
    if AI_PAT.search(host):
        return host, "referral"
    return host, "referral"


def is_paid_channel(channel: str) -> bool:
    return channel in ("Paid Search", "Paid Social")


# ---- Geography -----------------------------------------------------------------
US_CENSUS_REGION = {
    **dict.fromkeys(["Connecticut", "Maine", "Massachusetts", "New Hampshire", "Rhode Island", "Vermont",
                     "New Jersey", "New York", "Pennsylvania"], "US Northeast"),
    **dict.fromkeys(["Illinois", "Indiana", "Michigan", "Ohio", "Wisconsin", "Iowa", "Kansas", "Minnesota",
                     "Missouri", "Nebraska", "North Dakota", "South Dakota"], "US Midwest"),
    **dict.fromkeys(["Delaware", "Florida", "Georgia", "Maryland", "North Carolina", "South Carolina", "Virginia",
                     "District of Columbia", "West Virginia", "Alabama", "Kentucky", "Mississippi", "Tennessee",
                     "Arkansas", "Louisiana", "Oklahoma", "Texas", "Puerto Rico"], "US South"),
    **dict.fromkeys(["Arizona", "Colorado", "Idaho", "Montana", "Nevada", "New Mexico", "Utah", "Wyoming",
                     "Alaska", "California", "Hawaii", "Oregon", "Washington"], "US West"),
}
US_STATES = sorted(US_CENSUS_REGION)

# IANA timezone -> representative US state (privacy-friendly geo guess in the browser)
TZ_TO_STATE = {
    "America/Los_Angeles": "California", "America/Denver": "Colorado", "America/Phoenix": "Arizona",
    "America/Chicago": "Illinois", "America/New_York": "New York", "America/Detroit": "Michigan",
    "America/Anchorage": "Alaska", "Pacific/Honolulu": "Hawaii", "America/Indiana/Indianapolis": "Indiana",
    "America/Boise": "Idaho", "America/Kentucky/Louisville": "Kentucky", "America/Puerto_Rico": "Puerto Rico",
}
TZ_TO_COUNTRY = {
    "Asia/Kolkata": "India", "Asia/Calcutta": "India", "Europe/London": "United Kingdom", "America/Toronto": "Canada",
    "America/Vancouver": "Canada", "Asia/Manila": "Philippines", "America/Mexico_City": "Mexico",
    "Europe/Berlin": "Germany", "Australia/Sydney": "Australia", "Europe/Paris": "France", "Asia/Dubai": "United Arab Emirates",
    "Asia/Singapore": "Singapore", "Asia/Tokyo": "Japan",
}


def macro_region(country: str | None, region: str | None) -> str:
    """Coarse geography level used for hierarchical back-off."""
    if country == "United States":
        return US_CENSUS_REGION.get(region or "", "US Other")
    if country in ("Canada",):
        return "Canada"
    if not country or country in ("Unknown", "(not set)"):
        return "Unknown"
    return "International"


# ---- Time ----------------------------------------------------------------------
def daypart(hour: int) -> str:
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 17:
        return "afternoon"
    if 17 <= hour < 22:
        return "evening"
    return "night"


DAYPARTS = ["morning", "afternoon", "evening", "night"]

# ---- Demographics ----------------------------------------------------------------
AGE_GROUPS = ["18-24", "25-34", "35-44", "45-54", "55-64", "above 64"]
INCOME_GROUPS = ["Top 10%", "11-20%", "21-30%", "31-40%", "41-50%", "below 50%"]
GENDERS = ["female", "male"]

LANDING_TYPES = ["homepage", "collections", "products", "pages", "search", "blogs", "account", "cart", "checkouts", "other"]


def landing_type(page_type: str | None) -> str:
    p = (page_type or "").lower()
    if p == "product":
        p = "products"
    return p if p in LANDING_TYPES else "other"


def device_from_user_agent(ua: str | None) -> str:
    u = (ua or "").lower()
    if any(k in u for k in ("ipad", "tablet", "kindle", "silk")) or ("android" in u and "mobile" not in u):
        return "tablet"
    if any(k in u for k in ("mobi", "iphone", "android")):
        return "mobile"
    return "desktop"
