import type { Metadata } from 'next';
import Link from 'next/link';
import { STOREFRONT } from '@/lib/storefront';

export const metadata: Metadata = { title: 'Collections' };

export default function CollectionsPage() {
  const cols = STOREFRONT.collections;
  return (
    <div className="container py-6">
      <nav aria-label="Breadcrumb" className="mb-2 text-xs text-gray-500">
        <Link href="/" className="hover:text-ink">
          Home
        </Link>{' '}
        / <span className="font-semibold text-ink">Collections</span>
      </nav>
      <h1 className="text-2xl font-extrabold text-ink md:text-3xl">Collections</h1>
      <p className="mb-6 mt-1 text-sm text-gray-500">Curated edits built from what shoppers actually view and buy.</p>
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3">
        {cols.map((c) => (
          <Link key={c.id} href={c.href} className="group relative block overflow-hidden rounded-2xl bg-gray-100">
            <div className="aspect-[4/3] md:aspect-[3/2]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.image} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-14 text-white">
              <p className="text-lg font-extrabold leading-tight md:text-xl">{c.title}</p>
              <p className="line-clamp-1 text-xs opacity-90">{c.subtitle}</p>
              <p className="mt-1 text-[11px] font-semibold opacity-80">{c.items} styles</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
