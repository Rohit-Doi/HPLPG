import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ShopListing from '@/components/shop/ShopListing';
import { departmentLabel } from '@/lib/catalog';
import { ssrSearch } from '@/lib/listing';
import { BANNERS, STOREFRONT, brandProducts, getBrand } from '@/lib/storefront';
import { formatPrice } from '@/lib/utils';

type Params = { id: string };
type Search = Record<string, string | string[] | undefined>;

export const dynamicParams = false;

export function generateStaticParams() {
  return STOREFRONT.brands.map((b) => ({ id: b.id }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const b = getBrand(id);
  return { title: b ? b.name : 'Brand' };
}

export default async function BrandPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const { id } = await params;
  const raw = await searchParams;
  const brand = getBrand(id);
  if (!brand) notFound();
  const products = brandProducts(brand);
  const banner = BANNERS.find((b) => b.kind === 'brand' && b.brand === brand.name);
  const multiDept = new Set(products.map((p) => p.department)).size > 1;
  const base = { brand: brand.name };
  const initial = ssrSearch(base, raw);

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
        <section className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-rose-50">
          <div className="container flex items-center gap-5 py-8 md:py-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.image} alt="" className="hidden h-24 w-20 rounded-lg object-cover ring-1 ring-black/5 sm:block" />
            <div>
              <p className="label-xs text-brand-600">Brand</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-ink md:text-4xl">{brand.name}</h1>
            </div>
          </div>
        </section>
      )}
      <div className="container py-6">
        <nav aria-label="Breadcrumb" className="mb-2 text-xs text-gray-500">
          <Link href="/" className="hover:text-ink">
            Home
          </Link>{' '}
          /{' '}
          <Link href="/brands" className="hover:text-ink">
            Brands
          </Link>{' '}
          / <span className="font-semibold text-ink">{brand.name}</span>
        </nav>
        <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-extrabold text-ink md:text-3xl">{brand.name}</h1>
          <p className="text-sm text-gray-500">
            {products.length} styles · from {formatPrice(brand.priceFrom)} · {brand.departments.map(departmentLabel).join(', ')}
          </p>
          {brand.maxDiscount > 0 && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">Up to {brand.maxDiscount}% off on {brand.onSale} styles</span>}
        </div>
        <ShopListing base={base} initial={initial} hide={multiDept ? ['brand'] : ['brand', 'department']} emptyText="No items from this brand match these filters." />
      </div>
    </div>
  );
}
