import type { Metadata } from 'next';
import ShopListing from '@/components/shop/ShopListing';
import { ssrSearch } from '@/lib/listing';

export const metadata: Metadata = { title: 'New arrivals' };

type Search = Record<string, string | string[] | undefined>;

export default async function NewPage({ searchParams }: { searchParams: Promise<Search> }) {
  const raw = await searchParams;
  const base = { isNew: true };
  const initial = ssrSearch(base, raw, 'new');
  return (
    <div>
      <section className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-rose-50">
        <div className="container py-10 md:py-14">
          <p className="label-xs text-brand-600">Just landed</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-ink md:text-5xl">New arrivals</h1>
          <p className="mt-2 max-w-lg text-sm text-gray-600">The latest additions to the AURA catalog — be the first to wear them.</p>
        </div>
      </section>
      <div className="container py-6">
        <ShopListing base={base} initial={initial} defaultSort="new" emptyText="No new arrivals match these filters." />
      </div>
    </div>
  );
}
