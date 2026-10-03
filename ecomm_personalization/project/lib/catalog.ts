import raw from '@/data/catalog.json';
import storefrontRaw from '@/data/storefront.json';
import type { Department, FacetKey, Facets, Product, SearchParams, SearchResponse, SearchSort } from './types';

/** Next's static file server does not decode %27 (apostrophe) in paths — use a literal quote instead. */
export function fixImagePath(src: string): string {
  return typeof src === 'string' ? src.replace(/%27/gi, "'") : src;
}

/** Catalog written by the data pipeline (sorted by popularity). */
export const CATALOG: Product[] = (raw as unknown as Product[]).map((p) => ({ ...p, image: fixImagePath(p.image) }));

const BY_ID = new Map(CATALOG.map((p) => [p.id, p]));

export const DEPARTMENTS: { id: Department; label: string; tagline: string }[] = [
  { id: 'women', label: 'Women', tagline: 'Dresses, denim, knitwear & more' },
  { id: 'men', label: 'Men', tagline: 'Jackets, shirts, trousers & more' },
  { id: 'footwear', label: 'Footwear', tagline: 'Sneakers, boots, heels & loafers' },
  { id: 'watches', label: 'Watches', tagline: 'Tourbillons, dive & dress watches' },
  { id: 'jewellery', label: 'Jewellery', tagline: 'Rings, bracelets, necklaces & earrings' },
  { id: 'accessories', label: 'Accessories', tagline: 'Eyewear, hats, bags & belts' },
];

const DEPARTMENT_IDS = new Set<string>(DEPARTMENTS.map((d) => d.id));

export function isDepartment(v: string): v is Department {
  return DEPARTMENT_IDS.has(v);
}

export function departmentLabel(id: string | null | undefined): string {
  return DEPARTMENTS.find((d) => d.id === id)?.label || (id ? id.charAt(0).toUpperCase() + id.slice(1) : '');
}

/** Subcategories of a department, most populated first (built from the catalog). */
export function subcategoriesOf(dep: string): { name: string; count: number; image: string }[] {
  return countBy(byDepartment(dep), (p) => p.subcategory).map((s) => ({ ...s, image: coverImage(dep, s.name) }));
}

/** Departments where the audience badge is informative (women/men apparel is implied by the department). */
export const AUDIENCE_BADGE_DEPARTMENTS: ReadonlySet<string> = new Set(['footwear', 'watches', 'jewellery', 'accessories']);

export function showAudienceBadge(p: Product): boolean {
  return AUDIENCE_BADGE_DEPARTMENTS.has(p.department) && (p.audience === 'women' || p.audience === 'men');
}

export const AUDIENCE_OPTIONS: { id: 'women' | 'men' | 'unisex'; label: string }[] = [
  { id: 'women', label: 'Women' },
  { id: 'men', label: 'Men' },
  { id: 'unisex', label: 'Unisex' },
];

export const APPAREL_SIZES = ['XS', 'S', 'M', 'L', 'XL'];
export const SHOE_SIZES = ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'];

const NO_SIZE = new Set(['one size', 'os', 'free size', '']);

/**
 * Size options for a product: the catalog's `sizes` (v4) when present, otherwise apparel sizes for
 * women/men and EU shoe sizes for footwear. "One size" items need no size selection.
 */
export function sizesFor(p: Product): string[] {
  if (Array.isArray(p.sizes) && p.sizes.length) {
    return p.sizes.filter((s) => !NO_SIZE.has(String(s).trim().toLowerCase()));
  }
  if (p.department === 'women' || p.department === 'men') return APPAREL_SIZES;
  if (p.department === 'footwear') return SHOE_SIZES;
  return [];
}

/** Size used for one-click "add to bag" flows (bundles, wishlist). */
export function defaultSize(p: Product): string | null {
  const s = sizesFor(p);
  if (!s.length) return null;
  if (s.includes('M')) return 'M';
  if (s.includes('40')) return '40';
  return s[Math.floor(s.length / 2)];
}

export function getProduct(id: string): Product | undefined {
  return BY_ID.get(id);
}

export function getProducts(ids: string[]): Product[] {
  return ids.map((id) => BY_ID.get(id)).filter((p): p is Product => !!p);
}

export function byDepartment(dep: string): Product[] {
  return CATALOG.filter((p) => p.department === dep);
}

export function idNum(id: string): number {
  const m = id.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

export type SortKey = SearchSort;

export const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'relevance', label: 'Relevance' },
  { id: 'popular', label: 'Popularity' },
  { id: 'price_asc', label: 'Price: low to high' },
  { id: 'price_desc', label: 'Price: high to low' },
  { id: 'discount', label: 'Better discount' },
  { id: 'new', label: "What's new" },
  { id: 'rating', label: 'Customer rating' },
];

export const SORT_IDS = new Set<string>(SORT_OPTIONS.map((o) => o.id));

export function isSortKey(v: string | null | undefined): v is SortKey {
  return !!v && SORT_IDS.has(v);
}

export function sortProducts(list: Product[], sort: SortKey): Product[] {
  const arr = [...list];
  switch (sort) {
    case 'new':
      return arr.sort((a, b) => Number(!!b.catalogOnly) - Number(!!a.catalogOnly) || Number(b.isNew) - Number(a.isNew) || idNum(b.id) - idNum(a.id));
    case 'price_asc':
      return arr.sort((a, b) => a.price - b.price);
    case 'price_desc':
      return arr.sort((a, b) => b.price - a.price);
    case 'discount':
      return arr.sort((a, b) => b.discountPct - a.discountPct || popularity(b) - popularity(a));
    case 'rating':
      return arr.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || popularity(b) - popularity(a));
    default:
      return arr; // catalog order == popularity
  }
}

export function popularity(p: Product) {
  return p.stats.views + p.stats.carts * 5 + p.stats.orders * 20;
}

export function countBy<T>(list: T[], key: (t: T) => string): { name: string; count: number }[] {
  const m = new Map<string, number>();
  list.forEach((x) => m.set(key(x), (m.get(key(x)) || 0) + 1));
  return Array.from(m.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function saleProducts(): Product[] {
  return sortProducts(
    CATALOG.filter((p) => p.onSale),
    'discount',
  );
}

export function newProducts(min = 12): Product[] {
  const fresh = CATALOG.filter((p) => p.isNew);
  if (fresh.length >= min) return fresh;
  const ids = new Set(fresh.map((p) => p.id));
  const newest = [...CATALOG].sort((a, b) => idNum(b.id) - idNum(a.id)).filter((p) => !ids.has(p.id));
  return [...fresh, ...newest.slice(0, Math.max(0, 24 - fresh.length))];
}

export function searchCatalog(q: string): Product[] {
  const terms = q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (!terms.length) return [];
  const scored = CATALOG.map((p) => {
    const hay = {
      name: p.name.toLowerCase(),
      brand: p.brand.toLowerCase(),
      sub: p.subcategory.toLowerCase(),
      dep: `${p.department} ${p.departmentLabel} ${p.audience || ''}`.toLowerCase(),
    };
    let score = 0;
    for (const t of terms) {
      let hit = 0;
      if (hay.sub.includes(t)) hit = Math.max(hit, 4);
      if (hay.brand.includes(t)) hit = Math.max(hit, 3);
      if (hay.name.includes(t)) hit = Math.max(hit, 2);
      if (hay.dep.includes(t) || (t.endsWith('s') && hay.dep.includes(t.slice(0, -1)))) hit = Math.max(hit, 1);
      if (!hit) return { p, score: -1 };
      score += hit;
    }
    return { p, score };
  }).filter((x) => x.score > 0);
  return scored.sort((a, b) => b.score - a.score).map((x) => x.p);
}

/** Catalog-only fallback for "similar" products. */
export function relatedFromCatalog(product: Product, n = 12): Product[] {
  const same = CATALOG.filter((p) => p.id !== product.id && p.subcategory === product.subcategory && p.department === product.department);
  const dep = CATALOG.filter((p) => p.id !== product.id && p.department === product.department && p.subcategory !== product.subcategory);
  return [...same, ...dep].slice(0, n);
}

/** Women / men clothing (the departments with apparel sizes). */
export function isApparel(p: Product) {
  return p.department === 'women' || p.department === 'men';
}

/** Share of a product list that targets the given audience (0..1). */
export function audienceShare(list: Product[], audience: 'women' | 'men' | 'unisex'): number {
  if (!list.length) return 0;
  return list.filter((p) => p.audience === audience).length / list.length;
}

/** A representative image for a department / subcategory (most popular item). */
export function coverImage(dep: string, sub?: string): string {
  const p = CATALOG.find((x) => x.department === dep && (!sub || x.subcategory === sub));
  return p?.image || CATALOG[0].image;
}

/* ------------------------------ local search engine ------------------------------ */

const csv = (v?: string | null) =>
  (v || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

const lower = (v: string | null | undefined) => (v || '').toLowerCase();

function facetOf(list: Product[], key: (p: Product) => string | string[] | null | undefined, hexOf?: (p: Product) => string | null | undefined) {
  const counts = new Map<string, { count: number; hex?: string | null }>();
  list.forEach((p) => {
    const raw = key(p);
    const vals = Array.isArray(raw) ? raw : raw ? [raw] : [];
    vals.forEach((v) => {
      const cur = counts.get(v) || { count: 0, hex: hexOf ? hexOf(p) : undefined };
      cur.count += 1;
      counts.set(v, cur);
    });
  });
  return Array.from(counts.entries())
    .map(([value, c]) => ({ value, count: c.count, ...(c.hex !== undefined ? { hex: c.hex } : {}) }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * Same semantics as GET /api/v1/catalog/search, computed from catalog.json. Used for the initial
 * server render of listing pages and as the offline fallback. Facets are computed on the result set
 * (like the API); the price range on the pre-price-filter set so the slider keeps its bounds.
 */
export function localSearch(params: SearchParams, base: Product[] = CATALOG): SearchResponse {
  let list = base;
  const q = (params.q || '').trim();
  if (q) {
    const hits = new Set(searchCatalog(q).map((p) => p.id));
    list = list.filter((p) => hits.has(p.id));
  }
  const inList = (v: string | undefined, get: (p: Product) => string | null | undefined) => {
    const vals = csv(v).map(lower);
    if (!vals.length) return;
    list = list.filter((p) => vals.includes(lower(get(p))));
  };
  const inAny = (v: string | undefined, get: (p: Product) => string[] | null | undefined) => {
    const vals = csv(v).map(lower);
    if (!vals.length) return;
    list = list.filter((p) => (get(p) || []).some((x) => vals.includes(lower(x))));
  };
  inList(params.department, (p) => p.department);
  inList(params.subcategory, (p) => p.subcategory);
  inList(params.brand, (p) => p.brand);
  inList(params.colour, (p) => p.colour);
  inList(params.material, (p) => p.material);
  inList(params.pattern, (p) => p.pattern);
  inList(params.audience, (p) => p.audience);
  inAny(params.style, (p) => p.styles);
  inAny(params.size, (p) => p.sizes);
  if (params.ids) {
    const ids = new Set(csv(params.ids));
    list = list.filter((p) => ids.has(p.id));
  }
  if (params.collection) {
    const col = (storefrontRaw as unknown as { collections: { id: string; itemIds: string[] }[] }).collections.find((c) => c.id === params.collection);
    const ids = new Set(col?.itemIds || []);
    list = list.filter((p) => ids.has(p.id));
  }
  if (params.onSale) list = list.filter((p) => p.onSale);
  if (params.isNew) list = list.filter((p) => p.isNew || p.catalogOnly);
  if (params.minDiscount) list = list.filter((p) => p.discountPct >= Number(params.minDiscount));
  if (params.minRating) list = list.filter((p) => (p.rating ?? 0) >= Number(params.minRating));

  const prePrice = list;
  if (params.minPrice != null) list = list.filter((p) => p.price >= Number(params.minPrice));
  if (params.maxPrice != null) list = list.filter((p) => p.price <= Number(params.maxPrice));

  const sort: SearchSort = params.sort || (q ? 'relevance' : 'popular');
  const sorted = sort === 'relevance' ? list : sortProducts(list, sort);
  const offset = Math.max(0, Number(params.offset || 0));
  const limit = Math.max(1, Number(params.limit || 24));

  const facets: Facets = {
    department: facetOf(list, (p) => p.department),
    subcategory: facetOf(list, (p) => p.subcategory),
    brand: facetOf(list, (p) => p.brand),
    colour: facetOf(list, (p) => p.colour, (p) => p.colourHex),
    material: facetOf(list, (p) => p.material),
    pattern: facetOf(list, (p) => p.pattern),
    audience: facetOf(list, (p) => p.audience),
    style: facetOf(list, (p) => p.styles),
    size: facetOf(list, (p) => p.sizes),
  };
  const prices = prePrice.map((p) => p.price);
  return {
    total: sorted.length,
    items: sorted.slice(offset, offset + limit),
    facets,
    priceRange: prices.length ? { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) } : { min: 0, max: 0 },
    query: q || null,
    offline: true,
  };
}

export const FACET_KEYS: FacetKey[] = ['department', 'subcategory', 'brand', 'colour', 'material', 'pattern', 'audience', 'style', 'size'];

const KNOWN_COLOURS: Record<string, string> = {
  black: '#111111',
  white: '#f5f5f5',
  grey: '#9ca3af',
  gray: '#9ca3af',
  red: '#dc2626',
  blue: '#2563eb',
  navy: '#1e3a8a',
  green: '#16a34a',
  pink: '#ec4899',
  beige: '#d6caba',
  brown: '#7c4a1e',
  tan: '#c8a27a',
  yellow: '#eab308',
  orange: '#f97316',
  purple: '#7c3aed',
  gold: '#d4af37',
  silver: '#c0c0c0',
  cream: '#f3e9d2',
};

/** Colour name -> hex for swatches when the facet carries no hex (best effort; null = multicolour). */
export function colourHexFor(name: string, facetHex?: string | null): string | null {
  if (facetHex) return facetHex;
  const p = CATALOG.find((x) => lower(x.colour) === lower(name) && x.colourHex);
  if (p?.colourHex) return p.colourHex;
  return KNOWN_COLOURS[lower(name)] ?? null;
}
