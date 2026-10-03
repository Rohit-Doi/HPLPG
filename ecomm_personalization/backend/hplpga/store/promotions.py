"""Promotions engine: how every discount on the site is generated, plus coupons, bank offers and points.

All amounts are in INR (whole rupees) - the catalog stage converts the dataset's USD prices once.

Three kinds of price reductions, all traceable to data:

1. **Observed markdowns** (from `catalog.py`): the item's recent transaction price is >= 7% below its
   reference price (90th percentile of monthly medians). `compare_at` = reference price.
2. **Clearance markdowns** (this module): items with real demand but weak conversion - many views but an
   add-to-cart rate in the bottom quartile of their department - receive a tiered markdown
   (20 / 30 / 40 / 50%) proportional to the conversion deficit. `compare_at` = the observed selling price,
   so the "was" price is never invented.
3. **Department campaigns**: each department's live "up to X% off" range is derived from the discounts
   above (never a made-up number).

Coupons and the bank offer are rule objects validated server-side at checkout. Loyalty points: earn 5 points
per ₹100 paid (5% back), 1 point = ₹1, redeemable in blocks of 100 on orders of ₹999 or more.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from .. import config as C

CLEARANCE_TIERS = [(0.0, 0.20), (0.35, 0.30), (0.6, 0.40), (0.8, 0.50)]   # (min deficit, discount)
MIN_VIEWS_FOR_CLEARANCE = 150
CURRENCY = C.CURRENCY
FREE_SHIPPING_OVER = 1499.0
SHIPPING = {"standard": {"label": "Standard (3-6 days)", "price": 99.0}, "express": {"label": "Express (1-2 days)", "price": 249.0}}
COD_FEE = 49.0
POINTS_PER_100 = 5            # points earned per ₹100 paid
POINTS_BLOCK = 100            # redeem in blocks of 100 points
POINTS_BLOCK_VALUE = 100.0    # 100 points = ₹100
POINTS_MIN_ORDER = 999.0
WELCOME_POINTS = 250
BANK_OFFER = {"code": "AURABANK10", "bank": "AURA Bank", "pct": 10, "cap": 1500.0, "min": 4999.0,
              "label": "10% instant discount on AURA Bank credit cards (up to ₹1,500, min order ₹4,999)"}
COUPONS = {
    "WELCOME10": {"type": "pct", "value": 10, "cap": 750.0, "min": 0.0, "firstOrderOnly": True, "label": "10% off your first order (up to ₹750)"},
    "AURA20": {"type": "pct", "value": 20, "cap": 2500.0, "min": 9999.0, "firstOrderOnly": False, "label": "20% off orders above ₹9,999 (up to ₹2,500)"},
    "FREESHIP": {"type": "shipping", "value": 0, "cap": 0.0, "min": 0.0, "firstOrderOnly": False, "label": "Free standard delivery"},
    "WATCH15": {"type": "pct", "value": 15, "cap": 5000.0, "min": 0.0, "firstOrderOnly": False, "department": "watches", "label": "15% off watches (up to ₹5,000)"},
    "STYLE25": {"type": "pct", "value": 25, "cap": 2000.0, "min": 4999.0, "firstOrderOnly": False, "department": "women",
                "label": "25% off womenswear above ₹4,999 (up to ₹2,000)"},
}
PAYMENT_METHODS = [
    {"id": "upi", "label": "UPI", "note": "Google Pay, PhonePe, Paytm, BHIM", "group": "upi"},
    {"id": "credit_card", "label": "Credit card", "note": "Visa, Mastercard, RuPay, Amex · bank offer eligible", "group": "card"},
    {"id": "debit_card", "label": "Debit card", "note": "Visa, Mastercard, RuPay debit", "group": "card"},
    {"id": "netbanking", "label": "Net banking", "note": "All major Indian banks", "group": "bank"},
    {"id": "wallet", "label": "Wallet", "note": "Paytm, Amazon Pay, Mobikwik", "group": "wallet"},
    {"id": "cod", "label": "Cash on delivery", "note": f"₹{COD_FEE:.0f} handling fee", "group": "cash"},
]


def rupees(x: float) -> str:
    """Indian digit grouping: 123456.0 -> ₹1,23,456"""
    n = int(round(x))
    s = str(abs(n))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        head = ",".join([head[max(0, i - 2):i] for i in range(len(head), 0, -2)][::-1])
        s = head + "," + tail
    return ("-" if n < 0 else "") + "₹" + s


# ------------------------------------------------------------------ catalog-level promotions
def apply_clearance(cat: pd.DataFrame) -> pd.DataFrame:
    """Add clearance markdowns to the catalog frame (in place columns: price, compare_at, discount_pct, on_sale, promo_type)."""
    cat = cat.copy()
    cat["promo_type"] = np.where(cat["on_sale"], "markdown", None)
    disp = cat["displayable"] & ~cat["on_sale"] & (cat["views"] >= MIN_VIEWS_FOR_CLEARANCE)
    for dept, grp in cat[disp].groupby("department"):
        q25 = grp["cart_rate"].quantile(0.25)
        q0 = max(grp["cart_rate"].min(), 1e-6)
        weak = grp[grp["cart_rate"] < q25]
        for it, r in weak.iterrows():
            deficit = float(np.clip((q25 - r["cart_rate"]) / max(q25 - q0, 1e-6), 0, 1))
            disc = max(d for lo, d in CLEARANCE_TIERS if deficit >= lo)
            base = float(r["price"])
            new = C.retail_inr(base * (1 - disc))
            if new >= base:
                continue
            cat.at[it, "compare_at"] = base
            cat.at[it, "price"] = new
            cat.at[it, "discount_pct"] = int(round(100 * (1 - new / base)))
            cat.at[it, "on_sale"] = True
            cat.at[it, "promo_type"] = "clearance"
    return cat


def department_campaigns(cat: pd.DataFrame) -> list[dict]:
    out = []
    for dept, label in C.DEPARTMENTS.items():
        g = cat[cat["displayable"] & (cat["department"] == dept)]
        s = g[g["on_sale"]]
        if len(s) == 0:
            out.append({"department": dept, "label": label, "items": int(len(g)), "onSale": 0, "minPct": 0, "maxPct": 0, "text": "New season"})
            continue
        lo, hi = int(s["discount_pct"].quantile(0.1)), int(s["discount_pct"].max())
        lo = max(5 * (lo // 5), 5)
        hi = 5 * math.ceil(hi / 5)
        out.append({"department": dept, "label": label, "items": int(len(g)), "onSale": int(len(s)), "minPct": lo, "maxPct": hi,
                    "text": f"{lo}-{hi}% OFF" if hi > lo else f"UP TO {hi}% OFF"})
    return out


def subcategory_tiles(cat: pd.DataFrame, min_items: int = 3) -> list[dict]:
    tiles = []
    d = cat[cat["displayable"]]
    for (dept, sub), g in d.groupby(["department", "subcategory"]):
        if len(g) < min_items:
            continue
        s = g[g["on_sale"]]
        top = g.sort_values("popularity", ascending=False).iloc[0]
        pct = int(s["discount_pct"].max()) if len(s) else 0
        tiles.append({"department": dept, "subcategory": sub, "label": sub, "departmentLabel": C.DEPARTMENTS[dept],
                      "items": int(len(g)), "image": top["image"], "href": f"/shop/{dept}?sub={sub}",
                      "offer": (f"UP TO {5 * math.ceil(pct / 5)}% OFF" if pct >= 10 else ("NEW IN" if bool(g["is_new"].any()) else "BESTSELLERS")),
                      "popularity": float(g["popularity"].sum())})
    tiles.sort(key=lambda t: -t["popularity"])
    return tiles


# ------------------------------------------------------------------ checkout maths (INR, whole rupees)
def quote(items: list[dict], products: dict, coupon: str | None, use_points: int, shipping: str, payment: str,
          first_order: bool, points_balance: int, bank_card: bool = False) -> dict:
    lines, subtotal, savings = [], 0.0, 0.0
    for it in items:
        p = products.get(it.get("id"))
        if not p:
            continue
        qty = max(1, int(it.get("qty", 1)))
        line = round(p["price"] * qty, 2)
        was = round((p["compareAt"] or p["price"]) * qty, 2)
        lines.append({"id": p["id"], "name": p["name"], "brand": p["brand"], "image": p["image"], "qty": qty, "size": it.get("size"),
                      "unitPrice": p["price"], "compareAt": p["compareAt"], "lineTotal": line, "department": p["department"]})
        subtotal += line
        savings += was - line
    subtotal = round(subtotal, 2)
    errors: list[str] = []
    coupon_discount, coupon_info = 0.0, None
    ship = SHIPPING.get(shipping, SHIPPING["standard"])
    shipping_cost = 0.0 if subtotal >= FREE_SHIPPING_OVER and shipping == "standard" else ship["price"]
    if coupon:
        c = COUPONS.get(coupon.upper())
        if c is None:
            errors.append(f"Coupon {coupon} is not valid.")
        elif c["firstOrderOnly"] and not first_order:
            errors.append("WELCOME10 is only valid on your first order.")
        elif subtotal < c["min"]:
            errors.append(f"Coupon {coupon.upper()} needs a subtotal of at least {rupees(c['min'])}.")
        else:
            elig = subtotal if not c.get("department") else sum(l["lineTotal"] for l in lines if l["department"] == c["department"])
            if c.get("department") and elig <= 0:
                errors.append(f"Coupon {coupon.upper()} only applies to {C.DEPARTMENTS[c['department']]} items.")
            elif c["type"] == "pct":
                coupon_discount = float(math.floor(min(elig * c["value"] / 100, c["cap"] or 1e12)))
                coupon_info = {"code": coupon.upper(), "label": c["label"], "discount": coupon_discount}
            elif c["type"] == "shipping":
                coupon_discount, shipping_cost = shipping_cost, 0.0
                coupon_info = {"code": coupon.upper(), "label": c["label"], "discount": coupon_discount}
    bank_discount = 0.0
    if bank_card and payment in ("card", "credit_card") and subtotal >= BANK_OFFER["min"]:
        bank_discount = float(math.floor(min(subtotal * BANK_OFFER["pct"] / 100, BANK_OFFER["cap"])))
    cod_fee = COD_FEE if payment == "cod" else 0.0
    after = max(subtotal - coupon_discount - bank_discount, 0.0)
    blocks = 0
    if use_points and subtotal >= POINTS_MIN_ORDER:
        blocks = min(int(use_points) // POINTS_BLOCK, points_balance // POINTS_BLOCK, int(after // POINTS_BLOCK_VALUE))
    points_discount = round(blocks * POINTS_BLOCK_VALUE, 2)
    total = round(max(after - points_discount, 0.0) + shipping_cost + cod_fee, 2)
    earned = int((total - shipping_cost - cod_fee) * POINTS_PER_100 / 100)
    return {"currency": CURRENCY, "lines": lines, "subtotal": subtotal, "itemSavings": round(savings, 2), "coupon": coupon_info,
            "couponDiscount": coupon_discount, "bankDiscount": bank_discount, "bankOffer": BANK_OFFER if payment in ("card", "credit_card") else None,
            "pointsUsed": blocks * POINTS_BLOCK, "pointsDiscount": points_discount,
            "shipping": {"id": shipping, **ship, "cost": shipping_cost, "freeOver": FREE_SHIPPING_OVER},
            "codFee": cod_fee, "total": total, "pointsEarned": earned, "errors": errors,
            "paymentMethods": PAYMENT_METHODS, "availableCoupons": [{"code": k, "label": v["label"]} for k, v in COUPONS.items()
                                                                    if (not v["firstOrderOnly"] or first_order)]}


def public_rules() -> dict:
    return {"currency": CURRENCY,
            "coupons": [{"code": k, "label": v["label"], "min": v["min"], "firstOrderOnly": v["firstOrderOnly"]} for k, v in COUPONS.items()],
            "bankOffer": BANK_OFFER, "shipping": SHIPPING, "freeShippingOver": FREE_SHIPPING_OVER, "codFee": COD_FEE,
            "points": {"perHundred": POINTS_PER_100, "block": POINTS_BLOCK, "blockValue": POINTS_BLOCK_VALUE, "minOrder": POINTS_MIN_ORDER,
                       "welcome": WELCOME_POINTS, "text": f"Earn {POINTS_PER_100} points per ₹100 · 1 point = ₹1 · redeem 100 at a time on orders of {rupees(POINTS_MIN_ORDER)}+"},
            "paymentMethods": PAYMENT_METHODS}


def export(cat: pd.DataFrame) -> dict:
    """Storefront merchandising data consumed by the frontend and the agent."""
    return {"departmentCampaigns": department_campaigns(cat), "categoryTiles": subcategory_tiles(cat), **public_rules()}
