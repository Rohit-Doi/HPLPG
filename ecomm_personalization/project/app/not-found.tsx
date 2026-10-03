import Link from 'next/link';
import { DEPARTMENTS } from '@/lib/catalog';

export default function NotFound() {
  return (
    <div className="container flex flex-col items-center py-24 text-center">
      <p className="text-7xl font-black text-brand-600">404</p>
      <h1 className="mt-3 text-xl font-extrabold">We couldn&apos;t find that page</h1>
      <p className="mt-1 max-w-sm text-sm text-gray-500">It may have moved, or the product is no longer available. Try one of these instead.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn-primary">
          Back to the store
        </Link>
        <Link href="/sale" className="btn-outline">
          Shop the sale
        </Link>
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {DEPARTMENTS.map((d) => (
          <Link key={d.id} href={`/shop/${d.id}`} className="chip hover:border-ink">
            {d.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
