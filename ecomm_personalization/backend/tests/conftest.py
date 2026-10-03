"""Test helpers: a stand-in Clerk instance.

Tests sign their own Clerk-style session tokens (RS256) with a key generated here and point the API's JWKS and
user lookup at it, so the real verification code path runs without network access or real Clerk keys.
"""
import base64
import json
import time
import uuid

import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa

FRONTEND_API = "aura-test.clerk.accounts.dev"
PK = "pk_test_" + base64.b64encode(f"{FRONTEND_API}$".encode()).decode()
_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_KID = "test-kid"
USERS: dict[str, dict] = {}


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _jwk() -> dict:
    nums = _KEY.public_key().public_numbers()
    return {"kty": "RSA", "kid": _KID, "alg": "RS256", "use": "sig",
            "n": _b64(nums.n.to_bytes((nums.n.bit_length() + 7) // 8, "big")), "e": _b64(nums.e.to_bytes(3, "big"))}


def mint(sub: str, *, exp_in: int = 300, iss: str | None = None, azp: str = "http://localhost:3000", key=None) -> str:
    header = {"alg": "RS256", "kid": _KID, "typ": "JWT"}
    now = int(time.time())
    claims = {"sub": sub, "iss": iss or f"https://{FRONTEND_API}", "azp": azp, "iat": now, "nbf": now - 1, "exp": now + exp_in, "sid": "sess_test"}
    h, p = _b64(json.dumps(header).encode()), _b64(json.dumps(claims).encode())
    sig = (key or _KEY).sign(f"{h}.{p}".encode(), padding.PKCS1v15(), hashes.SHA256())
    return f"{h}.{p}.{_b64(sig)}"


@pytest.fixture(autouse=True)
def fake_clerk(monkeypatch):
    """Every test runs against the stand-in Clerk instance."""
    from hplpga.store import clerk
    monkeypatch.setenv("CLERK_PUBLISHABLE_KEY", PK)
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_dummy")
    monkeypatch.setattr(clerk, "fetch_jwks", lambda: [_jwk()])
    monkeypatch.setattr(clerk, "fetch_user", lambda sub: USERS[sub])
    monkeypatch.setattr(clerk, "delete_user", lambda sub: True)
    clerk._jwks.update({"keys": {}, "fetched": 0.0})
    yield


def new_user(name: str = "Test Shopper", email: str | None = None) -> dict:
    """Register a user with the stand-in Clerk and return {"sub", "email", "h": auth headers}."""
    sub = f"user_{uuid.uuid4().hex[:12]}"
    email = email or f"{sub}@example.com"
    USERS[sub] = {"email": email, "name": name, "image": "", "phone": None}
    return {"sub": sub, "email": email, "h": {"Authorization": f"Bearer {mint(sub)}"}}
