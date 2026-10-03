'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Activity, Clock, Flame } from 'lucide-react';
import { fetchTrendingLive, searchCatalogApi } from '@/lib/api';
import { coverImage, fixImagePath } from '@/lib/catalog';
import { STOREFRONT } from '@/lib/storefront';
import type { Product, TrendingLiveResponse } from '@/lib/types';
import { SectionHeader } from '@/components/modules/shared';
import ProductRail from '@/components/product/ProductRail';

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

/** "Deal of the day": top 6 by discount from the live catalog, with a countdown to local midnight. */
export function DealOfTheDay() {
  const [items, setItems] = useState<Product[] | null>(null);
  const countdown = useCountdownToMidnight();
  useEffect(() => {
    let alive = true;
    searchCatalogApi({ onSale: true, sort: 'discount', limit: 6 })
      .then((r) => alive && setItems((r.items || []).map((p) => ({ ...p, image: fixImagePath(p.image) }))))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, []);
  if (!items || !items.length) return null;
  const top = Math.max(...items.map((p) => p.discountPct));
  return (
    <section data-module-id="deal_of_the_day">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-extrabold uppercase tracking-wide text-ink md:text-xl">
            <Flame className="h-5 w-5 text-brand-600" aria-hidden /> Deal of the day
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">Biggest markdowns right now — up to {Math.round(top)}% off, from the live catalog.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-white" aria-live="off">
          <Clock className="h-3.5 w-3.5" aria-hidden /> Ends in <span className="font-mono tabular-nums">{countdown || '--:--:--'}</span>
        </div>
      </div>
      <ProductRail products={items} />
      <div className="mt-3 text-right">
        <Link href="/sale?sort=discount" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
          See all deals
        </Link>
      </div>
    </section>
  );
}

/** "Top offers by category": department campaign tiles (storefront.json) with "min X% off". */
export function TopOffers() {
  const tiles = STOREFRONT.departmentCampaigns.filter((c) => c.onSale > 0);
  if (!tiles.length) return null;
  return (
    <section data-module-id="top_offers">
      <SectionHeader title="Top offers by category" subtitle="Sale-time picks across every department" href="/sale" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-6">
        {tiles.map((c) => (
          <Link key={c.department} href={`/shop/${c.department}?sale=1&sort=discount`} className="group relative block overflow-hidden rounded-xl bg-gray-100">
            <div className="aspect-[4/5]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverImage(c.department)} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-10 text-white">
              <p className="text-sm font-extrabold sm:text-base">{c.label}</p>
              <p className="text-xs font-black uppercase tracking-wide text-amber-300">Min {c.minPct}% off</p>
              <p className="text-[10px] opacity-80">
                {c.text} · {c.onSale} styles
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * v5 "Trending right now · live": GET /trending/live ranks items by the last 24h of real interaction events
 * (views, bags, wishlists, purchases) — it closes the loop without a retrain. Hidden while empty.
 */
export function LiveTrending() {
  const [data, setData] = useState<TrendingLiveResponse | null>(null);
  useEffect(() => {
    let alive = true;
    fetchTrendingLive(24, 12)
      .then((r) => alive && setData({ ...r, items: (r?.items || []).map((p) => ({ ...p, image: fixImagePath(p.image) })) }))
      .catch(() => alive && setData({ windowHours: 24, events: 0, items: [] }));
    return () => {
      alive = false;
    };
  }, []);
  if (!data || !data.items.length) return null;
  return (
    <section data-module-id="trending_live" aria-labelledby="trending-live">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="trending-live" className="flex items-center gap-2 text-lg font-extrabold uppercase tracking-wide text-ink md:text-xl">
            <Activity className="h-5 w-5 text-brand-600" aria-hidden /> Trending right now
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              live
            </span>
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">
            What shoppers are viewing, bagging and buying in the last {data.windowHours}h — {data.events} live {data.events === 1 ? 'event' : 'events'}, no retrain needed.
          </p>
        </div>
        <Link href="/trending" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
          All trending
        </Link>
      </div>
      <ProductRail products={data.items} showWhy />
    </section>
  );
}

/** Rendered after the agent modules when the API is up; visually matches ModuleRenderer spacing. */
export default function HomeExtras() {
  return (
    <div className="container space-y-12 pb-6 md:space-y-16">
      <LiveTrending />
      <DealOfTheDay />
      <TopOffers />
    </div>
  );
}
