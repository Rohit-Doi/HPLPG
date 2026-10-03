import type { Metadata } from 'next';
import Link from 'next/link';
import ShopListing from '@/components/shop/ShopListing';
import { CATALOG, countBy } from '@/lib/catalog';
import { ssrSearch } from '@/lib/listing';

export const metadata: Metadata = { title: 'Search' };

type Search = Record<string, string | string[] | undefined>;

export default async function SearchPage({ searchParams }: { searchParams: Promise<Search> }) {
  const raw = await searchParams;
  const q = typeof raw.q === 'string' ? raw.q : '';
  const query = q.trim();
  const popular = countBy(CATALOG, (p) => p.subcategory).slice(0, 10);
  const base = { q: query };
  const initial = query ? ssrSearch(base, raw, 'relevance') : null;
  return (
    <div className="container py-6">
      <h1 className="mb-1 text-2xl font-extrabold text-ink">{query ? <>Results for “{query}”</> : 'Search'}</h1>
      <p className="mb-5 text-sm text-gray-500">{query ? 'Matching products, brands and categories' : 'Type in the search bar to find products, brands and categories.'}</p>
      {query && initial ? (
        <ShopListing
          key={query}
          base={base}
          initial={initial}
          defaultSort="relevance"
          searchQuery={query}
          emptyText={`We couldn't find anything for “${query}”. Try a different word or remove some filters.`}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
          <p className="mt-2 text-sm text-gray-500">Popular searches</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {popular.map((s) => (
              <Link key={s.name} href={`/search?q=${encodeURIComponent(s.name)}`} className="chip hover:border-ink">
                {s.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
