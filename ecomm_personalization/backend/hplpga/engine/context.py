"""Resolve a raw guest request (UA, UTM, referrer, timezone, overrides) into the model context schema."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from zoneinfo import ZoneInfo

import pandas as pd

from .. import taxonomy as T
from . import features as F


@dataclass
class ResolvedContext:
    row: dict
    signals: list[str] = field(default_factory=list)
    level: int = 1
    declared_demo: bool = False

    def frame(self) -> pd.DataFrame:
        return pd.DataFrame([self.row])


LEVEL_LABELS = {0: "Anonymous (global trends)", 1: "Contextual cold start", 2: "Context + declared attributes", 3: "In-session (warming up)",
                4: "Returning customer (own history)"}


def resolve(ctx: dict, session: dict | None) -> ResolvedContext:
    ctx = {k: v for k, v in (ctx or {}).items() if v not in (None, "", "unknown")}
    sig: list[str] = []

    device = ctx.get("device") or T.device_from_user_agent(ctx.get("userAgent"))
    sig.append(f"Device: {device}" + ("" if ctx.get("device") else " (from user-agent)"))

    if ctx.get("utmSource") or ctx.get("utmMedium"):
        source, medium = ctx.get("utmSource", ""), ctx.get("utmMedium", "")
        how = "UTM"
    else:
        source, medium = T.channel_from_referrer(ctx.get("referrer"))
        how = "referrer" if ctx.get("referrer") else "no referrer"
    channel = T.channel_group(source, medium)
    sig.append(f"Channel: {channel} ({how}: {source}/{medium})")

    country, region = ctx.get("country"), ctx.get("region")
    tz = ctx.get("timezone")
    if not country and region in T.US_CENSUS_REGION:
        country = "United States"
    if not country and tz:
        if tz in T.TZ_TO_STATE:
            country, region = "United States", region or T.TZ_TO_STATE[tz]
        elif tz in T.TZ_TO_COUNTRY:
            country = T.TZ_TO_COUNTRY[tz]
        elif tz.startswith("America/"):
            country = "United States"
    country = country or "Unknown"
    region = region or "Unknown"
    geo = region if country == "United States" else country
    macro = T.macro_region(country, region)
    if country != "Unknown":
        sig.append(f"Geo: {geo} -> {macro}" + (f" (timezone {tz})" if tz and not ctx.get("region") else ""))

    now = None
    if tz:
        try:
            now = datetime.now(ZoneInfo(tz))
        except Exception:  # noqa: BLE001 - unknown tz string
            now = None
    now = now or datetime.now()
    hour = int(ctx["localHour"]) if ctx.get("localHour") is not None else now.hour
    dow = int(ctx["dayOfWeek"]) if ctx.get("dayOfWeek") is not None else now.weekday()
    dp = T.daypart(hour)
    sig.append(f"Time: {hour:02d}:00 {dp}, {'weekend' if dow >= 5 else 'weekday'}")

    landing = T.landing_type(ctx.get("landingPageType") or "homepage")
    if landing != "homepage":
        sig.append(f"Landing page: {landing}")

    age = ctx.get("ageGroup") if ctx.get("ageGroup") in T.AGE_GROUPS else F.UNKNOWN
    gender = ctx.get("gender") if ctx.get("gender") in T.GENDERS else F.UNKNOWN
    pref = ctx.get("preferredDepartment")
    pref = pref if pref in ("women", "men", "footwear", "watches", "jewellery", "accessories") else None
    declared = age != F.UNKNOWN or gender != F.UNKNOWN or pref is not None
    if age != F.UNKNOWN or gender != F.UNKNOWN:
        sig.append(f"Declared: {', '.join(x for x in (age, gender) if x != F.UNKNOWN)}")
    if pref:
        sig.append(f"Declared interest: {pref} (style quiz)")
    if ctx.get("incomeGroup"):
        sig.append("Income bracket received but not used (leaky in training data)")

    row = {"device": device, "channel": channel, "geo": geo, "macro": macro, "landing": landing, "hour": hour,
           "dow": dow, "month": now.month, "daypart": dp, "weekend": "weekend" if dow >= 5 else "weekday",
           "age": age, "gender": gender,
           # passthrough (not model features)
           "_source": source, "_medium": medium, "_country": country, "_region": region, "_income": ctx.get("incomeGroup"),
           "_preferred": pref, "_city": ctx.get("city")}

    has_session = bool(session and (session.get("viewedItems") or session.get("cartedItems")))
    anonymous = channel in ("Direct", "Other") and country == "Unknown" and landing == "homepage"
    level = 3 if has_session else (2 if declared else (0 if anonymous else 1))
    if has_session and declared:
        sig.append("Level 3 also uses the declared attributes")
    if has_session:
        sig.append(f"Session: {len(session.get('viewedItems') or [])} viewed, {len(session.get('cartedItems') or [])} in bag")
    return ResolvedContext(row=row, signals=sig, level=level, declared_demo=declared)
