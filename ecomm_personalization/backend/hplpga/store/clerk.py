"""Clerk authentication for the API.

The storefront signs users in with Clerk (email codes, Google, phone OTP, ... configured in Clerk). Each API call
carries Clerk's short-lived session token as `Authorization: Bearer <jwt>`. This module verifies it:

* RS256 signature against Clerk's JWKS (cached; refetched when an unknown key id appears),
* `exp` / `nbf` with a small clock-skew allowance,
* `iss` == the instance's Frontend API (derived from the publishable key),
* `azp` (the origin that requested the token), when present, must be an allowed origin.

A verified user is linked to our own `users` row (provider="clerk", provider_sub=<Clerk user id>), so orders,
points, wishlist, addresses, onboarding and personalization history keep living in our database. The user's
verified email/name come from Clerk's Backend API (needs the secret key).

Keys (backend/.env, or picked up from project/.env.local in development):
  CLERK_PUBLISHABLE_KEY / NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY   pk_test_... / pk_live_...
  CLERK_SECRET_KEY                                            sk_test_... / sk_live_...
"""
from __future__ import annotations

import base64
import json
import logging
import os
import threading
import time
from typing import Optional

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from sqlalchemy import select

from .. import config  # loads backend/.env and the Clerk keys from project/.env.local; owns the allowed origins

log = logging.getLogger("hplpga.clerk")
API = "https://api.clerk.com/v1"
LEEWAY_S = 5
_jwks: dict = {"keys": {}, "fetched": 0.0}
_jwks_lock = threading.Lock()
_sub_to_uid: dict[str, int] = {}


# ------------------------------------------------------------------ configuration
def publishable_key() -> str:
    return os.getenv("CLERK_PUBLISHABLE_KEY") or os.getenv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") or ""


def secret_key() -> str:
    return os.getenv("CLERK_SECRET_KEY", "")


def enabled() -> bool:
    return bool(publishable_key())


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def frontend_api() -> str:
    """pk_test_<base64("<frontend-api-host>$")> -> host"""
    pk = publishable_key()
    try:
        enc = pk.split("_", 2)[2]
        return base64.b64decode(enc + "=" * (-len(enc) % 4)).decode().rstrip("$")
    except Exception:  # noqa: BLE001
        return ""


def issuer() -> str:
    host = frontend_api()
    return f"https://{host}" if host else ""


def jwks_url() -> str:
    return os.getenv("CLERK_JWKS_URL") or (f"{issuer()}/.well-known/jwks.json" if issuer() else "")


def authorized_party_ok(azp: str) -> bool:
    """CLERK_AUTHORIZED_PARTIES (exact list) overrides; otherwise the storefront origins the API allows for CORS."""
    raw = os.getenv("CLERK_AUTHORIZED_PARTIES")
    if raw:
        return azp.rstrip("/") in {o.strip().rstrip("/") for o in raw.split(",") if o.strip()}
    return config.origin_allowed(azp)


# ------------------------------------------------------------------ JWKS
def fetch_jwks() -> list[dict]:
    r = httpx.get(jwks_url(), timeout=8.0)
    r.raise_for_status()
    return r.json().get("keys", [])


def _key_for(kid: str) -> Optional[rsa.RSAPublicKey]:
    with _jwks_lock:
        fresh = time.time() - _jwks["fetched"] < 3600
        if kid not in _jwks["keys"] or not fresh:
            try:
                keys = fetch_jwks()
            except Exception as e:  # noqa: BLE001
                log.warning("could not fetch Clerk JWKS: %s", e)
                keys = []
            if keys:
                _jwks["keys"] = {k["kid"]: k for k in keys if k.get("kty") == "RSA"}
                _jwks["fetched"] = time.time()
        jwk = _jwks["keys"].get(kid)
    if not jwk:
        return None
    n = int.from_bytes(_unb64(jwk["n"]), "big")
    e = int.from_bytes(_unb64(jwk["e"]), "big")
    return rsa.RSAPublicNumbers(e, n).public_key()


# ------------------------------------------------------------------ verification
def verify(token: str) -> Optional[dict]:
    """Return the verified claims of a Clerk session token, or None."""
    if not enabled() or not token or token.count(".") != 2:
        return None
    h, p, s = token.split(".")
    try:
        header = json.loads(_unb64(h))
        claims = json.loads(_unb64(p))
        sig = _unb64(s)
    except Exception:  # noqa: BLE001
        return None
    if header.get("alg") != "RS256":
        return None
    key = _key_for(header.get("kid", ""))
    if key is None:
        return None
    try:
        key.verify(sig, f"{h}.{p}".encode(), padding.PKCS1v15(), hashes.SHA256())
    except InvalidSignature:
        return None
    now = time.time()
    if claims.get("exp", 0) < now - LEEWAY_S or claims.get("nbf", 0) > now + LEEWAY_S:
        return None
    if issuer() and claims.get("iss") != issuer():
        return None
    azp = claims.get("azp")
    if azp and not authorized_party_ok(azp):
        return None
    if not claims.get("sub"):
        return None
    return claims


# ------------------------------------------------------------------ Clerk Backend API
def fetch_user(sub: str) -> dict:
    """Verified profile from Clerk: {email, name, image}. Requires the secret key."""
    if not secret_key():
        raise RuntimeError("CLERK_SECRET_KEY is not configured")
    r = httpx.get(f"{API}/users/{sub}", headers={"Authorization": f"Bearer {secret_key()}"}, timeout=8.0)
    r.raise_for_status()
    u = r.json()
    primary = u.get("primary_email_address_id")
    email = next((e["email_address"] for e in u.get("email_addresses", []) if e.get("id") == primary), None) \
        or next((e["email_address"] for e in u.get("email_addresses", [])), None)
    phone = next((p["phone_number"] for p in u.get("phone_numbers", []) if p.get("id") == u.get("primary_phone_number_id")), None)
    name = " ".join(x for x in (u.get("first_name"), u.get("last_name")) if x) or u.get("username") or ""
    return {"email": (email or f"{sub}@users.clerk").lower(), "name": name, "image": u.get("image_url", ""), "phone": phone}


def delete_user(sub: str) -> bool:
    if not secret_key():
        return False
    try:
        r = httpx.delete(f"{API}/users/{sub}", headers={"Authorization": f"Bearer {secret_key()}"}, timeout=8.0)
        return r.status_code in (200, 404)
    except httpx.HTTPError:
        return False


# ------------------------------------------------------------------ linking to our users table
def link_user(claims: dict) -> Optional[int]:
    """Map a verified Clerk user to our users.id (create on first sight)."""
    from . import promotions as P
    from .db import User, session
    from .models_ext import PointsLedger

    sub = claims["sub"]
    if sub in _sub_to_uid:
        return _sub_to_uid[sub]
    with session() as s:
        u = s.execute(select(User).where(User.provider == "clerk", User.provider_sub == sub)).scalar_one_or_none()
        if u is None:
            try:
                info = fetch_user(sub)
            except Exception as e:  # noqa: BLE001
                log.warning("Clerk user lookup failed for %s: %s", sub, e)
                return None
            u = s.execute(select(User).where(User.email == info["email"])).scalar_one_or_none()
            if u is not None:                       # same verified email already known -> attach the Clerk identity
                u.provider, u.provider_sub = "clerk", sub
                u.avatar = u.avatar or info["image"]
            else:
                u = User(email=info["email"], name=info["name"], provider="clerk", provider_sub=sub, avatar=info["image"],
                         points=P.WELCOME_POINTS, profile_json=json.dumps({"phone": info["phone"]} if info.get("phone") else {}))
                s.add(u)
                s.flush()
                s.add(PointsLedger(user_id=u.id, delta=P.WELCOME_POINTS, reason="Welcome bonus", ref="clerk"))
        uid = u.id
    _sub_to_uid[sub] = uid
    return uid


def forget(sub: str) -> None:
    _sub_to_uid.pop(sub, None)
