'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search, SlidersHorizontal, Star, WifiOff, X } from 'lucide-react';
import ProductCard from '@/components/product/ProductCard';
import { useSession } from '@/contexts/SessionContext';
import { isOffline, searchCatalogApi, sendRichEvent } from '@/lib/api';
import { AUDIENCE_OPTIONS, SORT_OPTIONS, colourHexFor, departmentLabel, localSearch, type SortKey } from '@/lib/catalog';
import { FACET_LABEL, FACET_ORDER, FACET_URL, PAGE, parseFilters, serializeFilters, toSearchParams, type ListFilters } from '@/lib/listing';
import type { FacetKey, FacetValue, Facets, SearchParams, SearchResponse } from '@/lib/types';
import { cn, formatPrice, titleCase } from '@/lib/utils';

const DISCOUNTS = [
  { id: 10, label: '10% and above' },
  { id: 30, label: '30% and above' },
  { id: 50, label: '50% and above' },
];
const RATINGS = [
  { id: 4, label: '4★ & above' },
  { id: 3, label: '3★ & above' },
];

function CheckRow({ checked, onChange, label, count, swatch }: { checked: boolean; onChange: () => void; label: string; count?: number; swatch?: string | null }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 py-1 text-sm text-gray-700 hover:text-ink">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 shrink-0 rounded border-gray-300 accent-brand-600" />
      {swatch !== undefined && (
        <span
          aria-hidden
          className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10"
          style={swatch ? { background: swatch } : { background: 'conic-gradient(#f43f5e, #f59e0b, #10b981, #3b82f6, #a855f7, #f43f5e)' }}
        />
      )}
      <span className="flex-1 truncate">{label}</span>
      {count != null && <span className="text-xs text-gray-400">({count})</span>}
    </label>
  );
}

function Chip({ on, onClick, children, swatch }: { on: boolean; onClick: () => void; children: React.ReactNode; swatch?: string | null }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition', on ? 'border-ink bg-ink text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400')}
    >
      {swatch !== undefined && (
        <span aria-hidden className="h-3 w-3 rounded-full ring-1 ring-black/10" style={swatch ? { background: swatch } : { background: 'conic-gradient(#f43f5e, #f59e0b, #10b981, #3b82f6, #a855f7, #f43f5e)' }} />
      )}
      {children}
    </button>
  );
}

/** Price filter works in whole rupees, in ₹100 steps. */
const PRICE_STEP = 100;

/** Dual-thumb price range built from two overlapping native range inputs (keyboard accessible). Values are INR. */
function PriceRange({ min, max, value, onChange }: { min: number; max: number; value: [number, number]; onChange: (v: [number, number]) => void }) {
  const [lo, hi] = value;
  const gap = Math.min(PRICE_STEP, Math.max(1, max - min));
  const span = Math.max(1, max - min);
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - min) / span) * 100));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-ink">
        <span>{formatPrice(lo)}</span>
        <span>{hi >= max ? `${formatPrice(max)}+` : formatPrice(hi)}</span>
      </div>
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gray-200" />
        <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand-600" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
        <input type="range" min={min} max={max} step={PRICE_STEP} value={lo} aria-label="Minimum price (₹)" aria-valuetext={formatPrice(lo)} onChange={(e) => onChange([Math.min(Number(e.target.value), hi - gap), hi])} className="range-thumb pointer-events-none absolute inset-x-0 top-0 h-6 w-full appearance-none bg-transparent" />
        <input type="range" min={min} max={max} step={PRICE_STEP} value={hi} aria-label="Maximum price (₹)" aria-valuetext={formatPrice(hi)} onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo + gap)])} className="range-thumb pointer-events-none absolute inset-x-0 top-0 h-6 w-full appearance-none bg-transparent" />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-[11px] text-gray-500">
          Min (₹)
          <input type="number" inputMode="numeric" min={min} max={hi} step={PRICE_STEP} value={lo} onChange={(e) => onChange([Math.max(min, Math.min(Math.round(Number(e.target.value)) || min, hi - gap)), hi])} className="input mt-0.5 px-2 py-1 text-xs" />
        </label>
        <label className="text-[11px] text-gray-500">
          Max (₹)
          <input type="number" inputMode="numeric" min={lo} max={max} step={PRICE_STEP} value={hi} onChange={(e) => onChange([lo, Math.min(max, Math.max(Math.round(Number(e.target.value)) || max, lo + gap))])} className="input mt-0.5 px-2 py-1 text-xs" />
        </label>
      </div>
    </div>
  );
}

function Section({ title, children, defaultOpen = true, count }: { title: string; children: React.ReactNode; defaultOpen?: boolean; count?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <fieldset className="border-b border-gray-100 pb-3">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between py-1 text-left">
        <legend className="label-xs text-ink">
          {title}
          {count ? <span className="ml-1.5 rounded-full bg-brand-600 px-1.5 text-[10px] text-white">{count}</span> : null}
        </legend>
        <ChevronDown className={cn('h-4 w-4 text-gray-400 transition', open && 'rotate-180')} aria-hidden />
      </button>
      {open && <div className="mt-2">{children}</div>}
    </fieldset>
  );
}

function facetLabel(key: FacetKey, value: string) {
  if (key === 'department') return departmentLabel(value);
  if (key === 'audience') return AUDIENCE_OPTIONS.find((a) => a.id === value)?.label || titleCase(value);
  return value;
}

type Props = {
  /** fixed params of this page (department / brand / collection / onSale / isNew / q / ids) */
  base: SearchParams;
  /** SSR result from catalog.json; the initial state and the offline fallback */
  initial: SearchResponse;
  /** facets to hide (e.g. brand on a brand page) */
  hide?: FacetKey[];
  /** subcategory chips row above the grid */
  showSubChips?: boolean;
  defaultSort?: SortKey;
  emptyText?: string;
  /** search page: fires a `search` rich event with the query and result count */
  searchQuery?: string;
};

function toggle(list: string[] | undefined, v: string) {
  const l = list || [];
  return l.includes(v) ? l.filter((x) => x !== v) : [...l, v];
}

function Listing({ base, initial, hide = [], showSubChips = true, defaultSort, emptyText, searchQuery }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { visitorId } = useSession();
  const filters = useMemo(() => parseFilters(sp), [sp]);
  const hidden = useMemo(() => new Set(hide), [hide]);

  const [res, setRes] = useState<SearchResponse>(initial);
  const [items, setItems] = useState(initial.items);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [offline, setOffline] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [brandQuery, setBrandQuery] = useState('');
  const seq = useRef(0);
  const abort = useRef<AbortController | null>(null);
  /** facet lists captured while that facet had no selection — keeps the other options visible (Flipkart style) */
  const stable = useRef<Facets>({ ...initial.facets });
  const stableRange = useRef(initial.priceRange);

  const sort: SortKey = filters.sort || defaultSort || (base.q ? 'relevance' : 'popular');
  const apiParams = useMemo(() => toSearchParams(base, { ...filters, sort }, 0, PAGE), [base, filters, sort]);
  const apiKey = JSON.stringify(apiParams);

  const setFilters = useCallback(
    (next: ListFilters) => {
      const qs = serializeFilters(next, sp);
      const url = qs.toString() ? `${pathname}?${qs}` : pathname;
      router.replace(url, { scroll: false });
      sendRichEvent({
        visitorId: visitorId || undefined,
        type: 'filter',
        meta: { page: pathname, base, filters: toSearchParams(base, next), sort: next.sort || sort },
      });
    },
    [router, pathname, sp, visitorId, base, sort],
  );

  const patch = (p: Partial<ListFilters>) => setFilters({ ...filters, ...p });
  const patchFacet = (k: FacetKey, v: string) => setFilters({ ...filters, facets: { ...filters.facets, [k]: toggle(filters.facets[k], v) } });
  const clearAll = () => setFilters({ facets: {}, sort: filters.sort });

  // fetch on every filter / sort / base change
  useEffect(() => {
    const my = ++seq.current;
    const params = JSON.parse(apiKey) as SearchParams;
    setLoading(true);
    const t = setTimeout(async () => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        const r = await searchCatalogApi({ ...params, visitorId: visitorId || undefined }, ctrl.signal);
        if (my !== seq.current) return;
        setRes(r);
        setItems(r.items || []);
        setOffline(false);
      } catch (e) {
        if (my !== seq.current || ctrl.signal.aborted) return;
        const r = localSearch(params);
        setRes(r);
        setItems(r.items);
        setOffline(isOffline(e));
      } finally {
        if (my === seq.current) setLoading(false);
      }
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, visitorId]);

  // keep "stable" facet lists for facets without a selection
  useEffect(() => {
    (Object.keys(FACET_URL) as FacetKey[]).forEach((k) => {
      if (!filters.facets[k]?.length && res.facets?.[k]) stable.current[k] = res.facets[k];
    });
    if (filters.minPrice == null && filters.maxPrice == null && res.priceRange && res.priceRange.max > 0) stableRange.current = res.priceRange;
  }, [res, filters]);

  useEffect(() => {
    if (!searchQuery) return;
    sendRichEvent({ visitorId: visitorId || undefined, type: 'search', meta: { q: searchQuery, total: res.total, page: pathname } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, res.total]);

  const loadMore = async () => {
    setMore(true);
    const params = toSearchParams(base, { ...filters, sort }, items.length, PAGE);
    try {
      const r = await searchCatalogApi({ ...params, visitorId: visitorId || undefined });
      setItems((prev) => [...prev, ...r.items.filter((p) => !prev.some((x) => x.id === p.id))]);
    } catch {
      const r = localSearch(params);
      setItems((prev) => [...prev, ...r.items.filter((p) => !prev.some((x) => x.id === p.id))]);
    } finally {
      setMore(false);
    }
  };

  /* ------------------------------- derived data ------------------------------- */
  // bounds come from the API's priceRange (INR), snapped outward to the ₹100 slider step
  const bounds: [number, number] = [
    Math.floor((stableRange.current.min || 0) / PRICE_STEP) * PRICE_STEP,
    Math.ceil((stableRange.current.max || 0) / PRICE_STEP) * PRICE_STEP,
  ];
  const price: [number, number] = [filters.minPrice ?? bounds[0], filters.maxPrice ?? bounds[1]];
  const priceActive = filters.minPrice != null || filters.maxPrice != null;

  const options = (k: FacetKey): FacetValue[] => {
    const active = filters.facets[k] || [];
    const list = (active.length ? stable.current[k] || res.facets?.[k] : res.facets?.[k]) || [];
    const missing = active.filter((v) => !list.some((o) => o.value === v)).map((v) => ({ value: v, count: 0 }));
    return [...list, ...missing];
  };

  const activeChips: { key: string; label: string; remove: () => void }[] = [];
  (Object.keys(FACET_URL) as FacetKey[]).forEach((k) => {
    (filters.facets[k] || []).forEach((v) => activeChips.push({ key: `${k}:${v}`, label: `${FACET_LABEL[k]}: ${facetLabel(k, v)}`, remove: () => patchFacet(k, v) }));
  });
  if (priceActive) activeChips.push({ key: 'price', label: `${formatPrice(price[0])} – ${formatPrice(price[1])}`, remove: () => patch({ minPrice: undefined, maxPrice: undefined }) });
  if (filters.minDiscount) activeChips.push({ key: 'discount', label: `${filters.minDiscount}%+ off`, remove: () => patch({ minDiscount: undefined }) });
  if (filters.minRating) activeChips.push({ key: 'rating', label: `${filters.minRating}★ & above`, remove: () => patch({ minRating: undefined }) });
  if (filters.onSale && !base.onSale) activeChips.push({ key: 'sale', label: 'On sale', remove: () => patch({ onSale: undefined }) });
  if (filters.isNew && !base.isNew) activeChips.push({ key: 'new', label: 'New in', remove: () => patch({ isNew: undefined }) });
  const activeCount = activeChips.length;

  const subOptions = options('subcategory');
  const audienceOptions = options('audience').filter((o) => AUDIENCE_OPTIONS.some((a) => a.id === o.value));

  const filtersPanel = (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-extrabold uppercase tracking-wide">Filters</p>
        {activeCount > 0 && (
          <button type="button" onClick={clearAll} className="text-xs font-bold uppercase text-brand-600">
            Clear all
          </button>
        )}
      </div>

      {FACET_ORDER.filter((k) => !hidden.has(k)).map((k) => {
        const opts = k === 'audience' ? audienceOptions : options(k);
        if (k === 'department' && opts.length < 2) return null;
        if (k === 'audience' && opts.length < 2) return null;
        if (!opts.length) return null;
        const active = filters.facets[k] || [];
        if (k === 'colour') {
          return (
            <Section key={k} title={FACET_LABEL[k]} count={active.length}>
              <div className="max-h-56 overflow-y-auto pr-1">
                {opts.map((o) => (
                  <CheckRow key={o.value} label={o.value} count={o.count} swatch={colourHexFor(o.value, o.hex)} checked={active.includes(o.value)} onChange={() => patchFacet(k, o.value)} />
                ))}
              </div>
            </Section>
          );
        }
        if (k === 'size' || k === 'style') {
          return (
            <Section key={k} title={FACET_LABEL[k]} count={active.length} defaultOpen={k === 'size'}>
              <div className="flex flex-wrap gap-1.5">
                {opts.map((o) => (
                  <Chip key={o.value} on={active.includes(o.value)} onClick={() => patchFacet(k, o.value)}>
                    {o.value}
                  </Chip>
                ))}
              </div>
            </Section>
          );
        }
        if (k === 'brand') {
          const q = brandQuery.trim().toLowerCase();
          const shown = q ? opts.filter((o) => o.value.toLowerCase().includes(q)) : opts;
          return (
            <Section key={k} title={FACET_LABEL[k]} count={active.length}>
              {opts.length > 6 && (
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" aria-hidden />
                  <input value={brandQuery} onChange={(e) => setBrandQuery(e.target.value)} placeholder="Search brand" aria-label="Search brand" className="input py-1.5 pl-7 text-xs" />
                </div>
              )}
              <div className="max-h-56 overflow-y-auto pr-1">
                {shown.map((o) => (
                  <CheckRow key={o.value} label={o.value} count={o.count} checked={active.includes(o.value)} onChange={() => patchFacet(k, o.value)} />
                ))}
                {!shown.length && <p className="py-2 text-xs text-gray-400">No brand matches.</p>}
              </div>
            </Section>
          );
        }
        return (
          <Section key={k} title={FACET_LABEL[k]} count={active.length} defaultOpen={k !== 'material' && k !== 'pattern'}>
            <div className="max-h-56 overflow-y-auto pr-1">
              {opts.map((o) => (
                <CheckRow key={o.value} label={facetLabel(k, o.value)} count={o.count} checked={active.includes(o.value)} onChange={() => patchFacet(k, o.value)} />
              ))}
            </div>
          </Section>
        );
      })}

      {bounds[1] > bounds[0] && (
        <Section title="Price" count={priceActive ? 1 : 0}>
          <PriceRange
            min={bounds[0]}
            max={bounds[1]}
            value={price}
            onChange={(v) => patch({ minPrice: v[0] > bounds[0] ? v[0] : undefined, maxPrice: v[1] < bounds[1] ? v[1] : undefined })}
          />
        </Section>
      )}

      <Section title="Offers" count={(filters.minDiscount ? 1 : 0) + (filters.onSale && !base.onSale ? 1 : 0) + (filters.isNew && !base.isNew ? 1 : 0)}>
        {!base.onSale && (
          <label className="flex cursor-pointer items-center justify-between py-1 text-sm text-gray-700">
            <span>On sale</span>
            <span className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition', filters.onSale ? 'bg-brand-600' : 'bg-gray-300')}>
              <input type="checkbox" role="switch" aria-checked={!!filters.onSale} checked={!!filters.onSale} onChange={() => patch({ onSale: filters.onSale ? undefined : true })} className="peer sr-only" />
              <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition', filters.onSale ? 'translate-x-[18px]' : 'translate-x-0.5')} />
            </span>
          </label>
        )}
        {!base.isNew && (
          <label className="flex cursor-pointer items-center justify-between py-1 text-sm text-gray-700">
            <span>New in</span>
            <span className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition', filters.isNew ? 'bg-brand-600' : 'bg-gray-300')}>
              <input type="checkbox" role="switch" aria-checked={!!filters.isNew} checked={!!filters.isNew} onChange={() => patch({ isNew: filters.isNew ? undefined : true })} className="peer sr-only" />
              <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition', filters.isNew ? 'translate-x-[18px]' : 'translate-x-0.5')} />
            </span>
          </label>
        )}
        <div className="mt-1" role="radiogroup" aria-label="Discount">
          {DISCOUNTS.map((d) => (
            <label key={d.id} className="flex cursor-pointer items-center gap-2.5 py-1 text-sm text-gray-700 hover:text-ink">
              <input type="radio" name="discount" checked={filters.minDiscount === d.id} onChange={() => patch({ minDiscount: d.id })} onClick={() => filters.minDiscount === d.id && patch({ minDiscount: undefined })} className="h-4 w-4 accent-brand-600" />
              <span className="flex-1">{d.label}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="Customer rating" count={filters.minRating ? 1 : 0}>
        <div role="radiogroup" aria-label="Rating">
          {RATINGS.map((r) => (
            <label key={r.id} className="flex cursor-pointer items-center gap-2.5 py-1 text-sm text-gray-700 hover:text-ink">
              <input type="radio" name="rating" checked={filters.minRating === r.id} onChange={() => patch({ minRating: r.id })} onClick={() => filters.minRating === r.id && patch({ minRating: undefined })} className="h-4 w-4 accent-brand-600" />
              <span className="flex flex-1 items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden /> {r.label}
              </span>
            </label>
          ))}
        </div>
      </Section>
    </div>
  );

  const total = res.total ?? items.length;

  return (
    <div>
      {/* subcategory chips */}
      {showSubChips && !hidden.has('subcategory') && subOptions.length > 1 && (
        <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
          {subOptions.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={(filters.facets.subcategory || []).includes(s.value)}
              onClick={() => patchFacet('subcategory', s.value)}
              className={cn(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition',
                (filters.facets.subcategory || []).includes(s.value) ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400',
              )}
            >
              {s.value} <span className="text-[10px] text-gray-400">{s.count}</span>
            </button>
          ))}
        </div>
      )}

      {!hidden.has('audience') && audienceOptions.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Shopping for</span>
          {AUDIENCE_OPTIONS.filter((a) => audienceOptions.some((o) => o.value === a.id)).map((a) => (
            <Chip key={a.id} on={(filters.facets.audience || []).includes(a.id)} onClick={() => patchFacet('audience', a.id)}>
              {a.label}
            </Chip>
          ))}
        </div>
      )}

      {/* applied filter chips */}
      {activeCount > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5" aria-label="Applied filters">
          {activeChips.map((c) => (
            <button key={c.key} type="button" onClick={c.remove} className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100" aria-label={`Remove filter ${c.label}`}>
              {c.label} <X className="h-3 w-3" aria-hidden />
            </button>
          ))}
          <button type="button" onClick={clearAll} className="text-xs font-bold uppercase text-gray-500 hover:text-ink">
            Clear all
          </button>
        </div>
      )}

      <div className="flex gap-8">
        <aside className="hidden w-60 shrink-0 border-r border-gray-100 pr-6 lg:block" aria-label="Filters">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-6 pr-1">{filtersPanel}</div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
            <button type="button" onClick={() => setSheet(true)} className="btn-outline px-3 py-2 lg:hidden">
              <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filters{activeCount > 0 && ` (${activeCount})`}
            </button>
            <p className="hidden items-center gap-2 text-sm text-gray-500 lg:flex" aria-live="polite">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Loading" /> : null}
              <b className="text-ink">{total}</b> {total === 1 ? 'item' : 'items'}
              {activeCount > 0 && ` · ${activeCount} ${activeCount === 1 ? 'filter' : 'filters'}`}
              {offline && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                  <WifiOff className="h-3 w-3" aria-hidden /> offline catalog
                </span>
              )}
            </p>
            <label className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden text-gray-500 sm:inline">Sort by:</span>
              <select value={sort} onChange={(e) => patch({ sort: e.target.value as SortKey })} className="min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold focus:border-brand-500 focus:outline-none" aria-label="Sort products">
                {SORT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mb-3 flex items-center gap-2 text-sm text-gray-500 lg:hidden">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Loading" /> : null}
            <b className="text-ink">{total}</b> items
            {offline && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                <WifiOff className="h-3 w-3" aria-hidden /> offline
              </span>
            )}
          </p>

          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 py-20 text-center">
              <p className="font-semibold text-ink">{loading ? 'Searching…' : emptyText || 'No products match these filters.'}</p>
              {activeCount > 0 && !loading && (
                <button type="button" onClick={clearAll} className="btn-outline mt-4">
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div className={cn('grid grid-cols-2 gap-x-3 gap-y-6 transition-opacity sm:grid-cols-3 md:gap-x-5 xl:grid-cols-4', loading && 'opacity-60')}>
                {items.map((p, i) => (
                  <ProductCard key={p.id} product={p} priority={i < 4} />
                ))}
              </div>
              {items.length < total && (
                <div className="mt-8 flex flex-col items-center gap-2">
                  <p className="text-xs text-gray-500">
                    Showing {items.length} of {total}
                  </p>
                  <button type="button" onClick={loadMore} disabled={more} className="btn-outline px-8">
                    {more && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Load more
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {sheet && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <button className="absolute inset-0 bg-black/40" aria-label="Close filters" onClick={() => setSheet(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl bg-white animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="font-bold">Filter products</p>
              <button type="button" onClick={() => setSheet(false)} aria-label="Close filters" className="rounded-md p-2">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">{filtersPanel}</div>
            <div className="border-t p-3">
              <button type="button" onClick={() => setSheet(false)} className="btn-primary w-full">
                <Check className="h-4 w-4" aria-hidden /> Show {total} items
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Listing with server-side filters. Wrapped in Suspense because useSearchParams() needs it during static rendering. */
export default function ShopListing(props: Props) {
  return (
    <Suspense fallback={<div className="skeleton h-96" />}>
      <Listing {...props} />
    </Suspense>
  );
}
