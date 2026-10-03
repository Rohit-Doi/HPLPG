'use client';

import Link from 'next/link';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { showAudienceBadge } from '@/lib/catalog';
import type { Product, StockStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

export function PriceRow({ p, size = 'sm' }: { p: Product; size?: 'sm' | 'lg' }) {
  const { formatPrice } = useCurrency();
  const lg = size === 'lg';
  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-0.5', lg ? 'text-xl' : 'text-sm')}>
      <span className="font-bold text-ink">{formatPrice(p.price)}</span>
      {p.compareAt != null && p.compareAt > p.price && (
        <span className={cn('text-gray-400 line-through', lg ? 'text-base' : 'text-xs')}>{formatPrice(p.compareAt)}</span>
      )}
      {p.discountPct > 0 && (
        <span className={cn('font-semibold text-off', lg ? 'text-base' : 'text-xs')}>({Math.round(p.discountPct)}% OFF)</span>
      )}
    </div>
  );
}

/** Inventory pill; `stock` overrides `p.stockStatus` (the product page passes the live value). */
export function Badges({ p, className, stock }: { p: Product; className?: string; stock?: StockStatus | null }) {
  const badges: { label: string; cls: string }[] = [];
  const st = stock ?? p.stockStatus;
  if (st === 'sold_out') badges.push({ label: 'Sold out', cls: 'bg-gray-800 text-white' });
  if (p.onSale && p.discountPct > 0) badges.push({ label: 'Sale', cls: 'bg-brand-600 text-white' });
  if (p.isNew || p.catalogOnly) badges.push({ label: p.catalogOnly && !p.isNew ? 'Just in' : 'New', cls: 'bg-ink text-white' });
  if (p.isBestseller) badges.push({ label: 'Bestseller', cls: 'bg-amber-100 text-amber-800' });
  if (st === 'low') badges.push({ label: 'Low stock', cls: 'bg-orange-100 text-orange-800' });
  if (!badges.length) return null;
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {badges.map((b) => (
        <span key={b.label} className={cn('rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', b.cls)}>
          {b.label}
        </span>
      ))}
    </div>
  );
}

export function WishButton({ id, className }: { id: string; className?: string }) {
  const { has, toggle } = useWishlist();
  const on = has(id);
  return (
    <button
      type="button"
      aria-label={on ? 'Remove from wishlist' : 'Add to wishlist'}
      aria-pressed={on}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const now = toggle(id);
        toast.success(now ? 'Added to wishlist' : 'Removed from wishlist');
      }}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur transition hover:scale-110',
        className,
      )}
    >
      <Heart className={cn('h-4 w-4', on ? 'fill-brand-600 text-brand-600' : 'text-gray-700')} />
    </button>
  );
}

type Props = {
  product: Product;
  className?: string;
  /** show the per-item agent explanation (product.why) */
  showWhy?: boolean;
  priority?: boolean;
};

export default function ProductCard({ product: p, className, showWhy, priority }: Props) {
  return (
    <Link
      href={`/product/${p.id}`}
      data-item-id={p.id}
      className={cn('group relative block rounded-lg bg-white transition duration-300 hover:-translate-y-1 hover:shadow-lift', className)}
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-gray-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={p.image}
          alt={p.name}
          loading={priority ? 'eager' : 'lazy'}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <Badges p={p} className="absolute left-2 top-2" />
        <WishButton id={p.id} className="absolute right-2 top-2" />
        {p.stats.orders > 0 && (
          <span className="absolute bottom-2 left-2 rounded-sm bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">
            {compactOrders(p.stats.orders)} bought
          </span>
        )}
        {showAudienceBadge(p) && (
          <span className="absolute bottom-2 right-2 rounded-sm bg-ink/85 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            {p.audience === 'women' ? 'Women' : 'Men'}
          </span>
        )}
      </div>
      <div className="px-1 pb-2 pt-2.5">
        <p className="truncate text-sm font-bold text-ink">{p.brand}</p>
        <p className="truncate text-[13px] text-gray-500">{p.name}</p>
        <div className="mt-1">
          <PriceRow p={p} />
        </div>
        {showWhy && p.why && (
          <p className="mt-1.5 line-clamp-2 rounded bg-brand-50 px-1.5 py-1 text-[11px] leading-snug text-brand-800">{p.why}</p>
        )}
      </div>
    </Link>
  );
}

function compactOrders(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}
