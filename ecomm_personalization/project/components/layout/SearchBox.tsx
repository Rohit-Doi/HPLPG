'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Tag, Layers, ShoppingBag } from 'lucide-react';
import { fetchSuggest } from '@/lib/api';
import { CATALOG, DEPARTMENTS, countBy, departmentLabel, fixImagePath, searchCatalog } from '@/lib/catalog';
import { STOREFRONT, brandIdFor } from '@/lib/storefront';
import type { SuggestResponse } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/contexts/CurrencyContext';

type Suggestion =
  | { kind: 'product'; id: string; label: string; sub: string; href: string; image: string; price: number }
  | { kind: 'brand'; id: string; label: string; sub: string; href: string; image?: string }
  | { kind: 'category'; id: string; label: string; sub: string; href: string; image?: string };

const ALL_SUBS = countBy(CATALOG, (p) => `${p.department}|${p.subcategory}`).map((s) => {
  const [dep, sub] = s.name.split('|');
  return { dep, sub, count: s.count, depLabel: DEPARTMENTS.find((d) => d.id === dep)?.label || dep };
});

/** Local suggestions from catalog.json (used until the API answers, and when it is down). */
function suggestLocal(q: string): Suggestion[] {
  const t = q.trim().toLowerCase();
  if (t.length < 2) return [];
  const brands: Suggestion[] = STOREFRONT.brands
    .filter((b) => b.name.toLowerCase().includes(t))
    .slice(0, 3)
    .map((b) => ({ kind: 'brand', id: b.id, label: b.name, sub: `${b.items} styles${b.maxDiscount ? ` · up to ${b.maxDiscount}% off` : ''}`, href: `/brands/${b.id}`, image: b.image }));
  const cats: Suggestion[] = ALL_SUBS.filter((s) => s.sub.toLowerCase().includes(t) || s.depLabel.toLowerCase() === t)
    .slice(0, 4)
    .map((s) => ({ kind: 'category', id: `${s.dep}-${s.sub}`, label: s.sub, sub: `${s.depLabel} · ${s.count}`, href: `/shop/${s.dep}?sub=${encodeURIComponent(s.sub)}` }));
  const products: Suggestion[] = searchCatalog(t)
    .slice(0, 5)
    .map((p) => ({ kind: 'product', id: p.id, label: p.name, sub: p.brand, href: `/product/${p.id}`, image: p.image, price: p.price }));
  return [...cats, ...brands, ...products];
}

/** GET /catalog/suggest -> suggestion rows. */
function fromApi(r: SuggestResponse): Suggestion[] {
  const cats: Suggestion[] = (r.categories || []).slice(0, 4).map((c) => ({
    kind: 'category',
    id: `${c.department}-${c.subcategory}`,
    label: c.subcategory,
    sub: departmentLabel(c.department),
    href: c.href || `/shop/${c.department}?sub=${encodeURIComponent(c.subcategory)}`,
  }));
  const brands: Suggestion[] = (r.brands || []).slice(0, 3).map((name) => {
    const b = STOREFRONT.brands.find((x) => x.name === name);
    return { kind: 'brand', id: brandIdFor(name), label: name, sub: b ? `${b.items} styles${b.maxDiscount ? ` · up to ${b.maxDiscount}% off` : ''}` : 'Brand', href: `/brands/${brandIdFor(name)}`, image: b?.image };
  });
  const products: Suggestion[] = (r.products || []).slice(0, 5).map((p) => ({ kind: 'product', id: p.id, label: p.name, sub: p.brand, href: `/product/${p.id}`, image: fixImagePath(p.image), price: p.price }));
  return [...cats, ...brands, ...products];
}

type Props = { className?: string; autoFocus?: boolean; onDone?: () => void; inputClassName?: string };

/** Search input with live suggestions from /catalog/suggest (debounced; local fallback); ArrowUp/Down + Enter + Escape. */
export default function SearchBox({ className, autoFocus, onDone, inputClassName }: Props) {
  const { formatPrice } = useCurrency();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [remote, setRemote] = useState<{ q: string; list: Suggestion[] } | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  const abort = useRef<AbortController | null>(null);
  const local = useMemo(() => suggestLocal(q), [q]);
  const list = remote && remote.q === q.trim() ? remote.list : local;
  const listId = 'search-suggestions';

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => setActive(-1), [q]);

  // debounced API suggestions
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setRemote(null);
      return;
    }
    const timer = setTimeout(async () => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        const r = await fetchSuggest(t, ctrl.signal);
        if (ctrl.signal.aborted) return;
        const rows = fromApi(r);
        setRemote({ q: t, list: rows.length ? rows : suggestLocal(t) });
      } catch {
        /* keep local suggestions */
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [q]);

  const go = (href: string) => {
    router.push(href);
    setOpen(false);
    setQ('');
    onDone?.();
  };

  const submit = () => {
    if (active >= 0 && list[active]) return go(list[active].href);
    if (!q.trim()) return;
    go(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const showList = open && list.length > 0;

  return (
    <form
      ref={ref}
      role="search"
      className={cn('relative min-w-0', className)}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!showList && e.key !== 'Escape') return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => (a + 1) % list.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => (a - 1 + list.length) % list.length);
          } else if (e.key === 'Escape') {
            setOpen(false);
            setActive(-1);
          }
        }}
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        aria-label="Search products, brands and categories"
        placeholder="Search for products, brands and more"
        autoComplete="off"
        className={cn(
          'h-10 w-full min-w-0 rounded-md border border-transparent bg-gray-100 pl-9 pr-3 text-sm placeholder:text-gray-500 focus:border-gray-300 focus:bg-white focus:outline-none',
          inputClassName,
        )}
      />
      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-xl border border-gray-100 bg-white p-1.5 shadow-lift">
          {list.map((s, i) => {
            const Icon = s.kind === 'brand' ? Tag : s.kind === 'category' ? Layers : ShoppingBag;
            return (
              <li key={s.kind + s.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                <Link
                  href={s.href}
                  onClick={(e) => {
                    e.preventDefault();
                    go(s.href);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn('flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm', i === active ? 'bg-gray-100' : 'hover:bg-gray-50')}
                >
                  {s.kind !== 'category' && s.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.image} alt="" className="h-9 w-7 shrink-0 rounded object-cover ring-1 ring-black/5" />
                  ) : (
                    <span className="flex h-9 w-7 shrink-0 items-center justify-center rounded bg-gray-100 text-gray-500">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{s.label}</span>
                    <span className="block truncate text-xs text-gray-500">{s.sub}</span>
                  </span>
                  {s.kind === 'product' && <span className="shrink-0 text-xs font-bold text-ink">{formatPrice(s.price)}</span>}
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{s.kind}</span>
                </Link>
              </li>
            );
          })}
          <li className="border-t border-gray-100 px-2 pb-1 pt-2 text-xs text-gray-500">
            Press <kbd className="rounded border px-1">Enter</kbd> to search “{q.trim()}”
          </li>
        </ul>
      )}
    </form>
  );
}
