'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Eye, Heart, Minus, PackageX, Plus, RefreshCw, ShieldCheck, ShoppingBag, Sparkles, Tag, TrendingUp, Truck, Users, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useSession } from '@/contexts/SessionContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { fetchProductDetail, fetchSimilar, fetchStock, sendRichEvent } from '@/lib/api';
import { fixImagePath, getProduct, relatedFromCatalog, showAudienceBadge, sizesFor } from '@/lib/catalog';
import { BANK_OFFER, COD_FEE, FREE_SHIPPING_OVER, SHIPPING, brandIdFor, couponsForProduct } from '@/lib/storefront';
import type { Product, ProductDetailResponse, SimilarResponse, StockInfo } from '@/lib/types';
import { cn, compactNumber, pct } from '@/lib/utils';
import { CodeChip } from '@/components/modules/StoreModules';
import { Badges, PriceRow } from './ProductCard';
import DeliveryEstimateBlock from './DeliveryEstimate';
import ProductRail from './ProductRail';
import Reviews from './Reviews';

function Rail({ title, subtitle, products, showWhy }: { title: string; subtitle?: string; products: Product[]; showWhy?: boolean }) {
  if (!products?.length) return null;
  return (
    <section className="mt-12">
      <div className="mb-4">
        <h2 className="text-lg font-extrabold uppercase tracking-wide text-ink">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
      <ProductRail products={products} showWhy={showWhy} />
    </section>
  );
}

/** Image with hover zoom (desktop) — the zoom origin follows the cursor. */
function ZoomImage({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState('50% 50%');
  const [zoom, setZoom] = useState(false);
  return (
    <div
      ref={ref}
      className="relative aspect-[3/4] cursor-zoom-in overflow-hidden"
      onMouseEnter={() => setZoom(true)}
      onMouseLeave={() => setZoom(false)}
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-full w-full object-cover transition-transform duration-200" style={{ transformOrigin: origin, transform: zoom ? 'scale(1.8)' : 'scale(1)' }} />
    </div>
  );
}

/** Colour swatches linking to the sibling products (other colours of the same model). */
function ColourOptions({ p }: { p: Product }) {
  const { formatPrice } = useCurrency();
  const opts = p.colourOptions || [];
  if (!opts.length && !p.colour) return null;
  const all = [{ id: p.id, colour: p.colour || 'Default', hex: p.colourHex ?? null }, ...opts.filter((o) => o.id !== p.id)];
  return (
    <div className="mt-5">
      <p className="text-sm font-bold uppercase tracking-wide">
        Colour: <span className="font-semibold normal-case text-gray-600">{p.colour || '—'}</span>
        {opts.length > 0 && <span className="ml-1 text-xs font-normal normal-case text-gray-400">({all.length} options)</span>}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {all.map((o) => {
          const current = o.id === p.id;
          const sib = !current ? getProduct(o.id) : null;
          const body = (
            <>
              <span
                aria-hidden
                className="h-7 w-7 rounded-full ring-1 ring-black/10"
                style={o.hex ? { background: o.hex } : { background: 'conic-gradient(#f43f5e, #f59e0b, #10b981, #3b82f6, #a855f7, #f43f5e)' }}
              />
              <span className="text-xs font-semibold">{o.colour}</span>
              {current && <Check className="h-3.5 w-3.5 text-brand-600" aria-hidden />}
            </>
          );
          const cls = cn('inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 transition', current ? 'border-ink bg-gray-50' : 'border-gray-200 hover:border-ink');
          return current ? (
            <span key={o.id} className={cls} aria-current="true">
              {body}
            </span>
          ) : (
            <Link key={o.id} href={`/product/${o.id}`} className={cls} title={sib ? `${sib.name} · ${formatPrice(sib.price)}` : o.colour}>
              {body}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const TABS = ['Details', 'Delivery & returns'] as const;

export default function ProductDetail({ product: initial }: { product: Product }) {
  const cart = useCart();
  const wish = useWishlist();
  const auth = useAuth();
  const { formatPrice } = useCurrency();
  const { recordView, recordCart, ready, visitorId } = useSession();
  const [p, setP] = useState<Product>(initial);
  const sizes = sizesFor(p);
  const needsSize = sizes.length > 0;
  const oneSize = !needsSize && Array.isArray(p.sizes) && p.sizes.length > 0;
  const preferred = auth.user?.profile?.sizes?.[p.department === 'footwear' ? 'shoe' : 'top'];
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [sizeError, setSizeError] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Details');
  const [recs, setRecs] = useState<ProductDetailResponse | null>(null);
  const [recsState, setRecsState] = useState<'loading' | 'ok' | 'offline'>('loading');
  const [similar, setSimilar] = useState<SimilarResponse | null>(null);
  /** v5 inventory (GET /products/{id}/stock) — null while loading or when the API is down */
  const [stock, setStock] = useState<StockInfo | null>(null);
  const wished = wish.has(p.id);
  const coupons = couponsForProduct(p);

  // per-size stock helpers (undefined = unknown, e.g. API offline)
  const qtyFor = (s: string | null): number | undefined => {
    if (!stock) return undefined;
    if (s) return stock.sizes[s] ?? (stock.soldOutSizes.includes(s) ? 0 : undefined);
    return stock.total;
  };
  const soldOutSize = (s: string | null) => qtyFor(s) === 0;
  const productSoldOut = stock?.status === 'sold_out';
  const selectedQty = needsSize ? qtyFor(size) : qtyFor(null);
  const cannotAdd = productSoldOut || (needsSize && !!size && soldOutSize(size)) || (!needsSize && selectedQty === 0);
  const maxQty = selectedQty != null && selectedQty > 0 ? Math.min(10, selectedQty) : 10;

  useEffect(() => {
    setP(initial);
    setSize(null);
    setQty(1);
  }, [initial]);

  useEffect(() => {
    if (preferred && sizes.includes(preferred) && !size && !soldOutSize(preferred)) setSize(preferred);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferred, p.id, stock]);

  // live inventory — fetched only here (never on listings) to avoid N requests
  useEffect(() => {
    let alive = true;
    setStock(null);
    fetchStock(initial.id)
      .then((s) => alive && s?.sizes && setStock(s))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [initial.id]);

  // clamp the quantity when the chosen size has fewer units than requested
  useEffect(() => {
    if (qty > maxQty) setQty(Math.max(1, maxQty));
  }, [maxQty, qty]);

  useEffect(() => {
    if (!ready) return;
    recordView(p.id);
    sendRichEvent({ visitorId: visitorId || undefined, type: 'view_item', itemId: p.id, meta: { department: p.department, subcategory: p.subcategory, brand: p.brand } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, p.id]);

  // fresh product data + graph recommendations from the API
  useEffect(() => {
    let alive = true;
    setRecsState('loading');
    fetchProductDetail(initial.id)
      .then((r) => {
        if (!alive) return;
        if (r.product?.id) setP({ ...r.product, image: fixImagePath(r.product.image) });
        setRecs(r);
        setRecsState('ok');
      })
      .catch(() => alive && setRecsState('offline'));
    return () => {
      alive = false;
    };
  }, [initial.id]);

  // personalised "similar" rail
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setSimilar(null);
    fetchSimilar(initial.id, visitorId || undefined, 12)
      .then((r) => alive && setSimilar(r))
      .catch(() => alive && setSimilar({ items: [], personalised: false }));
    return () => {
      alive = false;
    };
  }, [initial.id, ready, visitorId]);

  const addToBag = () => {
    if (needsSize && !size) {
      setSizeError(true);
      toast.error('Please select a size');
      return;
    }
    if (cannotAdd) {
      toast.error(productSoldOut ? 'This item is sold out' : `Size ${size} is sold out`);
      return;
    }
    cart.add(p.id, needsSize ? size : null, qty);
    recordCart(p.id);
    sendRichEvent({ visitorId: visitorId || undefined, type: 'add_to_cart', itemId: p.id, meta: { size: needsSize ? size : null, qty, price: p.price } });
    toast.success(`Added ${qty > 1 ? `${qty} × ` : ''}to bag`, { action: { label: 'View bag', onClick: () => (window.location.href = '/cart') } });
  };

  const fallback = relatedFromCatalog(p, 12);
  const brandId = brandIdFor(p.brand);
  const attrs = [
    p.material ? { k: 'Material', v: p.material } : null,
    p.pattern ? { k: 'Pattern', v: p.pattern } : null,
    ...(p.styles || []).map((s) => ({ k: 'Style', v: s })),
  ].filter((x): x is { k: string; v: string } => !!x);

  return (
    <div className="container py-6">
      <nav aria-label="Breadcrumb" className="mb-4 truncate text-xs text-gray-500">
        <Link href="/" className="hover:text-ink">
          Home
        </Link>{' '}
        /{' '}
        <Link href={`/shop/${p.department}`} className="hover:text-ink">
          {p.departmentLabel}
        </Link>{' '}
        /{' '}
        <Link href={`/shop/${p.department}?sub=${encodeURIComponent(p.subcategory)}`} className="hover:text-ink">
          {p.subcategory}
        </Link>{' '}
        /{' '}
        <Link href={`/brands/${brandId}`} className="hover:text-ink">
          {p.brand}
        </Link>{' '}
        / <span className="font-semibold text-ink">{p.name}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-2 lg:gap-14">
        <div className="relative overflow-hidden rounded-2xl bg-gray-50">
          <ZoomImage src={p.image} alt={p.name} />
          <Badges p={p} stock={stock?.status} className="absolute left-3 top-3" />
          <p className="pointer-events-none absolute bottom-3 right-3 hidden rounded bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-gray-600 md:block">Hover to zoom</p>
        </div>

        <div className="md:py-2">
          <Link href={`/brands/${brandId}`} className="text-2xl font-extrabold text-ink hover:underline md:text-3xl">
            {p.brand}
          </Link>
          <h1 className="mt-1 text-lg text-gray-600">{p.name}</h1>
          {p.detail && <p className="mt-2 text-sm text-gray-600">{p.detail}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            {showAudienceBadge(p) && (
              <span className="rounded-sm bg-ink px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">{p.audience === 'women' ? 'Women' : 'Men'}</span>
            )}
            {p.catalogOnly && (
              <span className="rounded-sm bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700" title="Brand-new item — no behavioural data yet">
                New · catalog only
              </span>
            )}
            {(p.variants ?? 0) > 1 && <span className="font-medium">{p.variants} colour / size variants sold</span>}
            {productSoldOut && (
              <span className="inline-flex items-center gap-1 rounded-sm bg-gray-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white" data-testid="stock-badge">
                <PackageX className="h-3 w-3" aria-hidden /> Sold out
              </span>
            )}
            {stock?.status === 'low' && (
              <span className="inline-flex items-center gap-1 rounded-sm bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-800" data-testid="stock-badge">
                <AlertTriangle className="h-3 w-3" aria-hidden /> Low stock · {stock.total} left
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="chip">
              <TrendingUp className="h-3.5 w-3.5 text-brand-600" aria-hidden /> {compactNumber(p.stats.orders)} bought
            </span>
            <span className="chip">
              <Eye className="h-3.5 w-3.5 text-brand-600" aria-hidden /> {compactNumber(p.stats.views)} views
            </span>
            <span className="chip">
              <ShoppingBag className="h-3.5 w-3.5 text-brand-600" aria-hidden /> {pct(p.stats.cartRate, 0)} add-to-bag rate
            </span>
          </div>

          <hr className="my-5 border-gray-100" />
          <PriceRow p={p} size="lg" />
          <p className="mt-1 text-xs font-semibold text-emerald-600">inclusive of all taxes</p>

          {p.description && <p className="mt-4 text-sm leading-relaxed text-gray-700">{p.description}</p>}

          {attrs.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Attributes">
              {attrs.map((a, i) => (
                <Link
                  key={`${a.k}-${a.v}-${i}`}
                  href={`/shop/${p.department}?${a.k === 'Style' ? 'style' : a.k.toLowerCase()}=${encodeURIComponent(a.v)}`}
                  className="chip hover:border-ink"
                  title={`Shop ${p.departmentLabel} · ${a.k}: ${a.v}`}
                >
                  <span className="text-gray-400">{a.k}</span> {a.v}
                </Link>
              ))}
            </div>
          )}

          <ColourOptions p={p} />

          {needsSize && (
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold uppercase tracking-wide">Select size{p.department === 'footwear' ? ' (EU)' : ''}</p>
                {sizeError ? <p className="text-xs font-semibold text-brand-600">Please select a size</p> : preferred && sizes.includes(preferred) ? <p className="text-xs text-gray-400">Your size: {preferred}</p> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Size">
                {sizes.map((s) => {
                  const q = qtyFor(s);
                  const out = q === 0;
                  const low = q != null && q > 0 && q <= 3;
                  return (
                    <div key={s} className="flex flex-col items-center gap-1">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={size === s}
                        aria-disabled={out}
                        disabled={out}
                        title={out ? `Size ${s} is sold out` : low ? `Only ${q} left in ${s}` : undefined}
                        onClick={() => {
                          setSize(s);
                          setSizeError(false);
                        }}
                        className={cn(
                          'relative flex h-11 min-w-11 items-center justify-center rounded-full border px-2 text-sm font-bold transition',
                          size === s ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-gray-300 hover:border-ink',
                          sizeError && !size && 'border-brand-300',
                          out && 'cursor-not-allowed border-dashed border-gray-200 bg-gray-50 text-gray-300 line-through hover:border-gray-200',
                        )}
                      >
                        {s}
                      </button>
                      {out ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Sold out</span>
                      ) : low ? (
                        <span className="text-[10px] font-semibold text-orange-700">Only {q} left</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {stock && stock.soldOutSizes.length > 0 && stock.soldOutSizes.length < sizes.length && (
                <p className="mt-2 text-xs text-gray-500">
                  {stock.soldOutSizes.join(', ')} {stock.soldOutSizes.length === 1 ? 'is' : 'are'} currently sold out — add to your wishlist to keep an eye on it.
                </p>
              )}
            </div>
          )}
          {oneSize && (
            <p className="mt-5 text-sm text-gray-600">
              One size
              {stock && stock.total > 0 && stock.total <= 3 && <span className="ml-2 text-xs font-semibold text-orange-700">Only {stock.total} left</span>}
              {stock?.status === 'sold_out' && <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Sold out</span>}
            </p>
          )}

          <div className="mt-6 flex items-center gap-3">
            <span className="text-sm font-bold uppercase tracking-wide">Qty</span>
            <div className="flex items-center rounded-full border border-gray-300">
              <button type="button" className="p-2.5 hover:bg-gray-50 disabled:opacity-40" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))}>
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-8 text-center text-sm font-bold" aria-live="polite">
                {qty}
              </span>
              <button type="button" className="p-2.5 hover:bg-gray-50 disabled:opacity-40" aria-label="Increase quantity" disabled={qty >= maxQty} onClick={() => setQty((q) => Math.min(maxQty, q + 1))}>
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {selectedQty != null && selectedQty > 0 && selectedQty < 10 && <span className="text-xs text-gray-500">{selectedQty} available</span>}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={addToBag} disabled={cannotAdd} aria-disabled={cannotAdd} className="btn-primary h-12 flex-1 text-base">
              {cannotAdd ? <PackageX className="h-5 w-5" aria-hidden /> : <ShoppingBag className="h-5 w-5" aria-hidden />}
              {productSoldOut ? 'Sold out' : cannotAdd ? `Size ${size} sold out` : 'Add to bag'}
            </button>
            <button
              type="button"
              onClick={() => {
                const on = wish.toggle(p.id, needsSize ? size : null);
                toast.success(on ? 'Added to wishlist' : 'Removed from wishlist');
              }}
              aria-pressed={wished}
              className="btn-outline h-12 flex-1 text-base"
            >
              <Heart className={cn('h-5 w-5', wished && 'fill-brand-600 text-brand-600')} aria-hidden /> {wished ? 'Wishlisted' : 'Wishlist'}
            </button>
          </div>

          <DeliveryEstimateBlock price={p.price} className="mt-6" />

          <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl bg-gray-50 p-4 text-sm text-gray-700 sm:grid-cols-3">
            <p className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-brand-600" aria-hidden /> Free delivery over {formatPrice(FREE_SHIPPING_OVER)}
            </p>
            <p className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-brand-600" aria-hidden /> 30-day returns
            </p>
            <p className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-brand-600" aria-hidden /> Express {SHIPPING.express.label.replace('Express ', '')} · {formatPrice(SHIPPING.express.price)}
            </p>
          </div>

          <div className="mt-4 rounded-xl border border-gray-100 p-4">
            <p className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-ink">
              <Tag className="h-4 w-4 text-brand-600" aria-hidden /> Best offers
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
              {coupons.map((c) => (
                <li key={c.code} className="flex flex-wrap items-center gap-2">
                  <CodeChip code={c.code} /> <span>{c.label}</span>
                </li>
              ))}
              <li className="flex items-center gap-2 text-gray-600">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> {BANK_OFFER.label}
              </li>
            </ul>
          </div>

          <div className="mt-6 flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-xs text-brand-800">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              Viewing this item teaches the landing page agent about your taste.{' '}
              <Link href="/" className="font-bold underline">
                Go home
              </Link>{' '}
              to see the page adapt ({auth.signedIn ? 'Level 4: returning customer' : 'cold-start level 3: in-session'}).
            </p>
          </div>
        </div>
      </div>

      {/* tabs */}
      <section className="mt-10">
        <div className="flex gap-1 border-b border-gray-100" role="tablist">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn('border-b-2 px-3 py-2.5 text-sm font-semibold transition', tab === t ? 'border-brand-600 text-ink' : 'border-transparent text-gray-500 hover:text-ink')}
            >
              {t}
            </button>
          ))}
          <a href="#reviews" className="border-b-2 border-transparent px-3 py-2.5 text-sm font-semibold text-gray-500 hover:text-ink">
            Reviews
          </a>
        </div>
        <div role="tabpanel" className="py-5 text-sm text-gray-700">
          {tab === 'Details' && (
            <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {[
                ['Brand', p.brand],
                ['Department', p.departmentLabel],
                ['Category', p.subcategory],
                ['Audience', p.audience === 'unisex' ? 'Unisex' : p.audience === 'women' ? 'Women' : 'Men'],
                ['Colour', p.colour || '—'],
                ['Material', p.material || '—'],
                ['Pattern', p.pattern || '—'],
                ['Styles', (p.styles || []).join(', ') || '—'],
                ['Sizes', (p.sizes || []).join(', ') || '—'],
                ['Variants sold', String(p.variants ?? 1)],
                ['Item id', p.id],
                ['Source category', p.sourceCategory],
                ['Female viewer share', pct(p.femaleShare, 0)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-gray-50 py-1.5">
                  <dt className="text-gray-500">{k}</dt>
                  <dd className="text-right font-semibold text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {tab === 'Delivery & returns' && (
            <ul className="space-y-2">
              <li>
                <b className="text-ink">Standard delivery</b> — {SHIPPING.standard.label}, {formatPrice(SHIPPING.standard.price)}; free on orders over {formatPrice(FREE_SHIPPING_OVER)} (or with code FREESHIP).
              </li>
              <li>
                <b className="text-ink">Express delivery</b> — {SHIPPING.express.label}, {formatPrice(SHIPPING.express.price)}.
              </li>
              <li>
                <b className="text-ink">Cash on delivery</b> — available on most Indian PIN codes, {formatPrice(COD_FEE)} handling fee.
              </li>
              <li>
                <b className="text-ink">Returns</b> — 30 days, free pick-up, refunded to the original payment method or as points.
              </li>
              <li>
                <b className="text-ink">Cash on delivery</b> — available with a {formatPrice(2.99)} handling fee.
              </li>
            </ul>
          )}
        </div>
      </section>

      <Reviews product={p} />

      {/* personalised similar rail */}
      {similar === null ? (
        <div className="mt-12">
          <div className="skeleton mb-4 h-6 w-72" />
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton aspect-[3/4] w-[44%] shrink-0 rounded-lg sm:w-[30%] md:w-[23%] lg:w-[18.5%]" />
            ))}
          </div>
        </div>
      ) : (
        similar.items.length > 0 && (
          <Rail
            title="Similar products we think you'll like"
            subtitle={similar.personalised ? 'Item graph + content similarity + what you have liked so far' : 'Item graph + content similarity'}
            products={similar.items.map((x) => ({ ...x, image: fixImagePath(x.image) }))}
            showWhy
          />
        )
      )}

      {recsState === 'loading' && (
        <div className="mt-12">
          <div className="skeleton mb-4 h-6 w-64" />
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton aspect-[3/4] w-[44%] shrink-0 rounded-lg sm:w-[30%] md:w-[23%] lg:w-[18.5%]" />
            ))}
          </div>
        </div>
      )}
      {recsState === 'ok' && recs && (
        <>
          <Rail title="Frequently bought together" subtitle="Items often purchased in the same order" products={recs.boughtTogether} />
          <Rail title="Customers also viewed" subtitle="From the co-view graph of past sessions" products={recs.alsoViewed} />
          <Rail title="Shoppers viewed next" subtitle="What visitors opened right after this item" products={recs.viewedNext || []} />
          {!similar?.items.length && <Rail title="Similar products" products={recs.similar} />}
          {!recs.boughtTogether?.length && !recs.alsoViewed?.length && !recs.viewedNext?.length && !recs.similar?.length && !similar?.items.length && <Rail title={`More from ${p.subcategory}`} products={fallback} />}
        </>
      )}
      {recsState === 'offline' && (
        <>
          <Rail title={`More from ${p.subcategory}`} subtitle={`Popular ${p.departmentLabel.toLowerCase()} picks`} products={fallback} />
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-400">
            <Users className="h-3 w-3" aria-hidden /> Co-view recommendations are unavailable while the agent API is offline.
          </p>
        </>
      )}
    </div>
  );
}
