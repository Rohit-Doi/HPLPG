import type { Metadata } from 'next';
import Link from 'next/link';
import { Info } from 'lucide-react';
import ShopListing from '@/components/shop/ShopListing';
import { coverImage, saleProducts } from '@/lib/catalog';
import { ssrSearch } from '@/lib/listing';
import { STOREFRONT, bannerById } from '@/lib/storefront';

export const metadata: Metadata = { title: 'Sale' };

type Search = Record<string, string | string[] | undefined>;

export default async function SalePage({ searchParams }: { searchParams: Promise<Search> }) {
  const raw = await searchParams;
  const products = saleProducts();
  const base = { onSale: true };
  const initial = ssrSearch(base, raw, 'discount');
  const maxOff = products.length ? Math.max(...products.map((p) => p.discountPct)) : 0;
  const banner = bannerById('sale');
  const campaigns = STOREFRONT.departmentCampaigns.filter((c) => c.onSale > 0);
  const promo = STOREFRONT.promoSummary;

  return (
    <div>
      <section className="container pt-4">
        {banner ? (
          <Link href="#sale-listing" className="block overflow-hidden rounded-2xl bg-gray-100 md:rounded-3xl" aria-label={`${banner.title} — jump to the sale listing`}>
            <picture>
              <source media="(min-width: 768px)" srcSet={banner.image} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={banner.imageSquare} alt={banner.title} className="aspect-square w-full object-cover md:aspect-[8/3]" />
            </picture>
          </Link>
        ) : (
          <div className="rounded-2xl bg-gradient-to-r from-brand-700 via-brand-600 to-pink-500 p-10 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.3em] opacity-90">End of season sale</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight md:text-6xl">Up to {Math.round(maxOff)}% off</h1>
          </div>
        )}
      </section>

      <section className="container py-6" aria-label="Sale by department">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="text-lg font-extrabold uppercase tracking-wide text-ink md:text-xl">Sale by department</h2>
          <p className="text-xs text-gray-500">{promo.onSale} of {promo.items} styles reduced</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-6">
          {campaigns.map((c) => (
            <Link key={c.department} href={`/shop/${c.department}?sale=1&sort=discount`} className="group relative block overflow-hidden rounded-xl bg-gray-100">
              <div className="aspect-[4/5]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverImage(c.department)} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-10 text-white">
                <p className="text-sm font-extrabold sm:text-base">{c.label}</p>
                <p className="text-xs font-black uppercase tracking-wide text-amber-300">{c.text}</p>
                <p className="text-[10px] opacity-80">{c.onSale} styles</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div id="sale-listing" className="container pb-6">
        <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-extrabold text-ink md:text-3xl">Sale · up to {Math.round(maxOff)}% off</h1>
          <p className="text-sm text-gray-500">{products.length} styles, biggest discounts first</p>
        </div>
        <ShopListing base={base} initial={initial} defaultSort="discount" emptyText="No sale items match these filters." />
      </div>

      <section className="container pb-4">
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 md:p-6">
          <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-ink">
            <Info className="h-4 w-4 text-brand-600" aria-hidden /> How our discounts are generated
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            {promo.markdown} observed markdowns + {promo.clearance} clearance items = {promo.onSale} styles on sale. Nothing here is typed in by a merchandiser.
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-gray-700">
            {promo.how.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
