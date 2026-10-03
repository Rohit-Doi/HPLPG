import type { Metadata } from 'next';
import Link from 'next/link';
import { departmentLabel } from '@/lib/catalog';
import { STOREFRONT } from '@/lib/storefront';
import { formatPrice } from '@/lib/utils';

export const metadata: Metadata = { title: 'Brands' };

export default function BrandsPage() {
  const brands = [...STOREFRONT.brands].sort((a, b) => b.popularity - a.popularity);
  return (
    <div className="container py-6">
      <nav aria-label="Breadcrumb" className="mb-2 text-xs text-gray-500">
        <Link href="/" className="hover:text-ink">
          Home
        </Link>{' '}
        / <span className="font-semibold text-ink">Brands</span>
      </nav>
      <h1 className="text-2xl font-extrabold text-ink md:text-3xl">All brands</h1>
      <p className="mb-6 mt-1 text-sm text-gray-500">{brands.length} brands · sorted by how often shoppers view and buy them.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
        {brands.map((b) => (
          <Link key={b.id} href={`/brands/${b.id}`} className="group card overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lift">
            <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.image} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              {b.maxDiscount > 0 && (
                <span className="absolute left-2 top-2 rounded-sm bg-gradient-to-r from-orange-500 to-brand-600 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                  Up to {b.maxDiscount}% off
                </span>
              )}
            </div>
            <div className="p-3">
              <p className="truncate text-base font-extrabold text-ink">{b.name}</p>
              <p className="text-xs text-gray-500">
                {b.items} {b.items === 1 ? 'style' : 'styles'} · from {formatPrice(b.priceFrom)}
              </p>
              <p className="mt-1 truncate text-[11px] text-gray-400">{b.departments.map(departmentLabel).join(' · ')}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
