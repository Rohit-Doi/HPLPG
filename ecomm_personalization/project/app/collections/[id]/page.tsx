import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ShopListing from '@/components/shop/ShopListing';
import { ssrSearch } from '@/lib/listing';
import { BANNERS, STOREFRONT, collectionProducts, getCollection } from '@/lib/storefront';

type Params = { id: string };
type Search = Record<string, string | string[] | undefined>;

export const dynamicParams = false;

export function generateStaticParams() {
  return STOREFRONT.collections.map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const c = getCollection(id);
  return { title: c ? c.title : 'Collection' };
}

export default async function CollectionPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const { id } = await params;
  const raw = await searchParams;
  const col = getCollection(id);
  if (!col) notFound();
  const products = collectionProducts(col);
  const banner = BANNERS.find((b) => b.href === col.href);
  const isNew = col.id === 'new-in';
  const base = { collection: col.id };
  const initial = ssrSearch(base, raw, isNew ? 'new' : 'popular');

  return (
    <div>
      {banner ? (
        <section className="container pt-4">
          <div className="overflow-hidden rounded-2xl bg-gray-100 md:rounded-3xl">
            <picture>
              <source media="(min-width: 768px)" srcSet={banner.image} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={banner.imageSquare} alt={banner.title} className="aspect-square w-full object-cover md:aspect-[8/3]" />
            </picture>
          </div>
        </section>
      ) : (
        <section className="relative overflow-hidden border-b border-gray-100 bg-gray-900 text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={col.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
          <div className="container relative py-12 md:py-16">
            <p className="label-xs text-white/80">Collection</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">{col.title}</h1>
            <p className="mt-2 max-w-lg text-sm opacity-90 md:text-base">{col.subtitle}</p>
          </div>
        </section>
      )}
      <div className="container py-6">
        <nav aria-label="Breadcrumb" className="mb-2 text-xs text-gray-500">
          <Link href="/" className="hover:text-ink">
            Home
          </Link>{' '}
          /{' '}
          <Link href="/collections" className="hover:text-ink">
            Collections
          </Link>{' '}
          / <span className="font-semibold text-ink">{col.title}</span>
        </nav>
        <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-extrabold text-ink md:text-3xl">{col.title}</h1>
          <p className="text-sm text-gray-500">
            {products.length} styles · {col.subtitle}
          </p>
        </div>
        <ShopListing base={base} initial={initial} defaultSort={isNew ? 'new' : 'popular'} emptyText="This collection is empty right now." />
      </div>
    </div>
  );
}
