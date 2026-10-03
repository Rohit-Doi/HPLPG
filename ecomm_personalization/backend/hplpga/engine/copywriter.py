"""Hero / CTA copy generation.

Default: deterministic templates keyed by intent stage, department, channel and daypart (fast, free,
fully explainable). Optional: when ANTHROPIC_API_KEY is set and the request asks for it, Claude rewrites
the hero copy with structured JSON output. Any failure (timeout, refusal, bad JSON) falls back to templates.
Results are cached per visitor archetype so the LLM is called at most once per archetype.
"""
from __future__ import annotations

import json
import logging
import os
import threading

log = logging.getLogger(__name__)

LLM_MODEL = os.getenv("HPLPGA_LLM_MODEL", "claude-opus-5")
_cache: dict = {}
_lock = threading.Lock()

DEPT_WORD = {"women": "women's", "men": "men's", "accessories": "accessories"}
DAYPART_HOOK = {"morning": "Start your day in style", "afternoon": "Your afternoon edit",
                "evening": "Tonight's edit", "night": "Late-night finds"}
CHANNEL_HOOK = {
    "Paid Social": "Seen it on your feed? Here's the full edit.",
    "Organic Social": "The looks everyone's sharing right now.",
    "Email": "Picked for our subscribers.",
    "SMS": "Your text-only early access is live.",
    "Paid Search": "Exactly what you searched for - and a few things you didn't know you needed.",
    "Organic Search": "Found us? Start with what shoppers love most.",
    "AI Assistant": "Welcome from your AI assistant - here's our curated shortlist.",
    "Affiliate": "Your partner offer is waiting.",
    "Referral": "Welcome - a friend has good taste.",
    "Direct": "Welcome to AURA.",
    "Other": "Welcome to AURA.",
}


def template_copy(stage: str, dept: str, sub: str | None, channel: str, daypart: str, region: str | None) -> dict:
    d = DEPT_WORD.get(dept, dept)
    place = f" in {region}" if region and region not in ("Unknown", "") else ""
    if stage == "buy_now":
        title = f"Your {d} picks are ready"
        sub_t = f"Bestsellers{place} are moving fast - free delivery over ₹1,499 and easy 30-day returns."
        cta = "Shop now"
    elif stage == "explore":
        title = f"{sub or d.title()} everyone{place} is browsing"
        sub_t = f"{CHANNEL_HOOK.get(channel, '')} Discover the {d} styles trending this week.".strip()
        cta = f"Explore {sub or d}"
    else:
        title = f"{DAYPART_HOOK.get(daypart, 'New season')}: the {d} edit"
        sub_t = f"{CHANNEL_HOOK.get(channel, '')} New here? Take 10% off your first order.".strip()
        cta = "Start discovering"
    return {"eyebrow": DAYPART_HOOK.get(daypart, "Curated for you"), "title": title, "subtitle": sub_t, "cta": cta, "source": "template"}


def llm_available() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY"))


SCHEMA = {
    "type": "object",
    "properties": {
        "eyebrow": {"type": "string", "description": "2-4 word kicker"},
        "title": {"type": "string", "description": "hero headline, max 8 words"},
        "subtitle": {"type": "string", "description": "one sentence, max 22 words"},
        "cta": {"type": "string", "description": "button label, max 3 words"},
    },
    "required": ["eyebrow", "title", "subtitle", "cta"],
    "additionalProperties": False,
}


_pending: set = set()


def _key(brief: dict) -> str:
    return json.dumps({k: brief.get(k) for k in ("stage", "department", "subcategory", "channel", "daypart", "persona", "region")}, sort_keys=True)


def llm_copy_async(brief: dict, fallback: dict) -> dict:
    """Non-blocking: return cached Claude copy for this visitor archetype if we have it; otherwise return the
    template now and write the Claude copy in a background thread for the next visitor of the same archetype."""
    key = _key(brief)
    with _lock:
        if key in _cache:
            return _cache[key]
        if key in _pending:
            return fallback
        _pending.add(key)

    def work():
        try:
            llm_copy(brief, fallback)
        finally:
            with _lock:
                _pending.discard(key)
    threading.Thread(target=work, daemon=True).start()
    return fallback


def llm_copy(brief: dict, fallback: dict) -> dict:
    key = _key(brief)
    with _lock:
        if key in _cache:
            return _cache[key]
    try:
        import anthropic

        client = anthropic.Anthropic(timeout=8.0, max_retries=1)
        prompt = (
            "You write hero-banner copy for AURA, a fashion e-commerce store. Write copy for a first-time visitor "
            "based on what our personalization models inferred about them. Be specific to the inferred interest, "
            "warm and concise, no emojis, no invented discounts other than those in the brief.\n\n"
            f"Visitor brief (JSON):\n{json.dumps(brief, indent=1)}"
        )
        resp = client.messages.create(
            model=LLM_MODEL,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
            extra_headers={"anthropic-beta": "server-side-fallback-2026-07-01"},
            extra_body={
                "output_config": {"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
                "fallbacks": "default",
            },
        )
        if resp.stop_reason == "refusal":
            raise RuntimeError("refusal")
        text = next(b.text for b in resp.content if b.type == "text")
        out = json.loads(text)
        out["source"] = f"llm:{LLM_MODEL}"
    except Exception as e:  # noqa: BLE001 - any failure -> deterministic fallback
        log.warning("LLM copy failed (%s); using template", e)
        out = fallback
    with _lock:
        _cache[key] = out
    return out
