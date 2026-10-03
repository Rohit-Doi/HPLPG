"""Stage 2 - Product catalog engineering.

The datasets are anonymised (ITEMn / CATEGORY_n / ITEM_BRANDn). This stage turns them into a
merchandisable catalog:

1. Item universe = items seen in `view_item`/`add_to_cart` events U items in transactions.
2. Category inference - 40% of viewed items never sold, so they have no category label. We build a
   session co-view graph (cosine-normalised co-occurrence) and label each unlabeled item by a
   similarity-weighted kNN vote of its labeled neighbours. Accuracy is validated leave-one-out.
3. Pricing - median unit price from transaction lines; unsold items get a co-view-weighted
   neighbour price. Markdown detection: recent (last 60d) price vs the item's reference price
   (90th pct of monthly medians) -> real, data-derived "sale" flags and discount percentages.
4. Store taxonomy - CATEGORY_1 (apparel-like price distribution) -> Clothing split into Women/Men
   by the gender mix of each item's viewers; CATEGORY_2/3/4 -> Accessories. CATEGORY_5 (a $3.55
   add-on bought in 12% of orders) is kept for analytics but excluded from merchandising.
5. Image assignment - each displayable item receives exactly one storefront image from
   project/public/{women,men,accessories}. Accessories are aligned by price rank to image tiers
   (watches > jewellery > footwear > bags > eyewear > hats) so price and product type stay coherent.
"""
from __future__ import annotations

import json
import logging
import re
import unicodedata
from urllib.parse import quote

import numpy as np
import pandas as pd
import scipy.sparse as sp

from .. import config as C

log = logging.getLogger(__name__)

IMG_EXT = {".png", ".jpg", ".jpeg", ".webp", ".avif"}

ACCESSORY_TIERS = [  # (subcategory, regex) in descending price tier
    ("Watches", r"tourbillon|daytona|datejust|day-date|\bexplorer\b|gmt-master|air-king|submariner|dweller|"
                r"yacht-master|oyster|deepsea|royal oak|audemars|speedmaster|seamaster|^rm |astronomia|"
                r"bugatti|casino|caviar|godfather|twin turbo|world is yours|mystery|\bdial\b|chronograph"),
    ("Jewellery", r"\brings?\b|bracelet|necklace|nocklace|earrings?|pendant|bangle|kundan|mathapat|gold plated|jewel"),
    ("Footwear", r"sneakers?|boots?\b|loafers?|mules?\b|pumps\b|sandals?\b|oxfords?|\bflats\b|trainers|ballerinas?|"
                 r"\bwedge\b|shoes|slingback|footwear|danny flex"),
    ("Bags & Belts", r"\bbags?\b|organisers?|trolley|\bbelt\b|gift set|saree accessories"),
    ("Eyewear", r"sunglasses|frame sunglasses|shades"),
    ("Hats & Hair", r"\bhat\b|\bcap\b|visor|barrettes?|headband|hair|hairband"),
]
APPAREL_SUBCATS = [
    ("Ethnic Wear", r"kurta|saree|sherwani|ethnic|lehenga|jodhpuri|palazzo"),
    ("Knitwear", r"sweater|jumper|cardigan|pullover|\bknit\b"),
    ("Dresses", r"dress\b|dresses|gown|maxi|caftan"),
    ("Jackets & Coats", r"jacket|blouson|\bcoat\b|bomber|blazer|\bvest\b|parka|trench"),
    ("Sweatshirts", r"sweatshirt|hoodie|hooded"), ("Polos", r"\bpolo\b"),
    ("T-Shirts & Tops", r"t-shirt|t shirt|tshirt|\btee\b|\btop\b|tank|blouse"), ("Shirts", r"\bshirts?\b"),
    ("Jeans", r"\bjeans?\b|denim"),
    ("Trousers & Shorts", r"trousers?|pants|shorts|cargo|chino"), ("Skirts", r"skirt"), ("Swimwear", r"swim"),
]
TIER_DEPARTMENT = {"Watches": "watches", "Jewellery": "jewellery", "Footwear": "footwear",
                   "Bags & Belts": "accessories", "Eyewear": "accessories", "Hats & Hair": "accessories"}


def _audience(text: str, sub: str, female_share: float) -> str:
    """Target audience of a product: explicit from the image name, else from the item's real viewer gender mix."""
    t = " " + text.lower() + " "
    if re.search(r"[ ·]women[ ·]|[ ·]woman[ ·]|ladies|femme|[ ·]womens[ ·]", t):
        return "women"
    if re.search(r"[ ·]men[ ·]|[ ·]man[ ·]|[ ·]mens[ ·]|homme", t):
        return "men"
    if female_share >= 0.20:
        return "women"
    if sub in ("Jewellery", "Hats & Hair") and female_share >= 0.10:
        return "women"
    if sub in ("Watches", "Footwear") and female_share < 0.06:
        return "men"
    return "unisex"


FINE_SUBCATS = {  # department -> (subcategory, regex) evaluated on name + detail
    "footwear": [("Sneakers", r"sneaker|trainer"), ("Boots", r"boot"), ("Heels & Pumps", r"pump|slingback|heel|hot chick|kate max"),
                 ("Sandals & Mules", r"sandal|mule"), ("Loafers & Oxfords", r"loafer|oxford|buckle|derby|danny flex|moonboat"),
                 ("Flats", r"flat|ballerina|wedge")],
    "jewellery": [("Rings", r"\bring"), ("Bracelets", r"bracelet|bangle"), ("Necklaces & Pendants", r"necklace|pendant|chain"),
                  ("Earrings", r"earring"), ("Jewellery Sets", r"set|kundan|mathapat")],
    "watches": [("Tourbillons", r"tourbillon|astronomia|bugatti|casino|caviar|godfather|twin turbo|world is yours|mystery|opera|^rm"),
                ("Dive & Sport", r"submariner|sea-dweller|sea dweller|deepsea|yacht|seamaster|daytona|speedmaster|gmt|explorer|air-king|air king|land-dweller"),
                ("Dress Watches", r"datejust|day-date|day date|oyster|sky-dweller|carlton|royal oak|audemars|dial")],
    "accessories": [("Eyewear", r"sunglass|frame|shades"), ("Hats & Caps", r"\bhat\b|\bcap\b|visor|bucket"),
                    ("Hair Accessories", r"barrette|headband|hair"), ("Bags", r"bag|organiser|trolley|lunch"), ("Belts", r"belt"),
                    ("Gift Sets", r"gift|set")],
}


def _fine_subcategory(dept: str, text: str, default: str) -> str:
    return _subcategory(text, FINE_SUBCATS.get(dept, [])) or default


TYPO = {"Nocklace": "Necklace", "Slefwinding": "Selfwinding", "Claf": "Calf", "Mubuck": "Nubuck", "Hight": "High",
        "abd": "and", "cardiga": "cardigan", "Couio": "Cuoio", "unbuck": "nubuck", "Tourbillion": "Tourbillon"}
BRANDS = [
    (r"^LV |Louis Vuitton|Pont Neuf|Damier|Only LV", "Louis Vuitton"), (r"Dior|^CD |Dioriviera", "Dior"),
    (r"CHANEL|Coco Crush|Camélia|N°5|NO\.5|Comète|Ruban|Métiers d.art", "Chanel"),
    (r"Daytona|Datejust|Day-Date|Explorer|GMT-Master|Air-King|Submariner|Dweller|Yacht-Master|Oyster|Deepsea", "Rolex"),
    (r"Speedmaster|Seamaster", "Omega"), (r"Royal Oak|Audemars", "Audemars Piguet"), (r"^RM-", "Richard Mille"),
    (r"ASTRONOMIA|BUGATTI|CASINO|CAVIAR|GODFATHER|TWIN TURBO|WORLD IS YOURS|MYSTERY", "Jacob & Co."),
    (r"LOVE |Trinity|Juste", "Cartier"), (r"^GG |GG canvas|Original GG", "Gucci"), (r"Re-Nylon", "Prada"),
    (r"Miss Z|Louis Junior|Louis No Limit|Louis Sneakers|Louise Junior|Hot Chick|Kate Max|Minny|Marie Amelie|"
     r"Sweetie Jane|Tutti Rui|Just Nothing|Calakala|Astroflash|Astrocool|Alpinosol|Chambelimoc|Chambelimule|"
     r"Danny Flex|Greggory|Moonboat|Mooncross|Retero|Rosalio|Samson|Sartok|Sartosea", "Christian Louboutin"),
    (r"^ASV |eagle|Piqué|Garment-dyed|Honeycomb", "Stone Atelier"),
]


# ------------------------------------------------------------------ naming helpers
def _split_detail(fname: str) -> tuple[str, str]:
    stem = unicodedata.normalize("NFC", fname.rsplit(".", 1)[0])
    parts = [p.strip() for p in stem.split(" - ")]
    if len(parts) > 1:
        return parts[0], " · ".join(parts[1:])
    return stem, ""


STOP_TAIL = {"with", "and", "in", "for", "of", "the", "a", "an", "&"}


def _truncate(s: str, n: int = 56) -> str:
    if len(s) <= n:
        return s
    words = s[:n].rsplit(" ", 1)[0].rstrip(",;").split(" ")
    while words and words[-1].lower().strip(",") in STOP_TAIL:
        words.pop()
    return " ".join(words).rstrip(",;")


def _clean_name(fname: str) -> tuple[str, bool]:
    stem = unicodedata.normalize("NFC", fname.rsplit(".", 1)[0])
    stem = re.sub(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\d{8,}-?", "", stem)
    stem = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", stem)      # split CamelCase
    stem = re.sub(r"[_\-]+", " ", stem)
    toks = [t for t in stem.split() if not re.search(r"\d", t)]
    toks = [TYPO.get(t, t) for t in toks if t.lower() not in {"myntra", "online", "shopping", "orig", "img", "e"}
            and not (len(t) == 1 and t.islower()) and t.lower() != "mm"]
    while toks and toks[0].lower() in ("for", "mens", "womens"):
        toks = toks[1:]
    name = " ".join(toks).strip()
    words = re.findall(r"[A-Za-zÀ-ÿ]{3,}", name)
    ok = len(words) >= 2 and not re.search(r"whatsapp|photoshoot|photography|koottikada|image|outfit", name, re.I)
    if name.isupper() or name.islower():
        name = name.title()
    return (_truncate(name.strip(",; ")), ok)


def _subcategory(name: str, rules) -> str | None:
    n = name.lower()
    for sub, pat in rules:
        if re.search(pat, n):
            return sub
    return None


def _brand(name: str) -> str:
    for pat, b in BRANDS:
        if re.search(pat, name):
            return b
    return "AURA Studio"


# public/<folder> -> storefront department. Sub-folders (e.g. Shoes/Men, Shoes/Women) carry the audience.
IMAGE_FOLDERS = {"women": "women", "men": "men", "Shoes": "footwear", "Watches": "watches", "Jewelry": "jewellery",
                 "Bags": "accessories", "Accessories": "accessories"}
FOLDER_TIER = ["Watches", "Jewelry", "Shoes", "Bags", "Accessories"]   # price tiers, high -> low


def _load_images(folder: str) -> list[dict]:
    d = C.FRONTEND_PUBLIC / folder
    out = []
    if not d.exists():
        return out
    for f in sorted(d.rglob("*")):
        if not f.is_file() or f.suffix.lower() not in IMG_EXT:
            continue
        head, detail = _split_detail(f.name)
        name, ok = _clean_name(head + ".x")
        detail = " ".join(TYPO.get(w, w) for w in detail.split(" ")) if detail else ""
        rel = f.relative_to(C.FRONTEND_PUBLIC).as_posix()
        sub_aud = f.parent.name.lower() if f.parent != d else None
        out.append({"file": f.name, "rel": rel, "name": name, "name_ok": ok, "folder": folder, "detail": detail,
                    "department": IMAGE_FOLDERS.get(folder, "accessories"),
                    "audience_hint": {"men": "men", "women": "women"}.get(sub_aud or "")})
    # the same file may exist at the folder root and inside an audience sub-folder: keep the sub-folder copy
    best: dict = {}
    for im in out:
        cur = best.get(im["file"])
        if cur is None or (im["audience_hint"] and not cur["audience_hint"]):
            best[im["file"]] = im
    return list(best.values())


# ------------------------------------------------------------------ co-view graph
def coview_similarity(inter: pd.DataFrame, items: list[str]) -> sp.csr_matrix:
    idx = {it: i for i, it in enumerate(items)}
    s = inter[inter["event"].isin(["view_item", "add_to_cart"])][["sid", "item_id"]].drop_duplicates()
    s = s[s["item_id"].isin(idx)]
    sess_codes, _ = pd.factorize(s["sid"])
    X = sp.csr_matrix((np.ones(len(s), dtype=np.float32), (sess_codes, s["item_id"].map(idx).values)),
                      shape=(sess_codes.max() + 1, len(items)))
    co = (X.T @ X).tocsr().astype(np.float32)
    n = np.asarray(co.diagonal()).ravel()
    co.setdiag(0)
    co.eliminate_zeros()
    d = 1.0 / np.sqrt(np.maximum(n, 1))
    return sp.diags(d) @ co @ sp.diags(d)


def knn_label(sim: sp.csr_matrix, labels: np.ndarray, k: int = 15, exclude_self_label: bool = False) -> tuple[np.ndarray, np.ndarray]:
    """Similarity-weighted kNN vote. labels: array of str or '' for unlabeled."""
    classes = sorted({l for l in labels if l})
    cidx = {c: i for i, c in enumerate(classes)}
    pred = np.array([""] * len(labels), dtype=object)
    conf = np.zeros(len(labels))
    sim = sim.tocsr()
    for i in range(sim.shape[0]):
        row = sim.getrow(i)
        nb, w = row.indices, row.data
        mask = np.array([bool(labels[j]) for j in nb], dtype=bool)
        nb, w = nb[mask], w[mask]
        if len(nb) == 0:
            continue
        top = np.argsort(-w)[:k]
        votes = np.zeros(len(classes))
        for j, ww in zip(nb[top], w[top]):
            votes[cidx[labels[j]]] += ww
        pred[i] = classes[int(votes.argmax())]
        conf[i] = votes.max() / votes.sum()
    return pred, conf


# ------------------------------------------------------------------ main
def run() -> dict:
    inter = pd.read_parquet(C.PROCESSED_DIR / "interactions.parquet")
    tx = pd.read_parquet(C.PROCESSED_DIR / "transactions.parquet")
    users = pd.read_parquet(C.PROCESSED_DIR / "users.parquet", columns=["uid", "gender"])
    report: dict = {}

    items = sorted(set(inter["item_id"]) | set(tx["item_id"]), key=lambda x: int(x[4:]))
    cat = pd.DataFrame(index=pd.Index(items, name="item_id"))

    # ---- stats
    ev = inter.groupby(["item_id", "event"]).size().unstack(fill_value=0)
    cat["views"] = ev.get("view_item", 0)
    cat["carts"] = ev.get("add_to_cart", 0)
    txg = tx.groupby("item_id").agg(orders=("transaction_id", "nunique"), units=("qty", "sum"), revenue=("revenue", "sum"),
                                    price=("unit_price", "median"))
    cat = cat.join(txg).fillna({"views": 0, "carts": 0, "orders": 0, "units": 0, "revenue": 0.0})
    cat["viewers"] = inter.groupby("item_id")["uid"].nunique()
    cat["viewers"] = cat["viewers"].fillna(0).astype(int)
    cat["first_seen"] = inter.groupby("item_id")["ts"].min()
    cat["cart_rate"] = (cat["carts"] / cat["views"].clip(lower=1)).round(4)

    # ---- category labels (mode over transaction lines) + inference for the unlabeled
    lab = tx.groupby("item_id")["source_category"].agg(lambda s: s.mode().iloc[0])
    cat["source_category"] = lab
    labels = cat["source_category"].fillna("").to_numpy(dtype=object)
    # the non-merch add-on is not a product family; never propagate it to other items
    labels = np.where(np.isin(labels, list(C.NON_MERCH_CATEGORIES)), "", labels)
    true_nonmerch = cat["source_category"].isin(C.NON_MERCH_CATEGORIES).to_numpy()
    sim = coview_similarity(inter, items)
    # leave-one-out validation on labeled items: hide each label in turn (vectorised by masking self in kNN)
    labeled_idx = np.where(labels != "")[0]
    loo_pred = []
    for i in labeled_idx:
        l2 = labels.copy()
        l2[i] = ""
        row = sim.getrow(i)
        p, _ = knn_label(row, l2)
        loo_pred.append(p[0])
    loo_pred = np.array(loo_pred)
    has = loo_pred != ""
    acc = float((loo_pred[has] == labels[labeled_idx][has]).mean())
    majority = float(pd.Series(labels[labeled_idx]).value_counts(normalize=True).iloc[0])
    report["category_inference"] = {
        "labeled_items": int(len(labeled_idx)), "unlabeled_items": int((labels == "").sum()),
        "loo_accuracy": round(acc, 4), "majority_baseline": round(majority, 4), "loo_coverage": round(float(has.mean()), 4),
    }
    pred, conf = knn_label(sim, labels)
    inferred = (labels == "") & ~true_nonmerch
    cat["category_inferred"] = inferred
    cat["category_confidence"] = np.where(inferred, conf, 1.0).round(3)
    cat.loc[inferred, "source_category"] = pred[inferred]
    cat["source_category"] = cat["source_category"].replace("", "CATEGORY_1")
    log.info("category inference: %s", report["category_inference"])

    # ---- price imputation for unsold items: co-view weighted log-price of priced neighbours
    price = cat["price"].to_numpy(dtype=float)
    price[price < 2.5] = np.nan  # free samples / zero-revenue lines are not list prices
    imputed = np.isnan(price)
    logp = np.log(np.where(np.isnan(price), 1.0, price))
    cat_med = cat.groupby("source_category")["price"].median()
    for i in np.where(imputed)[0]:
        row = sim.getrow(i)
        m = ~np.isnan(price[row.indices])
        if m.sum() >= 3:
            w = row.data[m]
            price[i] = float(np.exp(np.average(logp[row.indices[m]], weights=w)))
        else:
            price[i] = float(cat_med.get(cat["source_category"].iloc[i], 49.99))
    # retail-style endings
    cat["price"] = np.where(imputed, np.maximum(np.floor(price) + 0.99, 4.99), price).round(2)
    cat["price_imputed"] = imputed

    # ---- markdown detection
    tx = tx.copy()
    tx["month"] = tx["date"].dt.to_period("M")
    end = tx["date"].max()
    monthly = tx.groupby(["item_id", "month"])["unit_price"].median().groupby("item_id").quantile(0.9)
    recent = tx[tx["date"] > end - pd.Timedelta(days=60)].groupby("item_id")["unit_price"].median()
    ref = monthly.reindex(cat.index)
    cur = recent.reindex(cat.index)
    on_sale = (cur <= 0.93 * ref) & cur.notna()
    cat["compare_at"] = np.where(on_sale, np.ceil(ref) - 0.01, np.nan)
    cat.loc[on_sale, "price"] = cur[on_sale].round(2)
    cat["discount_pct"] = np.where(on_sale, np.round(100 * (1 - cat["price"] / cat["compare_at"])), 0).astype(int)
    cat["on_sale"] = on_sale.fillna(False).astype(bool)
    report["markdowns"] = {"items_on_sale": int(cat["on_sale"].sum()), "median_discount_pct": float(cat.loc[cat["on_sale"], "discount_pct"].median() or 0)}

    # ---- popularity & gender mix of the audience
    w = inter.groupby("item_id")["weight"].sum()
    cat["popularity"] = w.reindex(cat.index).fillna(0) + 5 * cat["orders"]
    g = inter[["uid", "item_id"]].drop_duplicates().merge(users, on="uid", how="left")
    cat["female_share"] = g.assign(f=(g["gender"] == "female").astype(float)).groupby("item_id")["f"].mean().reindex(cat.index).fillna(0.3)

    # ---- variants (distinct SKUs per item in transactions)
    cat["variants"] = tx.groupby("item_id")["sku"].nunique().reindex(cat.index).fillna(1).astype(int)

    # ---- taxonomy + image assignment
    # Every merchandisable item receives exactly one storefront image. Apparel images (women/men folders)
    # go to the most popular CATEGORY_1 items (split by the gender mix of their viewers); all remaining
    # items are matched to the accessory image pool by price tier, and their department follows the
    # image tier (watches / jewellery / footwear / accessories).
    cat["merch"] = ~cat["source_category"].isin(C.NON_MERCH_CATEGORIES)
    for col in ("department", "image", "image_file", "name", "subcategory", "audience"):
        cat[col] = None
    cat["detail"] = ""
    women, men = _load_images("women"), _load_images("men")
    pools = {f: _load_images(f) for f in FOLDER_TIER}
    rng = np.random.default_rng(C.RANDOM_SEED)
    cat["image_rel"] = None

    apparel = cat[cat["merch"] & (cat["source_category"] == "CATEGORY_1")].sort_values("popularity", ascending=False)
    cap = len(women) + len(men)
    shown = apparel.head(cap)
    n_w = round(len(shown) * len(women) / cap)
    order = shown.sort_values("female_share", ascending=False).index
    w_items, m_items = list(order[:n_w]), list(order[n_w:])
    used_images: set = set()
    for dept, its, imgs in (("women", w_items, women), ("men", m_items, men)):
        imgs = sorted(imgs, key=lambda x: (not x["name_ok"], rng.random()))
        its = sorted(its, key=lambda i: -cat.at[i, "popularity"])
        for it, im in zip(its, imgs):
            cat.at[it, "department"] = dept
            cat.at[it, "audience"] = dept
            cat.at[it, "image_file"] = im["file"]
            cat.at[it, "image_rel"] = im["rel"]
            cat.at[it, "name"] = im["name"] if im["name_ok"] else None
            cat.at[it, "detail"] = im["detail"]
            cat.at[it, "subcategory"] = _subcategory(im["name"], APPAREL_SUBCATS) or "Clothing"
            used_images.add(im["rel"])

    # remaining items -> the user's category folders, by price tier (Watches > Jewelry > Shoes > Bags > Accessories)
    rest = cat[cat["merch"] & cat["department"].isna()].sort_values("price", ascending=False)
    ordered_imgs = []
    for f in FOLDER_TIER:
        ordered_imgs += sorted(pools[f], key=lambda x: (not x["name_ok"], rng.random()))
    for it, im in zip(rest.index, ordered_imgs):
        dept = im["department"]
        sub_hint = _subcategory(im["name"] + " " + im["detail"], ACCESSORY_TIERS) or {"Shoes": "Footwear", "Watches": "Watches", "Jewelry": "Jewellery", "Bags": "Bags & Belts"}.get(im["folder"], "Accessories")
        cat.at[it, "department"] = dept
        cat.at[it, "image_file"] = im["file"]
        cat.at[it, "image_rel"] = im["rel"]
        cat.at[it, "name"] = im["name"] if im["name_ok"] else None
        cat.at[it, "detail"] = im["detail"]
        cat.at[it, "subcategory"] = _fine_subcategory(dept, im["name"] + " " + im["detail"] + " " + im["folder"], sub_hint)
        cat.at[it, "audience"] = im["audience_hint"] or _audience(im["name"] + " " + im["detail"], sub_hint, float(cat.at[it, "female_share"]))
        used_images.add(im["rel"])

    # images without a dataset item become catalog-only products (item cold start: no behavioural data yet)
    leftovers = [im for im in ordered_imgs + women + men if im["rel"] not in used_images]
    new_rows = []
    for k, im in enumerate(leftovers, 1):
        dept = im["department"]
        sub_hint = _subcategory(im["name"] + " " + im["detail"], ACCESSORY_TIERS) or {"Shoes": "Footwear", "Watches": "Watches", "Jewelry": "Jewellery", "Bags": "Bags & Belts"}.get(im["folder"], "Clothing" if dept in C.APPAREL_DEPARTMENTS else "Accessories")
        sub = _fine_subcategory(dept, im["name"] + " " + im["detail"] + " " + im["folder"], sub_hint) if dept not in C.APPAREL_DEPARTMENTS else (_subcategory(im["name"], APPAREL_SUBCATS) or "Clothing")
        peers = cat[(cat["department"] == dept) & (cat["subcategory"] == sub) & cat["price"].notna()]
        peers = peers if len(peers) >= 3 else cat[(cat["department"] == dept) & cat["price"].notna()]
        price = float(peers["price"].median()) if len(peers) else 49.99
        new_rows.append({"item_id": f"NEW{k:03d}", "views": 0, "carts": 0, "orders": 0, "units": 0, "revenue": 0.0, "price": round(np.floor(price) + 0.99, 2),
                         "viewers": 0, "first_seen": cat["first_seen"].max(), "cart_rate": 0.0, "source_category": "CATALOG_ONLY", "category_inferred": False,
                         "category_confidence": 0.0, "price_imputed": True, "compare_at": np.nan, "discount_pct": 0, "on_sale": False, "popularity": 0.0,
                         "female_share": 0.5, "variants": 1, "merch": True, "department": dept, "image_file": im["file"], "image_rel": im["rel"],
                         "name": im["name"] if im["name_ok"] else None, "detail": im["detail"], "subcategory": sub,
                         "audience": im["audience_hint"] or (dept if dept in C.APPAREL_DEPARTMENTS else _audience(im["name"] + " " + im["detail"], sub_hint, 0.5))})
    if new_rows:
        cat = pd.concat([cat, pd.DataFrame(new_rows).set_index("item_id")])
    report["catalog_only_items"] = len(new_rows)

    cat["displayable"] = cat["department"].notna()
    counters: dict = {}
    for it in cat.index[cat["displayable"]]:
        dept = cat.at[it, "department"]
        f = cat.at[it, "image_file"]
        rel = cat.at[it, "image_rel"] or f"{dept}/{f}"
        cat.at[it, "image"] = "/" + "/".join(quote(seg) for seg in rel.split("/"))
        if not cat.at[it, "name"]:
            sub = cat.at[it, "subcategory"]
            counters[(dept, sub)] = counters.get((dept, sub), 0) + 1
            label = {"women": "Women's", "men": "Men's"}.get(dept, "")
            cat.at[it, "name"] = f"{label} {sub} Edit No. {counters[(dept, sub)]:02d}".strip()
    cat["brand"] = [(_brand(n) if isinstance(n, str) else "AURA Studio") for n in cat["name"]]
    # ---- attributes (colour, material, pattern, styles, sizes) + description
    from . import attributes as A
    for col in ("colour", "colour_hex", "material", "pattern", "styles", "sizes", "description"):
        cat[col] = None
    for it in cat.index[cat["displayable"]]:
        r = cat.loc[it].to_dict()
        r["name"] = r.get("name") or ""
        rel = cat.at[it, "image_rel"]
        attrs = A.enrich(r, (C.FRONTEND_PUBLIC / rel) if rel else None)
        cat.at[it, "colour"] = attrs["colour"]; cat.at[it, "colour_hex"] = attrs["colourHex"]; cat.at[it, "material"] = attrs["material"]
        cat.at[it, "pattern"] = attrs["pattern"]; cat.at[it, "styles"] = json.dumps(attrs["styles"]); cat.at[it, "sizes"] = json.dumps(attrs["sizes"])
        cat.at[it, "description"] = A.describe({**r, **attrs})
    # colour options = sibling products sharing the same base name (e.g. "Retero Sneakers" in Cuoio and Marine)
    base = cat["name"].fillna("").str.lower()
    cat["colour_options"] = [json.dumps([{"id": j, "colour": cat.at[j, "colour"], "hex": cat.at[j, "colour_hex"]} for j in cat.index[(base == base[i]) & (cat.index != i) & cat["displayable"]]][:6]) if cat.at[i, "displayable"] else "[]" for i in cat.index]
    cat.loc[~cat["merch"], ["name", "department", "subcategory", "brand", "audience"]] = ["Order Protection Add-on", "addon", "Add-on", "AURA", "unisex"]

    # ---- badges (full-history; used for display only)
    disp = cat[cat["displayable"]]
    best_thr = disp["orders"].quantile(0.9)
    new_thr = cat["first_seen"].max() - pd.Timedelta(days=120)
    cat["is_bestseller"] = cat["displayable"] & (cat["orders"] >= best_thr) & (cat["orders"] > 0)
    cat["is_new"] = cat["displayable"] & ((cat["first_seen"] >= new_thr) | (cat["source_category"] == "CATALOG_ONLY"))

    report["catalog"] = {
        "items_total": int(len(cat)), "merch_items": int(cat["merch"].sum()),
        "displayable_items": int(cat["displayable"].sum()),
        "by_department": cat[cat["displayable"]]["department"].value_counts().to_dict(),
        "by_audience": cat[cat["displayable"]]["audience"].value_counts().to_dict(),
        "by_subcategory": cat[cat["displayable"]].groupby(["department", "subcategory"]).size().rename("n").reset_index().to_dict("records"),
        "displayable_share_of_interactions": round(float(cat.loc[cat["displayable"], "popularity"].sum() / cat.loc[cat["merch"], "popularity"].sum()), 4),
        "source_category_to_department": cat[cat["displayable"]].groupby(["source_category", "department"]).size().rename("n").reset_index().to_dict("records"),
    }

    # ---- currency: dataset prices are USD; the store sells in INR with Indian retail price endings
    cat["price_usd"] = cat["price"].astype(float)
    cat["price"] = [C.usd_to_inr(p) for p in cat["price_usd"]]
    cat["compare_at"] = [C.usd_to_inr(p) if p == p else np.nan for p in cat["compare_at"].astype(float)]
    has = cat["compare_at"].notna() & (cat["compare_at"] > cat["price"])
    cat["discount_pct"] = np.where(has, np.round(100 * (1 - cat["price"] / cat["compare_at"].where(has, 1))), 0).astype(int)
    cat["on_sale"] = cat["on_sale"] & has
    cat.loc[~has, "compare_at"] = np.nan
    report["currency"] = {"currency": C.CURRENCY, "usdToInr": C.USD_TO_INR, "rounding": "retail endings: ...9 below ₹1,000, ...49/...99 above"}

    cat = cat.reset_index().rename(columns={"index": "item_id"}) if "item_id" not in cat.columns else cat.reset_index()
    cat.to_parquet(C.PROCESSED_DIR / "catalog.parquet", index=False)
    _export_frontend_catalog(cat)
    (C.REPORTS_DIR / "catalog_report.json").write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    log.info("catalog: %s", report["catalog"])
    return report


def product_record(r) -> dict:
    return {
        "id": r["item_id"], "name": r["name"], "detail": r["detail"] or "", "brand": r["brand"], "department": r["department"],
        "departmentLabel": C.DEPARTMENTS.get(r["department"], r["department"]), "subcategory": r["subcategory"],
        "sourceCategory": r["source_category"], "price": round(float(r["price"]), 2),
        "compareAt": None if pd.isna(r["compare_at"]) else round(float(r["compare_at"]), 2),
        "discountPct": int(r["discount_pct"]), "onSale": bool(r["on_sale"]), "image": r["image"],
        "isBestseller": bool(r["is_bestseller"]), "isNew": bool(r["is_new"]),
        "audience": r.get("audience") or "unisex", "variants": int(r.get("variants", 1) or 1),
        "femaleShare": round(float(r.get("female_share", 0.0)), 3),
        "colour": r.get("colour"), "colourHex": r.get("colour_hex"), "material": r.get("material"), "pattern": r.get("pattern"),
        "styles": json.loads(r.get("styles") or "[]"), "sizes": json.loads(r.get("sizes") or "[]"),
        "colourOptions": json.loads(r.get("colour_options") or "[]"), "description": r.get("description") or "",
        "catalogOnly": r.get("source_category") == "CATALOG_ONLY",
        "stats": {"views": int(r["views"]), "carts": int(r["carts"]), "orders": int(r["orders"]),
                  "cartRate": float(r["cart_rate"])},
    }


def _export_frontend_catalog(cat: pd.DataFrame) -> None:
    disp = cat[cat["displayable"]].sort_values("popularity", ascending=False)
    products = [product_record(r) for _, r in disp.iterrows()]
    (C.FRONTEND_DATA / "catalog.json").write_text(json.dumps(products, ensure_ascii=False, indent=1), encoding="utf-8")
