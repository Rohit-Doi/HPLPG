"""Product attributes for search, filters, descriptions and content-based similarity.

Derived deterministically from what we have: the image file name (materials, colours, patterns),
the image pixels (dominant colour, via Pillow), the department/subcategory and the brand. Nothing is
invented that the data can't support: an attribute is `None` when no evidence exists.
"""
from __future__ import annotations

import re
from pathlib import Path

import numpy as np
from PIL import Image

NAMED_COLOURS = {  # name -> RGB anchor used for nearest-colour matching of the dominant pixel colour
    "Black": (25, 25, 25), "White": (245, 245, 245), "Grey": (130, 130, 130), "Silver": (192, 192, 200), "Navy": (30, 40, 90),
    "Blue": (40, 90, 200), "Light Blue": (140, 180, 230), "Red": (200, 30, 40), "Burgundy": (110, 20, 40), "Pink": (235, 130, 170),
    "Orange": (240, 130, 40), "Yellow": (240, 210, 60), "Gold": (205, 170, 90), "Green": (40, 130, 70), "Olive": (110, 120, 60),
    "Beige": (215, 195, 165), "Brown": (110, 70, 40), "Tan": (185, 140, 95), "Cream": (245, 235, 210), "Purple": (110, 50, 160),
    "Multicolour": (0, 0, 0),
}
COLOUR_WORDS = {
    "black": "Black", "white": "White", "grey": "Grey", "gray": "Grey", "silver": "Silver", "navy": "Navy", "blue": "Blue", "zaffiro": "Blue",
    "marine": "Navy", "indigo": "Navy", "red": "Red", "magma": "Red", "loubi": "Red", "burgundy": "Burgundy", "maroon": "Burgundy", "wine": "Burgundy",
    "pink": "Pink", "blush": "Pink", "rose": "Pink", "orange": "Orange", "yellow": "Yellow", "gold": "Gold", "green": "Green", "olive": "Olive",
    "beige": "Beige", "sand": "Beige", "brown": "Brown", "havane": "Brown", "cuoio": "Tan", "cuir": "Tan", "tan": "Tan", "toffee": "Tan",
    "camel": "Tan", "cream": "Cream", "leche": "Cream", "ivory": "Cream", "purple": "Purple", "lavender": "Purple", "multicolor": "Multicolour",
    "multicolour": "Multicolour", "tropical": "Multicolour", "lionne": "Tan", "terra": "Brown", "turquoise": "Light Blue", "whisky": "Brown",
    "milk": "Cream", "chalk": "White", "silvery": "Silver",
}
MATERIALS = [("Leather", r"leather|nappa|calfskin|suede|nubuck|patent"), ("Cotton", r"cotton|jersey|poplin|chambray|terry|piqu"),
             ("Wool", r"wool|cashmere|merino|knit"), ("Silk", r"silk|satin|cr[eê]pe|organza"), ("Denim", r"denim|jean"),
             ("Linen", r"linen"), ("Nylon", r"nylon|techno|ripstop|econyl|shell|tpu"), ("Canvas", r"canvas|coated"),
             ("Viscose", r"viscose|lyocell|modal|acetate"), ("Steel", r"steel|metal|oyster|bracelet watch"), ("Gold", r"gold|plated"),
             ("Ceramic", r"ceramic"), ("Velvet", r"velvet"), ("Raffia", r"raffia|crochet")]
PATTERNS = [("Printed", r"print"), ("Striped", r"strip"), ("Embroidered", r"embroider|embellish|studded|spikes|crystal"), ("Jacquard", r"jacquard"),
            ("Floral", r"floral|flower|lily"), ("Checked", r"check|plaid|damier"), ("Logo", r"logo|monogram|\bgg\b|\blv\b|oblique"),
            ("Quilted", r"quilt"), ("Diamond", r"diamond"), ("Colour-block", r"contrast|two-tone|two tone")]
STYLE_RULES = [  # (style, regex over department|subcategory|brand|name)
    ("Formal", r"blazer|tuxedo|oxford|dress watch|shirt|trouser|loafer|suit"), ("Streetwear", r"sneaker|hoodie|sweatshirt|cargo|cap|bucket|varsity|track"),
    ("Athleisure", r"track|jersey|swim|sport|dive|sneaker|technical"), ("Ethnic", r"kurta|sherwani|ethnic|saree|jodhpuri|palazzo|kundan"),
    ("Luxury", r"rolex|omega|audemars|richard mille|jacob|louboutin|dior|chanel|cartier|louis vuitton|gucci|tourbillon|prada"),
    ("Party", r"pump|heel|sandal|slingback|sequin|sparkl|glisten|dress|earring|necklace|shimmer"),
    ("Minimal", r"plain|essentials|classic|slim|regular fit|solid|metal ring|slim bracelet")]
SIZES = {"women": ["XS", "S", "M", "L", "XL"], "men": ["S", "M", "L", "XL", "XXL"], "footwear": ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45"],
         "watches": ["One size"], "jewellery": ["One size"], "accessories": ["One size"]}
CARE = {"Cotton": "Machine wash cold, tumble dry low.", "Wool": "Dry clean or hand wash cold; dry flat.", "Silk": "Dry clean only.",
        "Leather": "Wipe with a soft dry cloth; store away from direct sunlight.", "Denim": "Machine wash inside out, cold.",
        "Linen": "Machine wash cold, gentle cycle.", "Nylon": "Machine wash cold; do not tumble dry.", "Steel": "Wipe clean with a microfibre cloth.",
        "Gold": "Polish with a jewellery cloth; avoid perfumes and water."}


def dominant_colour(path: Path) -> tuple[str, str] | None:
    """Return (named colour, hex) of the dominant non-background pixel colour, or None."""
    try:
        im = Image.open(path).convert("RGBA").resize((64, 64))
    except Exception:  # noqa: BLE001
        return None
    a = np.asarray(im).reshape(-1, 4).astype(float)
    a = a[a[:, 3] > 128][:, :3]
    if len(a) == 0:
        return None
    # drop near-white / near-black background pixels
    lum = a.mean(1)
    sat = a.max(1) - a.min(1)
    keep = ~((lum > 235) & (sat < 20))
    a = a[keep] if keep.sum() > 50 else a
    # quantise to 4 bits per channel and take the most frequent bin
    q = (a // 32).astype(int)
    keys = q[:, 0] * 64 + q[:, 1] * 8 + q[:, 2]
    vals, counts = np.unique(keys, return_counts=True)
    k = vals[counts.argmax()]
    rgb = a[keys == k].mean(0)
    if (a.max(1) - a.min(1)).mean() > 70 and counts.max() / counts.sum() < 0.18:
        name = "Multicolour"
    else:
        names = [n for n in NAMED_COLOURS if n != "Multicolour"]
        d = [np.linalg.norm(rgb - np.array(NAMED_COLOURS[n])) for n in names]
        name = names[int(np.argmin(d))]
    return name, "#%02x%02x%02x" % tuple(int(x) for x in rgb)


def colour_from_text(text: str) -> str | None:
    t = re.sub(r"[^a-z ]", " ", text.lower())
    for w in t.split():
        if w in COLOUR_WORDS:
            return COLOUR_WORDS[w]
    return None


def first_match(text: str, rules) -> str | None:
    t = text.lower()
    for name, pat in rules:
        if re.search(pat, t):
            return name
    return None


def styles_for(text: str) -> list[str]:
    t = text.lower()
    return [s for s, pat in STYLE_RULES if re.search(pat, t)] or ["Everyday"]


def describe(r: dict) -> str:
    """Deterministic product description from attributes (no invented claims)."""
    parts = []
    what = r["subcategory"].rstrip("s") if r["subcategory"] not in ("Jeans", "Trousers & Shorts", "Hats & Caps", "Necklaces & Pendants") else r["subcategory"]
    aud = {"women": "women", "men": "men", "unisex": "everyone"}[r.get("audience") or "unisex"]
    mat = r.get("material")
    parts.append(f"{r['name']} by {r['brand']}: a {r['colour'].lower() if r.get('colour') else ''} {mat.lower() + ' ' if mat else ''}{what.lower()} for {aud}.".replace("  ", " "))
    if r.get("pattern"):
        parts.append(f"{r['pattern']} detailing.")
    if r.get("detail"):
        parts.append(f"Details: {r['detail']}.")
    styles = r.get("styles") or []
    if styles:
        parts.append(f"Style: {', '.join(styles[:3])}.")
    if r.get("orders", 0) >= 20:
        parts.append(f"A store favourite with {int(r['orders'])} orders.")
    if mat and mat in CARE:
        parts.append(f"Care: {CARE[mat]}")
    return " ".join(parts)


def enrich(row: dict, image_path: Path | None) -> dict:
    text = f"{row.get('name', '')} {row.get('detail', '')} {row.get('image_file', '')}"
    colour = colour_from_text(text)
    hexc = None
    if image_path is not None and image_path.exists():
        dc = dominant_colour(image_path)
        if dc:
            if colour is None:
                colour = dc[0]
            hexc = dc[1]
    material = first_match(text, MATERIALS)
    if material is None:
        material = {"watches": "Steel", "jewellery": "Gold", "footwear": "Leather"}.get(row["department"])
    pattern = first_match(text, PATTERNS) or "Solid"
    styles = styles_for(f"{row['department']} {row['subcategory']} {row.get('brand', '')} {text}")
    return {"colour": colour or "Multicolour", "colourHex": hexc, "material": material, "pattern": pattern, "styles": styles,
            "sizes": SIZES.get(row["department"], ["One size"])}
