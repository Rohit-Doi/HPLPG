"""Stage - storefront merchandising: promotions, category tiles, brands, collections.

Applies the promotions engine to the catalog (clearance markdowns), then exports everything the
storefront and the agent need: project/data/catalog.json (final prices), project/data/storefront.json
(department campaigns, category tiles, brands, collections, coupons, shipping & points rules).
"""
from __future__ import annotations

import json
import logging
import re

import pandas as pd

from .. import config as C
from ..store import promotions as P
from .catalog import _export_frontend_catalog

log = logging.getLogger(__name__)


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("&", "and")).strip("-")


COLLECTIONS = [
    {"id": "bestsellers", "title": "Bestsellers", "subtitle": "Most ordered across the store", "rule": lambda c: c["is_bestseller"]},
    {"id": "new-in", "title": "New in", "subtitle": "Added in the last 120 days", "rule": lambda c: c["is_new"]},
    {"id": "under-1999", "title": "Under ₹1,999", "subtitle": "Trend picks that won't dent your budget", "rule": lambda c: c["price"] < 1999},
    {"id": "luxury-watches", "title": "Luxury watches", "subtitle": "Tourbillons, divers and dress pieces", "rule": lambda c: c["department"] == "watches"},
    {"id": "ethnic-wear", "title": "Ethnic wear", "subtitle": "Kurtas, sherwanis and festive edits", "rule": lambda c: c["subcategory"] == "Ethnic Wear"},
    {"id": "gifting", "title": "Gifting edit", "subtitle": "Jewellery, watches and accessories", "rule": lambda c: c["department"].isin(["jewellery", "watches", "accessories"]) & (c["price"] < 20000)},
    {"id": "spring-edit", "title": "Spring edit", "subtitle": "Light layers and fresh sneakers", "rule": lambda c: c["subcategory"].isin(["Jackets & Coats", "Shirts", "Sneakers", "T-Shirts & Tops"])},
    {"id": "summer-edit", "title": "Summer edit", "subtitle": "Linen, shades and sandals", "rule": lambda c: c["subcategory"].isin(["Eyewear", "Sandals & Mules", "Dresses", "Trousers & Shorts", "Hats & Caps"])},
    {"id": "fall-edit", "title": "Fall edit", "subtitle": "Coats, knits and boots", "rule": lambda c: c["subcategory"].isin(["Jackets & Coats", "Knitwear", "Boots", "Sweatshirts"])},
    {"id": "winter-edit", "title": "Winter edit", "subtitle": "Knitwear, watches and jewellery", "rule": lambda c: c["subcategory"].isin(["Knitwear", "Sweatshirts"]) | c["department"].isin(["watches", "jewellery"])},
    {"id": "workwear", "title": "Workwear", "subtitle": "Blazers, shirts and loafers", "rule": lambda c: c["subcategory"].isin(["Shirts", "Polos", "Loafers & Oxfords", "Dress Watches", "Trousers & Shorts"])},
    {"id": "party", "title": "Party edit", "subtitle": "Dresses, heels and sparkle", "rule": lambda c: c["subcategory"].isin(["Dresses", "Heels & Pumps", "Rings", "Necklaces & Pendants", "Earrings"])},
]


def run() -> dict:
    cat = pd.read_parquet(C.PROCESSED_DIR / "catalog.parquet")
    if "promo_type" in cat.columns:      # idempotent: rebuild from the observed prices
        redo = cat["promo_type"] == "clearance"
        cat.loc[redo, "price"] = cat.loc[redo, "compare_at"]
        cat.loc[redo, ["compare_at", "discount_pct", "on_sale"]] = [float("nan"), 0, False]
    cat = P.apply_clearance(cat)
    cat.to_parquet(C.PROCESSED_DIR / "catalog.parquet", index=False)
    _export_frontend_catalog(cat)

    disp = cat[cat["displayable"]]
    brands = []
    for b, g in disp.groupby("brand"):
        s = g[g["on_sale"]]
        top = g.sort_values("popularity", ascending=False)
        brands.append({"id": slug(b), "name": b, "items": int(len(g)), "onSale": int(len(s)), "maxDiscount": int(s["discount_pct"].max()) if len(s) else 0,
                       "departments": sorted(g["department"].unique().tolist()), "image": top.iloc[0]["image"],
                       "popularity": float(g["popularity"].sum()), "priceFrom": float(g["price"].min())})
    brands.sort(key=lambda x: -x["popularity"])
    collections = []
    for c in COLLECTIONS:
        m = c["rule"](disp)
        g = disp[m].sort_values("popularity", ascending=False)
        if len(g) < 4:
            continue
        collections.append({"id": c["id"], "title": c["title"], "subtitle": c["subtitle"], "items": int(len(g)),
                            "itemIds": g["item_id"].tolist(), "image": g.iloc[0]["image"], "href": f"/collections/{c['id']}"})
    data = {**P.export(cat), "brands": brands, "collections": collections,
            "promoSummary": {"markdown": int((cat["promo_type"] == "markdown").sum()), "clearance": int((cat["promo_type"] == "clearance").sum()),
                             "onSale": int(disp["on_sale"].sum()), "items": int(len(disp)),
                             "how": ["Observed markdowns: recent transaction price >= 7% below the item's reference price (90th pct of monthly medians).",
                                     "Clearance: >= 150 views and add-to-cart rate in the bottom quartile of the department -> 20-50% off by conversion deficit; 'was' price = observed price.",
                                     "Department 'up to X% off' ranges are computed from those discounts, never typed in."]}}
    (C.FRONTEND_DATA / "storefront.json").write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    log.info("storefront: %s", data["promoSummary"])
    return data["promoSummary"]
