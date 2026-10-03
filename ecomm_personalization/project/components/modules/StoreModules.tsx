'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, CreditCard, Gift, Sparkles, Tag, Truck } from 'lucide-react';
import { toast } from 'sonner';
import type { BrandSpotlightModule, CategoryGridModule, HeroCarouselModule, OfferStripModule } from '@/lib/types';
import { cn } from '@/lib/utils';
import { rc, useModuleEnv } from './ModuleEnv';
import { SectionHeader } from './shared';

/* -------------------------------- hero carousel -------------------------------- */

const AUTOPLAY_MS = 5000;

export function HeroCarousel({ m }: { m: HeroCarouselModule }) {
  const { compact, explain } = useModuleEnv();
  const slides = (m.slides || []).filter((s) => s && (s.image || s.imageSquare));
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const n = slides.length;

  const go = useCallback((i: number) => setIndex(((i % Math.max(n, 1)) + Math.max(n, 1)) % Math.max(n, 1)), [n]);

  useEffect(() => {
    if (n <= 1 || paused) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % n), AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [n, paused]);

  useEffect(() => {
    if (index >= n) setIndex(0);
  }, [n, index]);

  if (!n) return null;

  return (
    <section
      className={cn('relative overflow-hidden rounded-2xl bg-gray-100', rc(compact, '', 'md:rounded-3xl'))}
      aria-roledescription="carousel"
      aria-label="Featured campaigns"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={(e) => {
        touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        setPaused(true);
      }}
      onTouchEnd={(e) => {
        const t = touch.current;
        touch.current = null;
        setPaused(false);
        if (!t) return;
        const dx = e.changedTouches[0].clientX - t.x;
        const dy = e.changedTouches[0].clientY - t.y;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      <div className={cn('relative', rc(compact, 'aspect-square', 'aspect-square md:aspect-[8/3]'))}>
        {slides.map((s, i) => {
          const active = i === index;
          return (
            <div
              key={s.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${n}: ${s.title}`}
              aria-hidden={!active}
              className={cn('absolute inset-0 transition-opacity duration-700', active ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0')}
            >
              <Link href={s.cta?.href || '/'} className="group block h-full w-full" tabIndex={active ? 0 : -1} aria-label={`${s.title} — ${s.cta?.label || 'Shop now'}`}>
                {compact ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.imageSquare || s.image} alt={s.title} className="h-full w-full object-cover" loading={i === 0 ? 'eager' : 'lazy'} />
                ) : (
                  <picture>
                    <source media="(min-width: 768px)" srcSet={s.image || s.imageSquare} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.imageSquare || s.image} alt={s.title} className="h-full w-full object-cover" loading={i === 0 ? 'eager' : 'lazy'} />
                  </picture>
                )}
              </Link>
              {explain && (
                <div className={cn('absolute right-3 top-3 z-20 max-w-[70%] rounded-lg border border-brand-200 bg-white/95 p-2.5 text-[11px] shadow-sm backdrop-blur', rc(compact, '', 'md:max-w-xs'))}>
                  <p className="flex items-center justify-between gap-2">
                    <span className="label-xs text-brand-600">Why this slide</span>
                    <span className="rounded bg-brand-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-brand-700">{Math.round((s.score ?? 0) * 100)}%</span>
                  </p>
                  <p className="mt-1 leading-snug text-gray-700">{s.why || '—'}</p>
                  {s.copySource && <p className="mt-1 text-[10px] text-gray-400">copy: {s.copySource}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {n > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => go(index - 1)}
            className={cn('absolute left-2 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink shadow-card backdrop-blur transition hover:bg-white', rc(compact, '', 'md:flex'))}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => go(index + 1)}
            className={cn('absolute right-2 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink shadow-card backdrop-blur transition hover:bg-white', rc(compact, '', 'md:flex'))}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center gap-1.5" role="tablist" aria-label="Slides">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Go to slide ${i + 1}: ${s.title}`}
                onClick={() => go(i)}
                className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/60 hover:bg-white/90')}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/* --------------------------------- offer strip --------------------------------- */

const OFFER_ICONS: Record<string, typeof Tag> = { 'credit-card': CreditCard, tag: Tag, sparkles: Sparkles, truck: Truck, gift: Gift };

export function CodeChip({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard
          ?.writeText(code)
          .then(() => toast.success(`Code ${code} copied`))
          .catch(() => toast.message(`Use code ${code} at checkout`));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={cn('inline-flex items-center gap-1.5 rounded-md border border-dashed border-brand-400 bg-brand-50 px-2 py-1 font-mono text-[11px] font-bold text-brand-700 hover:bg-brand-100', className)}
      aria-label={`Copy code ${code}`}
    >
      {code} {copied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
    </button>
  );
}

export function OfferStrip({ m }: { m: OfferStripModule }) {
  const { compact } = useModuleEnv();
  const offers = (m.offers || []).slice(0, 4);
  if (!offers.length) return null;
  return (
    <section aria-label="Offers" className={cn('no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1', rc(compact, '', 'md:mx-0 md:grid md:overflow-visible md:px-0'), !compact && (offers.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-4'))}>
      {offers.map((o, i) => {
        const Icon = OFFER_ICONS[o.icon] || Tag;
        return (
          <div key={i} className={cn('flex min-w-[240px] flex-1 items-start gap-3 rounded-xl border border-gray-100 bg-white p-3.5 shadow-card', rc(compact, '', 'md:min-w-0'))}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-ink">{o.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-gray-500">{o.text}</p>
              {o.code && <CodeChip code={o.code} className="mt-2" />}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/* -------------------------------- category grid -------------------------------- */

function offerTone(offer: string) {
  const o = (offer || '').toUpperCase();
  if (o.includes('NEW')) return 'bg-ink text-white';
  if (o.includes('BEST')) return 'bg-amber-400 text-ink';
  return 'bg-gradient-to-r from-orange-500 to-brand-600 text-white';
}

export function CategoryGrid({ m }: { m: CategoryGridModule }) {
  const { compact } = useModuleEnv();
  const tiles = m.tiles || [];
  if (!tiles.length) return null;
  return (
    <section>
      <SectionHeader title={m.title || 'Shop by category'} />
      <div className={cn('grid gap-3', rc(compact, 'grid-cols-2', 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 md:gap-4'))}>
        {tiles.map((t) => (
          <Link key={t.href + t.label} href={t.href} className="group block overflow-hidden rounded-xl border border-gray-100 bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
            <div className="relative aspect-[3/4] overflow-hidden bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.image} alt={t.label} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              {t.offer && (
                <span className={cn('absolute left-2 top-2 rounded-sm px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide shadow-sm', offerTone(t.offer))}>{t.offer}</span>
              )}
            </div>
            <div className="p-2.5">
              <p className="truncate text-sm font-bold text-ink">{t.label}</p>
              <p className="truncate text-[11px] text-gray-500">
                {t.departmentLabel}
                {t.items ? ` · ${t.items} styles` : ''}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------- brand spotlight ------------------------------- */

export function BrandSpotlight({ m }: { m: BrandSpotlightModule }) {
  const { compact, showWhy } = useModuleEnv();
  const brands = (m.brands || []).slice(0, 6);
  if (!brands.length) return null;
  return (
    <section>
      <SectionHeader title={m.title || 'Brand spotlight'} href="/brands" />
      <div className={cn('grid gap-3', rc(compact, 'grid-cols-2', brands.length <= 4 ? 'grid-cols-2 md:gap-4 lg:grid-cols-4' : 'grid-cols-2 md:gap-4 sm:grid-cols-3 lg:grid-cols-6'))}>
        {brands.map((b) => (
          <Link key={b.id} href={b.href || `/brands/${b.id}`} className="group relative block overflow-hidden rounded-xl bg-gray-100">
            <div className="aspect-[4/5]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.image} alt={b.name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-12 text-white">
              <p className="truncate text-sm font-extrabold sm:text-base">{b.name}</p>
              {b.offer && <p className="text-[11px] font-black uppercase tracking-wide text-amber-300">{b.offer}</p>}
              <p className="text-[11px] opacity-85">{b.items} styles</p>
              {showWhy && b.why && <p className="mt-1 line-clamp-2 text-[10px] leading-snug opacity-80">{b.why}</p>}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
