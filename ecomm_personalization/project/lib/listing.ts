// Listing-page helpers shared by server pages (SSR fallback from catalog.json) and the client ShopListing.

import { isSortKey, localSearch, type SortKey } from './catalog';
import type { FacetKey, SearchParams, SearchResponse } from './types';

export const PAGE = 24;

/** URL query key <-> API param for the list facets. Keys are kept short so links stay shareable. */
export const FACET_URL: Record<FacetKey, string> = {
  department: 'dep',
  subcategory: 'sub',
  brand: 'brand',
  colour: 'colour',
  material: 'material',
  pattern: 'pattern',
  audience: 'audience',
  style: 'style',
  size: 'size',
};

export const FACET_LABEL: Record<FacetKey, string> = {
  department: 'Department',
  subcategory: 'Categories',
  brand: 'Brand',
  colour: 'Colour',
  material: 'Material',
  pattern: 'Pattern',
  audience: 'Shopping for',
  style: 'Style',
  size: 'Size',
};

export const FACET_ORDER: FacetKey[] = ['department', 'audience', 'subcategory', 'brand', 'colour', 'size', 'style', 'material', 'pattern'];

export type ListFilters = {
  facets: Partial<Record<FacetKey, string[]>>;
  minPrice?: number;
  maxPrice?: number;
  minDiscount?: number;
  minRating?: number;
  onSale?: boolean;
  isNew?: boolean;
  sort?: SortKey;
};

const num = (v: string | null) => {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const bool = (v: string | null) => v === '1' || v === 'true';

export function parseFilters(sp: URLSearchParams): ListFilters {
  const facets: ListFilters['facets'] = {};
  (Object.keys(FACET_URL) as FacetKey[]).forEach((k) => {
    const raw = sp.getAll(FACET_URL[k]).flatMap((v) => v.split(','));
    const vals = raw.map((v) => v.trim()).filter(Boolean);
    if (vals.length) facets[k] = Array.from(new Set(vals));
  });
  const sort = sp.get('sort');
  return {
    facets,
    minPrice: num(sp.get('min')),
    maxPrice: num(sp.get('max')),
    minDiscount: num(sp.get('discount')),
    minRating: num(sp.get('rating')),
    onSale: bool(sp.get('sale')) || undefined,
    isNew: bool(sp.get('new')) || undefined,
    sort: isSortKey(sort) ? sort : undefined,
  };
}

export function serializeFilters(f: ListFilters, keep?: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  // keep non-filter params (e.g. q on the search page)
  keep?.forEach((v, k) => {
    if (k === 'q') out.set(k, v);
  });
  (Object.keys(FACET_URL) as FacetKey[]).forEach((k) => {
    const vals = f.facets[k];
    if (vals?.length) out.set(FACET_URL[k], vals.join(','));
  });
  if (f.minPrice != null) out.set('min', String(f.minPrice));
  if (f.maxPrice != null) out.set('max', String(f.maxPrice));
  if (f.minDiscount) out.set('discount', String(f.minDiscount));
  if (f.minRating) out.set('rating', String(f.minRating));
  if (f.onSale) out.set('sale', '1');
  if (f.isNew) out.set('new', '1');
  if (f.sort) out.set('sort', f.sort);
  return out;
}

/** Merge the page's fixed params with the user's filters into /catalog/search params. */
export function toSearchParams(base: SearchParams, f: ListFilters, offset = 0, limit = PAGE): SearchParams {
  const p: SearchParams = { ...base, offset, limit };
  (Object.keys(FACET_URL) as FacetKey[]).forEach((k) => {
    const vals = f.facets[k];
    if (vals?.length) (p as Record<string, unknown>)[k] = vals.join(',');
  });
  if (f.minPrice != null) p.minPrice = f.minPrice;
  if (f.maxPrice != null) p.maxPrice = f.maxPrice;
  if (f.minDiscount) p.minDiscount = f.minDiscount;
  if (f.minRating) p.minRating = f.minRating;
  if (f.onSale) p.onSale = true;
  if (f.isNew) p.isNew = true;
  if (f.sort) p.sort = f.sort;
  return p;
}

type RawSearchParams = Record<string, string | string[] | undefined>;

export function toURLSearchParams(raw: RawSearchParams): URLSearchParams {
  const sp = new URLSearchParams();
  Object.entries(raw).forEach(([k, v]) => {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else if (v != null) sp.set(k, v);
  });
  return sp;
}

/**
 * Server-side initial state for a listing page: the same query the client will send to
 * /catalog/search, answered from catalog.json. Used as the first paint and the offline fallback.
 */
export function ssrSearch(base: SearchParams, raw: RawSearchParams, defaultSort?: SortKey): SearchResponse {
  const f = parseFilters(toURLSearchParams(raw));
  const sort = f.sort || defaultSort || (base.q ? 'relevance' : 'popular');
  return localSearch(toSearchParams(base, { ...f, sort }, 0, PAGE));
}
