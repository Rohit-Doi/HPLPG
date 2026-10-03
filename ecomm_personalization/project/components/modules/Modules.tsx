'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Check, Clock, Copy, Mail, Plus, RefreshCw, ShieldCheck, Sparkles, Tag, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { useCart } from '@/contexts/CartContext';
import { useSession } from '@/contexts/SessionContext';
import type {
  AnnouncementModule,
  BundleModule,
  CategoryTilesModule,
  CtaBannerModule,
  HeroModule,
  ProductCarouselModule,
  TrustBarModule,
} from '@/lib/types';
import { defaultSize } from '@/lib/catalog';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/contexts/CurrencyContext';
import ProductRail from '@/components/product/ProductRail';
import { PriceRow } from '@/components/product/ProductCard';
import { rc, useModuleEnv } from './ModuleEnv';
import { SectionHeader, safeAccent, withAlpha } from './shared';

/* ---------------------------------- announcement --------------------------------- */

export function Announcement({ m }: { m: AnnouncementModule }) {
  const tone = {
    info: 'bg-ink text-white',
    promo: 'bg-brand-600 text-white',
    urgency: 'bg-amber-400 text-ink',
  }[m.tone] || 'bg-ink text-white';
  const Icon = m.tone === 'urgency' ? Clock : m.tone === 'promo' ? Tag : Sparkles;
  return (
    <div className={cn('flex items-center justify-center gap-2 px-4 py-2 text-center text-xs font-semibold tracking-wide sm:text-sm', tone)}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span>{m.text}</span>
    </div>
  );
}

/* -------------------------------------- hero -------------------------------------- */

export function Hero({ m }: { m: HeroModule }) {
  const { formatPrice } = useCurrency();
  const { compact, accent: envAccent } = useModuleEnv();
  const accent = safeAccent(envAccent);
  const thumbs = (m.products || []).slice(0, 3);
  return (
    <section
      className={cn('relative overflow-hidden rounded-2xl', rc(compact, '', 'md:rounded-3xl'))}
      style={{ background: `linear-gradient(120deg, ${withAlpha(accent, 0.14)} 0%, ${withAlpha(accent, 0.04)} 55%, #f8f8fa 100%)` }}
    >
      <div className={cn('grid items-center', rc(compact, 'grid-cols-1', 'grid-cols-1 md:grid-cols-2'))}>
        <div className={cn('relative order-2 p-6', rc(compact, '', 'md:order-1 md:p-12 lg:p-16'))}>
          {m.eyebrow && (
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: accent }}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> {m.eyebrow}
            </p>
          )}
          <h1 className={cn('font-black leading-[1.05] tracking-tight text-ink', rc(compact, 'text-3xl', 'text-3xl sm:text-4xl lg:text-6xl'))}>{m.title}</h1>
          {m.subtitle && <p className={cn('mt-4 max-w-lg text-gray-600', rc(compact, 'text-sm', 'text-sm md:text-lg'))}>{m.subtitle}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            {m.cta && (
              <Link href={m.cta.href || '/'} className="btn text-white shadow-lg transition hover:brightness-110" style={{ backgroundColor: accent }}>
                {m.cta.label} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
            {m.secondaryCta && (
              <Link href={m.secondaryCta.href || '/'} className="btn-outline bg-white/70">
                {m.secondaryCta.label}
              </Link>
            )}
          </div>
          {thumbs.length > 0 && (
            <div className={cn('mt-8 flex gap-3', rc(compact, '', 'md:mt-10'))}>
              {thumbs.map((p) => (
                <Link key={p.id} href={`/product/${p.id}`} data-item-id={p.id} className="group w-16 sm:w-20" title={p.name}>
                  <div className="aspect-[3/4] overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.image} alt={p.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                  </div>
                  <p className="mt-1 truncate text-[11px] font-semibold text-gray-700">{formatPrice(p.price)}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className={cn('relative order-1 h-64', rc(compact, '', 'sm:h-80 md:order-2 md:h-[520px]'))}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.image} alt={m.title} className="absolute inset-0 h-full w-full object-cover" />
          <div
            className={cn('absolute inset-0', rc(compact, 'bg-gradient-to-t from-black/10 to-transparent', 'bg-gradient-to-t from-black/10 to-transparent md:bg-gradient-to-r md:from-white/40 md:via-transparent'))}
          />
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- category tiles --------------------------------- */

export function CategoryTiles({ m }: { m: CategoryTilesModule }) {
  const { compact } = useModuleEnv();
  const n = m.tiles?.length || 0;
  return (
    <section>
      <SectionHeader title={m.title} />
      <div
        className={cn(
          'grid gap-3',
          rc(compact, 'grid-cols-2', n >= 6 ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6' : n === 5 ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' : 'grid-cols-2 lg:grid-cols-4'),
          !compact && 'md:gap-4',
        )}
      >
        {(m.tiles || []).map((t) => (
          <Link key={t.href + t.label} href={t.href} className="group relative block overflow-hidden rounded-xl bg-gray-100">
            <div className="aspect-[4/5]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.image} alt={t.label} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-3 pt-10 text-white">
              <p className="text-sm font-bold leading-tight sm:text-base">{t.label}</p>
              {t.subtitle && <p className="text-[11px] font-medium opacity-85 sm:text-xs">{t.subtitle}</p>}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------- product carousel -------------------------------- */

export function ProductCarousel({ m }: { m: ProductCarouselModule }) {
  const { compact, showWhy } = useModuleEnv();
  if (!m.products?.length) return null;
  return (
    <section>
      <SectionHeader title={m.title} subtitle={m.subtitle} href={m.viewAllHref} />
      <ProductRail products={m.products} compact={compact} showWhy={showWhy} />
    </section>
  );
}

/* ----------------------------------- cta banner ----------------------------------- */

function useCountdownToMidnight() {
  const [left, setLeft] = useState<string>('');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      const s = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
      const hh = String(Math.floor(s / 3600)).padStart(2, '0');
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      setLeft(`${hh}:${mm}:${ss}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return left;
}

export function CtaBanner({ m }: { m: CtaBannerModule }) {
  const { compact } = useModuleEnv();
  const countdown = useCountdownToMidnight();
  const [email, setEmail] = useState('');
  const [copied, setCopied] = useState(false);

  const palette = {
    newsletter: 'bg-gradient-to-r from-gray-900 to-gray-800 text-white',
    offer: 'bg-gradient-to-r from-brand-600 to-pink-500 text-white',
    urgency: 'bg-gradient-to-r from-amber-300 to-orange-400 text-ink',
    explore: 'bg-gradient-to-r from-slate-100 to-rose-50 text-ink',
  }[m.variant] || 'bg-gray-900 text-white';

  return (
    <section className={cn('relative overflow-hidden rounded-2xl', palette)}>
      <div className={cn('flex flex-col gap-6 p-6', rc(compact, '', 'md:flex-row md:items-center md:p-10'))}>
        <div className="min-w-0 flex-1">
          {m.variant === 'urgency' && countdown && (
            <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-black/10 px-3 py-1 font-mono text-xs font-bold">
              <Clock className="h-3.5 w-3.5" aria-hidden /> Ends in {countdown}
            </p>
          )}
          <h3 className={cn('font-black tracking-tight', rc(compact, 'text-2xl', 'text-2xl md:text-4xl'))}>{m.title}</h3>
          {m.subtitle && <p className="mt-2 max-w-xl text-sm opacity-90 md:text-base">{m.subtitle}</p>}

          {m.variant === 'newsletter' ? (
            <form
              className="mt-5 flex max-w-md flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                setEmail('');
                toast.success("You're on the list! (demo — nothing was sent)");
              }}
            >
              <label className="sr-only" htmlFor={`nl-${m.id}`}>
                Email address
              </label>
              <div className="relative flex-1">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
                <input
                  id={`nl-${m.id}`}
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-11 w-full rounded-md border-0 bg-white pl-9 pr-3 text-sm text-ink placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <button type="submit" className="btn-primary h-11">
                {m.cta?.label || 'Subscribe'}
              </button>
            </form>
          ) : (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {m.cta && (
                <Link
                  href={m.cta.href || '/'}
                  className={cn('btn', m.variant === 'explore' || m.variant === 'urgency' ? 'bg-ink text-white hover:bg-black' : 'bg-white text-ink hover:bg-gray-100')}
                >
                  {m.cta.label} <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              )}
              {m.code && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(m.code || '').catch(() => undefined);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="inline-flex items-center gap-2 rounded-md border-2 border-dashed border-current px-3 py-2 font-mono text-sm font-bold"
                  aria-label={`Copy code ${m.code}`}
                >
                  {m.code} {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              )}
            </div>
          )}
        </div>
        {m.image && (
          <div className={cn('relative h-44 w-full shrink-0 overflow-hidden rounded-xl', rc(compact, '', 'md:h-56 md:w-72'))}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.image} alt="" className="h-full w-full object-cover" />
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------- bundle ------------------------------------- */

function BundleItem({ p, anchor }: { p: BundleModule['anchor']; anchor?: boolean }) {
  return (
    <Link href={`/product/${p.id}`} data-item-id={p.id} className="group block w-28 shrink-0 sm:w-36">
      <div className={cn('relative aspect-[3/4] overflow-hidden rounded-lg bg-gray-50', anchor && 'ring-2 ring-brand-500 ring-offset-2')}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
        {anchor && <span className="absolute left-1.5 top-1.5 rounded-sm bg-brand-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">This item</span>}
      </div>
      <p className="mt-1.5 truncate text-xs font-bold">{p.brand}</p>
      <p className="truncate text-[11px] text-gray-500">{p.name}</p>
      <PriceRow p={p} />
    </Link>
  );
}

export function Bundle({ m }: { m: BundleModule }) {
  const { formatPrice } = useCurrency();
  const { compact } = useModuleEnv();
  const cart = useCart();
  const { recordCart } = useSession();
  if (!m.anchor) return null;
  const all = [m.anchor, ...(m.items || [])];
  const total = m.totalPrice || all.reduce((s, p) => s + p.price, 0);
  return (
    <section className="rounded-2xl border border-gray-100 bg-gradient-to-br from-white to-rose-50/60 p-5 md:p-8">
      <SectionHeader title={m.title} subtitle={m.subtitle} />
      <div className={cn('flex flex-col gap-6', rc(compact, '', 'lg:flex-row lg:items-center'))}>
        <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 sm:gap-3">
          {all.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 sm:gap-3">
              {i > 0 && <Plus className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />}
              <BundleItem p={p} anchor={i === 0} />
            </div>
          ))}
        </div>
        <div className={cn('rounded-xl bg-white p-5 shadow-card', rc(compact, '', 'lg:ml-auto lg:w-72'))}>
          <p className="text-sm text-gray-500">Total for {all.length} items</p>
          <p className="mt-1 text-2xl font-black">{formatPrice(total)}</p>
          <button
            type="button"
            className="btn-primary mt-4 w-full"
            onClick={() => {
              all.forEach((p) => {
                cart.add(p.id, defaultSize(p));
                recordCart(p.id);
              });
              toast.success(`Added ${all.length} items to your bag`);
            }}
          >
            Add all to bag
          </button>
          {all.some((p) => defaultSize(p)) && <p className="mt-2 text-[11px] text-gray-400">Sized items added in a default size — change it in your bag.</p>}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------- trust bar ------------------------------------ */

const TRUST_ICONS: Record<string, typeof Truck> = { truck: Truck, refresh: RefreshCw, shield: ShieldCheck, sparkles: Sparkles };

export function TrustBar({ m }: { m: TrustBarModule }) {
  const { compact } = useModuleEnv();
  return (
    <section className={cn('grid gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4', rc(compact, 'grid-cols-2', 'grid-cols-2 md:grid-cols-4 md:p-6'))}>
      {(m.items || []).map((it) => {
        const Icon = TRUST_ICONS[it.icon] || Sparkles;
        return (
          <div key={it.label} className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-xs font-semibold text-gray-700 sm:text-sm">{it.label}</span>
          </div>
        );
      })}
    </section>
  );
}
