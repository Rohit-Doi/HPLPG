import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import ShopListing from '@/components/shop/ShopListing';
import { DEPARTMENTS, byDepartment, isDepartment, subcategoriesOf } from '@/lib/catalog';
import { ssrSearch } from '@/lib/listing';
import { STOREFRONT } from '@/lib/storefront';

type Params = { department: string };
type Search = Record<string, string | string[] | undefined>;

export const dynamicParams = false;

export function generateStaticParams() {
  return DEPARTMENTS.map((d) => ({ department: d.id }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { department } = await params;
  const d = DEPARTMENTS.find((x) => x.id === department);
  return { title: d ? `${d.label}` : 'Shop' };
}

export default async function DepartmentPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const { department } = await params;
  const raw = await searchParams;
  if (!isDepartment(department)) notFound();
  const dep = DEPARTMENTS.find((d) => d.id === department)!;
  const products = byDepartment(department);
  const sub = typeof raw.sub === 'string' && !raw.sub.includes(',') ? raw.sub : undefined;
  const initialSub = sub && products.some((p) => p.subcategory === sub) ? sub : undefined;
  const apparel = department === 'women' || department === 'men';
  const heading = initialSub ? `${dep.label} · ${initialSub}` : apparel ? `${dep.label}'s collection` : dep.label;
  const campaign = STOREFRONT.departmentCampaigns.find((c) => c.department === department);
  const subs = subcategoriesOf(department).slice(0, 8);
  const base = { department };
  const initial = ssrSearch(base, raw);

  return (
    <div className="container py-6">
      <nav aria-label="Breadcrumb" className="mb-2 text-xs text-gray-500">
        <Link href="/" className="hover:text-ink">
          Home
        </Link>{' '}
        /{' '}
        {initialSub ? (
          <Link href={`/shop/${department}`} className="hover:text-ink">
            {dep.label}
          </Link>
        ) : (
          <span className="font-semibold text-ink">{dep.label}</span>
        )}
        {initialSub && <> / <span className="font-semibold text-ink">{initialSub}</span></>}
      </nav>
      <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-extrabold text-ink md:text-3xl">{heading}</h1>
        <p className="text-sm text-gray-500">
          {products.length} items · {dep.tagline}
        </p>
        {campaign && campaign.onSale > 0 && (
          <Link href={`/shop/${department}?sale=1&sort=discount`} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 hover:bg-brand-100">
            {campaign.text} on {campaign.onSale} styles
          </Link>
        )}
      </div>
      {!initialSub && subs.length > 1 && (
        <div className="no-scrollbar -mx-4 mb-6 flex gap-3 overflow-x-auto px-4 pb-1">
          {subs.map((s) => (
            <Link key={s.name} href={`/shop/${department}?sub=${encodeURIComponent(s.name)}`} className="group w-24 shrink-0 text-center">
              <div className="aspect-square overflow-hidden rounded-full bg-gray-100 ring-1 ring-black/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.image} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
              </div>
              <p className="mt-1.5 truncate text-xs font-semibold text-ink">{s.name}</p>
              <p className="text-[10px] text-gray-400">{s.count}</p>
            </Link>
          ))}
        </div>
      )}
      <ShopListing base={base} initial={initial} hide={apparel ? ['department', 'audience'] : ['department']} />
    </div>
  );
}
