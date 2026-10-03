"""Transactional email. Uses SMTP when configured, otherwise writes the message to artifacts/outbox.log.

    SMTP_HOST=smtp.gmail.com  SMTP_PORT=587  SMTP_USER=you@gmail.com  SMTP_PASSWORD=<16-char app password>
    MAIL_FROM="AURA <you@gmail.com>"   PUBLIC_SITE_URL=http://localhost:3000
"""
from __future__ import annotations

import json
import logging
import os
import smtplib
import ssl
import time
from email.message import EmailMessage

from .. import config as C

log = logging.getLogger("hplpga.mail")


def enabled() -> bool:
    return bool(os.getenv("SMTP_HOST") and os.getenv("SMTP_USER") and os.getenv("SMTP_PASSWORD"))


def site_url() -> str:
    return os.getenv("PUBLIC_SITE_URL", "http://localhost:3000").rstrip("/")


def send(to: str, subject: str, text: str, html: str | None = None) -> bool:
    """Send an email; returns True when handed to SMTP. Never raises (email must not break a request)."""
    record = {"to": to, "subject": subject, "text": text, "ts": time.time(), "via": "smtp" if enabled() else "outbox"}
    try:
        C.ensure_dirs()
        with (C.ARTIFACTS_DIR / "outbox.log").open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:  # noqa: BLE001
        pass
    if not enabled():
        log.info("[mail:outbox] to=%s subject=%s", to, subject)
        return False
    msg = EmailMessage()
    msg["From"] = os.getenv("MAIL_FROM", os.getenv("SMTP_USER"))
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    try:
        port = int(os.getenv("SMTP_PORT", "587"))
        ctx = ssl.create_default_context()
        if port == 465:
            with smtplib.SMTP_SSL(os.environ["SMTP_HOST"], port, context=ctx, timeout=15) as s:
                s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
                s.send_message(msg)
        else:
            with smtplib.SMTP(os.environ["SMTP_HOST"], port, timeout=15) as s:
                s.starttls(context=ctx)
                s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
                s.send_message(msg)
        log.info("[mail:smtp] sent to=%s subject=%s", to, subject)
        return True
    except Exception as e:  # noqa: BLE001
        log.warning("[mail] SMTP send failed (%s); message kept in outbox.log", e)
        return False


def order_confirmation(to: str, order: dict) -> None:
    from .promotions import rupees
    lines = "\n".join(f"  {l['qty']} x {l['brand']} {l['name']}{' (' + l['size'] + ')' if l.get('size') else ''}  {rupees(l['lineTotal'])}" for l in order.get("lines", []))
    text = (f"Thank you for shopping with AURA!\n\nOrder {order['orderId']} is confirmed.\n\n{lines}\n\nTotal paid: {rupees(order['total'])}"
            f"\nPayment: {order.get('paymentMethod', '')}\nTrack your order: {site_url()}/orders/{order['orderId']}\n")
    send(to, f"Your AURA order {order['orderId']} is confirmed", text)
