"""Stage - promotional banner generation.

Real storefronts run designed campaign creatives (hero carousel, bank-offer strips, department
spotlights). We render ours with Pillow from the catalog's own product photography: gradient
art-direction + product cutouts + campaign copy whose numbers come from the promotions engine
(no invented discounts). Every banner carries targeting metadata (department, stage, channel, season)
so the Landing Page Agent can *select* creatives per visitor, which is exactly the "hero images"
module the brief asks for.

Outputs: project/public/banners/*.jpg (wide 1600x600 + square 900x900) and project/data/banners.json
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import pandas as pd
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from .. import config as C
from ..store import promotions as P

log = logging.getLogger(__name__)
OUT_DIR = C.FRONTEND_PUBLIC / "banners"
FONT_DIRS = [Path("C:/Windows/Fonts"), Path("/usr/share/fonts/truetype/dejavu")]
FONTS = {"bold": ["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"], "semi": ["seguisb.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"],
         "regular": ["segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"]}
PALETTES = {
    "women": ("#fde2e4", "#f9a8d4", "#831843"), "men": ("#dbeafe", "#93c5fd", "#1e3a8a"), "footwear": ("#ccfbf1", "#5eead4", "#134e4a"),
    "watches": ("#e0e7ff", "#a5b4fc", "#312e81"), "jewellery": ("#fef3c7", "#fcd34d", "#78350f"), "accessories": ("#ffe4e6", "#fda4af", "#881337"),
    "sale": ("#fee2e2", "#f87171", "#7f1d1d"), "welcome": ("#fdf4ff", "#e879f9", "#701a75"), "bank": ("#ecfeff", "#67e8f9", "#164e63"),
    "new": ("#f0fdf4", "#86efac", "#14532d"), "value": ("#fff7ed", "#fdba74", "#7c2d12"), "brand": ("#f5f5f4", "#d6d3d1", "#1c1917"),
    "Spring": ("#f0fdf4", "#bbf7d0", "#166534"), "Summer": ("#fefce8", "#fde047", "#854d0e"), "Fall": ("#fff7ed", "#fb923c", "#7c2d12"), "Winter": ("#eff6ff", "#bfdbfe", "#1e3a8a"),
}


def _font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    for d in FONT_DIRS:
        for f in FONTS[kind]:
            p = d / f
            if p.exists():
                return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def _hex(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _gradient(w: int, h: int, c1: str, c2: str) -> Image.Image:
    a, b = _hex(c1), _hex(c2)
    base = Image.new("RGB", (w, h))
    px = base.load()
    for x in range(w):
        t = x / max(w - 1, 1)
        col = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
        for y in range(h):
            px[x, y] = col
    glow = Image.new("RGB", (w, h), _hex(c2))
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse([w * 0.55, -h * 0.4, w * 1.25, h * 1.1], fill=140)
    d.ellipse([-w * 0.15, h * 0.55, w * 0.35, h * 1.4], fill=90)
    mask = mask.filter(ImageFilter.GaussianBlur(h * 0.18))
    return Image.composite(glow, base, mask)


def _product_card(path: Path, size: int, radius: int = 28) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    im.thumbnail((size, size), Image.LANCZOS)
    card = Image.new("RGBA", (size, size), (255, 255, 255, 235))
    card.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(card, (0, 0), mask)
    shadow = Image.new("RGBA", (size + 40, size + 40), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([20, 26, size + 20, size + 26], radius=radius, fill=(0, 0, 0, 70))
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))
    shadow.paste(out, (20, 20), out)
    return shadow


def _wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=font) <= max_w:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def render(spec: dict, images: list[Path], wide: bool = True) -> Image.Image:
    W, H = (1600, 600) if wide else (900, 900)
    c1, c2, ink = PALETTES.get(spec["palette"], PALETTES["brand"])
    im = _gradient(W, H, c1, c2).convert("RGBA")
    d = ImageDraw.Draw(im)
    pad = 80 if wide else 56
    text_w = int(W * 0.47) - pad if wide else W - 2 * pad
    f_eyebrow, f_title, f_sub, f_cta = _font("semi", 26 if wide else 24), _font("bold", 74 if wide else 64), _font("regular", 30 if wide else 26), _font("semi", 26)
    y = pad if wide else pad
    if not wide:
        # products on top for the square variant
        n = min(len(images), 2)
        size = 300
        x0 = (W - (n * size + (n - 1) * 24)) // 2
        for i, p in enumerate(images[:n]):
            card = _product_card(p, size)
            im.alpha_composite(card, (x0 + i * (size + 24) - 20, pad - 10))
        y = pad + size + 30
    d.text((pad, y), spec["eyebrow"].upper(), font=f_eyebrow, fill=_hex(ink))
    y += 46
    for line in _wrap(d, spec["title"], f_title, text_w):
        d.text((pad, y), line, font=f_title, fill=_hex(ink))
        y += (84 if wide else 72)
    y += 8
    for line in _wrap(d, spec["subtitle"], f_sub, text_w)[:2]:
        d.text((pad, y), line, font=f_sub, fill=_hex(ink))
        y += 40
    y += 22
    cta = spec["cta"]
    tw = d.textlength(cta, font=f_cta)
    d.rounded_rectangle([pad, y, pad + tw + 56, y + 56], radius=28, fill=_hex(ink))
    d.text((pad + 28, y + 13), cta, font=f_cta, fill=(255, 255, 255))
    if spec.get("badge"):
        f_badge = _font("bold", 40 if wide else 34)
        bw = d.textlength(spec["badge"], font=f_badge) + 48
        bx, by = (W - pad - bw, pad - 20) if wide else (W - pad - bw, H - pad - 70)
        d.rounded_rectangle([bx, by, bx + bw, by + 64], radius=18, fill=(255, 255, 255, 230))
        d.text((bx + 24, by + 9), spec["badge"], font=f_badge, fill=_hex(ink))
    if wide:
        n = min(len(images), 2)
        size = 330
        gap = 32
        total = n * size + (n - 1) * gap
        x0 = W - pad - total
        for i, p in enumerate(images[:n]):
            card = _product_card(p, size)
            yoff = (H - size) // 2 + 40 + (24 if i % 2 else -24) * (n > 1)
            im.alpha_composite(card, (x0 + i * (size + gap) - 20, yoff - 20))
    return im.convert("RGB")


def _pick(cat: pd.DataFrame, n: int, **flt) -> list:
    g = cat[cat["displayable"]]
    for k, v in flt.items():
        g = g[g[k] == v] if not isinstance(v, (list, tuple)) else g[g[k].isin(v)]
    g = g[g["image_file"].notna()].sort_values("popularity", ascending=False)
    # prefer png cutouts (clean product shots)
    g = pd.concat([g[g["image_file"].str.lower().str.endswith(".png")], g[~g["image_file"].str.lower().str.endswith(".png")]])
    return g.head(n)


def _paths(rows: pd.DataFrame) -> list[Path]:
    out = []
    for _, r in rows.iterrows():
        rel = r.get("image_rel") or f"{r['department']}/{r['image_file']}"
        p = C.FRONTEND_PUBLIC / rel
        if p.exists():
            out.append(p)
    return out


def run() -> dict:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cat = pd.read_parquet(C.PROCESSED_DIR / "catalog.parquet")
    camps = {c["department"]: c for c in P.department_campaigns(cat)}
    sale_max = max((c["maxPct"] for c in camps.values()), default=0)
    specs: list[dict] = [
        {"id": "welcome", "kind": "welcome_offer", "palette": "welcome", "eyebrow": "New to AURA?", "title": "Flat 10% off your first order",
         "subtitle": "Use code WELCOME10 at checkout. Free delivery over ₹1,499, easy 30-day returns.", "cta": "Claim the offer", "href": "/shop/women",
         "badge": "WELCOME10", "target": {"stage": ["discover"], "level": [0, 1, 2]}, "items": _pick(cat, 3, is_bestseller=True)},
        {"id": "bank", "kind": "bank_offer", "palette": "bank", "eyebrow": "AURA Bank cards", "title": "10% instant discount",
         "subtitle": "On AURA Bank credit cards. Up to ₹1,500 off orders above ₹4,999, no code needed.", "cta": "Shop now", "href": "/sale",
         "badge": "10% OFF", "target": {"stage": ["explore", "buy_now"]}, "items": _pick(cat, 2, department="watches")},
        {"id": "sale", "kind": "sale", "palette": "sale", "eyebrow": "End of season", "title": f"Sale · up to {sale_max}% off",
         "subtitle": "Real markdowns from our price history plus clearance edits across every department.", "cta": "Shop the sale", "href": "/sale",
         "badge": f"UP TO {sale_max}%", "target": {"stage": ["explore", "buy_now"], "daypart": ["evening", "night"]}, "items": _pick(cat, 3, on_sale=True)},
        {"id": "new", "kind": "new_arrivals", "palette": "new", "eyebrow": "Just dropped", "title": "New arrivals this season",
         "subtitle": "Fresh styles added to the catalog in the last 120 days.", "cta": "See what's new", "href": "/new",
         "target": {"stage": ["discover", "explore"]}, "items": _pick(cat, 3, is_new=True)},
        {"id": "value", "kind": "value", "palette": "value", "eyebrow": "Everyday style", "title": "Trend picks under ₹1,999",
         "subtitle": "Sneakers, caps, sunglasses and tees that won't dent your budget.", "cta": "Shop under ₹1,999", "href": "/collections/under-1999",
         "badge": "UNDER ₹1,999", "target": {"channel": ["Paid Social", "Organic Social"], "age": ["18-24", "25-34"]},
         "items": _pick(cat[cat["price"] < 1999], 3)},
        {"id": "free-shipping", "kind": "shipping", "palette": "brand", "eyebrow": "Delivery", "title": "Free delivery over ₹1,499",
         "subtitle": "Standard delivery in 3-6 days, express in 1-2 across India. Returns are on us for 30 days.", "cta": "Start shopping", "href": "/shop/men",
         "target": {"stage": ["buy_now"]}, "items": _pick(cat, 2, department="footwear")},
    ]
    for dept, label in C.DEPARTMENTS.items():
        c = camps[dept]
        specs.append({"id": f"dept-{dept}", "kind": "department", "palette": dept, "department": dept, "eyebrow": f"The {label} edit",
                      "title": {"women": "Dresses, jackets & the new-season edit", "men": "Sharp shirts, knits & tailoring",
                                "footwear": "Sneakers, boots & statement heels", "watches": "Tourbillons, divers & dress watches",
                                "jewellery": "Rings, bracelets & everyday sparkle", "accessories": "Caps, shades & hair accessories"}[dept],
                      "subtitle": f"{c['items']} styles · {c['text'].lower()} on {c['onSale']} of them." if c["onSale"] else f"{c['items']} styles, curated by our stylists.",
                      "cta": f"Shop {label}", "href": f"/shop/{dept}", "badge": c["text"] if c["onSale"] else None,
                      "target": {"department": [dept]}, "items": _pick(cat, 3, department=dept)})
    brands = cat[cat["displayable"] & (cat["brand"] != "AURA Studio")].groupby("brand").agg(n=("item_id", "size"), pop=("popularity", "sum"), disc=("discount_pct", "max"))
    for b, r in brands.sort_values("pop", ascending=False).head(4).iterrows():
        specs.append({"id": "brand-" + b.lower().replace(" ", "-").replace("&", "and").replace(".", ""), "kind": "brand", "palette": "brand", "brand": b,
                      "eyebrow": "Brand spotlight", "title": b, "subtitle": f"{int(r['n'])} styles" + (f" · up to {int(r['disc'])}% off" if r["disc"] >= 10 else " · new collection"),
                      "cta": f"Explore {b}", "href": f"/brands/{b.lower().replace(' ', '-').replace('&', 'and').replace('.', '')}", "badge": f"UP TO {int(r['disc'])}% OFF" if r["disc"] >= 10 else None,
                      "target": {"brand": [b]}, "items": _pick(cat, 3, brand=b)})
    for season, (title, sub, depts) in {"Spring": ("Spring layers & light knits", "Transitional jackets, cotton shirts and fresh sneakers.", ["women", "men", "footwear"]),
                                        "Summer": ("Summer edit: linen, shades & sandals", "Breathable fabrics, sunglasses and open footwear.", ["accessories", "footwear", "women"]),
                                        "Fall": ("Fall essentials: coats & boots", "Layer up with wool coats, cardigans and leather boots.", ["men", "women", "footwear"]),
                                        "Winter": ("Winter warmers & gifting", "Knitwear, watches and jewellery made for the season.", ["watches", "jewellery", "men"])}.items():
        specs.append({"id": f"season-{season.lower()}", "kind": "season", "palette": season, "season": season, "eyebrow": f"{season} edit", "title": title,
                      "subtitle": sub, "cta": f"Shop the {season.lower()} edit", "href": f"/collections/{season.lower()}-edit",
                      "target": {"season": [season]}, "items": _pick(cat, 3, department=depts)})

    meta = []
    for sp in specs:
        paths = _paths(sp.pop("items"))
        for wide in (True, False):
            name = f"{sp['id']}-{'wide' if wide else 'square'}.jpg"
            render(sp, paths, wide).save(OUT_DIR / name, quality=88, optimize=True)
        meta.append({**sp, "image": f"/banners/{sp['id']}-wide.jpg", "imageSquare": f"/banners/{sp['id']}-square.jpg"})
    (C.FRONTEND_DATA / "banners.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False), encoding="utf-8")
    log.info("rendered %d banners -> %s", len(meta), OUT_DIR)
    return {"banners": len(meta)}
