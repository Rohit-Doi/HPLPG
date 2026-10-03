'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { sendEvent } from '@/lib/api';
import type { Module } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ModuleEnv } from './ModuleEnv';
import { ModuleInfo } from './shared';
import { Announcement, Bundle, CategoryTiles, CtaBanner, Hero, ProductCarousel, TrustBar } from './Modules';
import { BrandSpotlight, CategoryGrid, HeroCarousel, OfferStrip } from './StoreModules';

function ModuleBody({ m }: { m: Module }) {
  switch (m.type) {
    case 'announcement':
      return <Announcement m={m} />;
    case 'hero':
      return <Hero m={m} />;
    case 'category_tiles':
      return <CategoryTiles m={m} />;
    case 'product_carousel':
      return <ProductCarousel m={m} />;
    case 'cta_banner':
      return <CtaBanner m={m} />;
    case 'bundle':
      return <Bundle m={m} />;
    case 'trust_bar':
      return <TrustBar m={m} />;
    case 'hero_carousel':
      return <HeroCarousel m={m} />;
    case 'offer_strip':
      return <OfferStrip m={m} />;
    case 'category_grid':
      return <CategoryGrid m={m} />;
    case 'brand_spotlight':
      return <BrandSpotlight m={m} />;
    default:
      return null;
  }
}

type Tracking = { visitorId: string; pageId: string } | null;

function TrackedModule({ m, tracking, children, className }: { m: Module; tracking: Tracking; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(false);

  useEffect(() => {
    seen.current = false;
  }, [tracking?.pageId]);

  useEffect(() => {
    const el = ref.current;
    if (!tracking || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !seen.current) {
          seen.current = true;
          sendEvent({ visitorId: tracking.visitorId, type: 'impression', pageId: tracking.pageId, moduleId: m.id });
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [tracking, m.id]);

  return (
    <div
      ref={ref}
      data-module-id={m.id}
      data-module-type={m.type}
      className={cn('relative', className)}
      onClickCapture={(e) => {
        if (!tracking) return;
        const a = (e.target as HTMLElement).closest('a');
        if (!a) return;
        const itemId = a.getAttribute('data-item-id') || undefined;
        sendEvent({ visitorId: tracking.visitorId, type: 'click', pageId: tracking.pageId, moduleId: m.id, itemId });
      }}
    >
      {children}
    </div>
  );
}

type Props = {
  modules: Module[];
  accent?: string;
  compact?: boolean;
  explain?: boolean;
  showWhy?: boolean;
  tracking?: Tracking;
  animate?: boolean;
};

/** Renders landing-page modules in order. Used by the storefront and the Lab preview. */
export default function ModuleRenderer({ modules, accent = '#e11d48', compact = false, explain = false, showWhy, tracking = null, animate = true }: Props) {
  const announcements = modules.filter((m) => m.type === 'announcement');
  const rest = modules.filter((m) => m.type !== 'announcement');
  const pad = compact ? 'px-3' : 'container';

  return (
    <ModuleEnv.Provider value={{ compact, explain, showWhy: showWhy ?? explain, accent }}>
      {announcements.map((m) => (
        <TrackedModule key={m.id} m={m} tracking={tracking}>
          <Announcement m={m as Extract<Module, { type: 'announcement' }>} />
          <ModuleInfo reason={m.reason} strategy={m.strategy} signals={m.signals} type={m.type} className="right-2 top-1/2 -translate-y-1/2" />
        </TrackedModule>
      ))}
      <div className={cn(pad, compact ? 'space-y-8 py-4' : 'space-y-12 py-6 md:space-y-16 md:py-8')}>
        {rest.map((m, i) => (
          <motion.div
            key={m.id}
            initial={animate ? { opacity: 0, y: 24 } : false}
            whileInView={animate ? { opacity: 1, y: 0 } : undefined}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.5, delay: Math.min(i, 3) * 0.05, ease: [0.22, 1, 0.36, 1] }}
          >
            <TrackedModule
              m={m}
              tracking={tracking}
              className={cn(explain && 'rounded-2xl outline-dashed outline-1 outline-offset-4 outline-brand-200')}
            >
              <ModuleBody m={m} />
              <ModuleInfo reason={m.reason} strategy={m.strategy} signals={m.signals} type={m.type} />
            </TrackedModule>
          </motion.div>
        ))}
      </div>
    </ModuleEnv.Provider>
  );
}

export function PageSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Personalizing your page">
      <div className="skeleton h-9 rounded-none" />
      <div className={cn(compact ? 'px-3' : 'container', 'space-y-12 py-6')}>
        <div className={cn('grid gap-6 overflow-hidden rounded-3xl bg-gray-50', compact ? 'grid-cols-1' : 'md:grid-cols-2')}>
          <div className="space-y-4 p-6 md:p-12">
            <div className="skeleton h-5 w-40 rounded-full" />
            <div className="skeleton h-12 w-4/5" />
            <div className="skeleton h-12 w-3/5" />
            <div className="skeleton h-4 w-2/3" />
            <div className="flex gap-3 pt-4">
              <div className="skeleton h-11 w-36" />
              <div className="skeleton h-11 w-28" />
            </div>
          </div>
          <div className="skeleton h-64 rounded-none md:h-[460px]" />
        </div>
        {[0, 1].map((r) => (
          <div key={r}>
            <div className="skeleton mb-4 h-6 w-56" />
            <div className="flex gap-4 overflow-hidden">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={cn('shrink-0', compact ? 'w-[42%]' : 'w-[44%] sm:w-[30%] md:w-[23%] lg:w-[18.5%]')}>
                  <div className="skeleton aspect-[3/4] rounded-lg" />
                  <div className="skeleton mt-2 h-4 w-2/3" />
                  <div className="skeleton mt-1.5 h-3 w-full" />
                  <div className="skeleton mt-1.5 h-4 w-1/2" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
