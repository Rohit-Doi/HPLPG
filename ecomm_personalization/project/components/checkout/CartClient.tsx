'use client';

import Link from 'next/link';
import { ArrowRight, Heart, Minus, Plus, ShieldCheck, ShoppingBag, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { useCart } from '@/contexts/CartContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { sizesFor } from '@/lib/catalog';
import { FREE_SHIPPING_OVER } from '@/lib/storefront';
import { cn } from '@/lib/utils';
import { PriceRow } from '@/components/product/ProductCard';
import CouponBox from './CouponBox';
import { QuoteSummary } from './QuoteSummary';
import { useQuote } from './useQuote';

export function FreeShippingBar({ subtotal, className }: { subtotal: number; className?: string }) {
  const { formatPrice } = useCurrency();
  const left = Math.max(0, FREE_SHIPPING_OVER - subtotal);
  const pct = Math.min(100, Math.round((subtotal / FREE_SHIPPING_OVER) * 100));
  return (
    <div className={cn('rounded-xl border border-gray-100 bg-white p-3', className)}>
      <p className="flex items-center gap-2 text-sm">
        <Truck className={cn('h-4 w-4', left === 0 ? 'text-emerald-600' : 'text-brand-600')} aria-hidden />
        {left === 0 ? (
          <span className="font-semibold text-emerald-700">You have unlocked free standard delivery.</span>
        ) : (
          <span>
            You&apos;re <b className="text-ink">{formatPrice(left)}</b> away from free delivery
          </span>
        )}
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to free delivery">
        <div className={cn('h-full rounded-full transition-all', left === 0 ? 'bg-emerald-500' : 'bg-brand-600')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function CartClient() {
  const cart = useCart();
  const wish = useWishlist();
  const { formatPrice } = useCurrency();
  const { quote, loading, offline, options, setOptions, ready } = useQuote();
  const { items, setQty, remove, count, subtotal, mrp } = cart;

  if (ready && cart.hydrated && !items.length) {
    return (
      <div className="container flex flex-col items-center py-24 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50">
          <ShoppingBag className="h-9 w-9 text-brand-600" aria-hidden />
        </span>
        <h1 className="mt-5 text-xl font-extrabold">Your bag is empty</h1>
        <p className="mt-1 text-sm text-gray-500">There is nothing in your bag. Let&apos;s add some items.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-primary">
            Continue shopping
          </Link>
          {wish.ids.length > 0 && (
            <Link href="/wishlist" className="btn-outline">
              Add from wishlist ({wish.ids.length})
            </Link>
          )}
        </div>
      </div>
    );
  }

  const savings = Math.max(0, mrp - subtotal);

  return (
    <div className="container py-6 md:py-8">
      <h1 className="mb-5 text-2xl font-extrabold">
        Your bag <span className="text-base font-medium text-gray-500">({count} {count === 1 ? 'item' : 'items'})</span>
      </h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <FreeShippingBar subtotal={subtotal} className="mb-4" />
          <ul className="space-y-3">
            {items.map((l) => {
              const sizes = sizesFor(l.product);
              return (
                <li key={l.productId + (l.size || '')} className="card flex gap-3 p-3 sm:gap-4 sm:p-4">
                  <Link href={`/product/${l.productId}`} className="w-24 shrink-0 sm:w-28">
                    <div className="aspect-[3/4] overflow-hidden rounded-lg bg-gray-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={l.product.image} alt={l.product.name} className="h-full w-full object-cover" />
                    </div>
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/product/${l.productId}`} className="block truncate font-bold hover:underline">
                          {l.product.brand}
                        </Link>
                        <p className="truncate text-sm text-gray-500">{l.product.name}</p>
                      </div>
                      <button type="button" onClick={() => remove(l.productId, l.size)} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-ink" aria-label={`Remove ${l.product.name}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      {sizes.length > 0 && (
                        <label className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 font-semibold">
                          Size
                          <select
                            aria-label="Size"
                            value={l.size || ''}
                            onChange={(e) => {
                              const next = e.target.value || null;
                              if (next === l.size) return;
                              remove(l.productId, l.size);
                              cart.add(l.productId, next, l.qty);
                            }}
                            className="bg-transparent font-bold focus:outline-none"
                          >
                            {sizes.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <div className="flex items-center rounded border border-gray-200 bg-white">
                        <button type="button" className="p-1.5 hover:bg-gray-50" aria-label="Decrease quantity" onClick={() => setQty(l.productId, l.size, l.qty - 1)}>
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-7 text-center font-semibold" aria-live="polite">
                          {l.qty}
                        </span>
                        <button type="button" className="p-1.5 hover:bg-gray-50" aria-label="Increase quantity" onClick={() => setQty(l.productId, l.size, l.qty + 1)} disabled={l.qty >= 10}>
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!wish.has(l.productId)) wish.toggle(l.productId);
                          remove(l.productId, l.size);
                          toast.success('Moved to wishlist');
                        }}
                        className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 font-semibold text-gray-600 hover:border-ink hover:text-ink"
                      >
                        <Heart className="h-3 w-3" aria-hidden /> Move to wishlist
                      </button>
                    </div>
                    <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                      <PriceRow p={l.product} />
                      {l.qty > 1 && <span className="text-xs font-semibold text-gray-500">{formatPrice(l.product.price * l.qty)}</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {savings > 0 && (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              You are saving {formatPrice(savings)} on this bag.
            </p>
          )}
          <p className="mt-4 flex items-center gap-2 text-xs text-gray-500">
            <ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden /> Secure checkout (UPI, cards, net banking, COD) · 30-day easy returns
          </p>
        </div>

        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <QuoteSummary
            quote={quote}
            loading={loading}
            offline={offline}
            cta={
              <Link href="/checkout" className="btn-primary h-12 w-full text-base">
                Proceed to checkout <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            }
          >
            <CouponBox quote={quote} coupon={options.coupon} onChange={(code) => setOptions({ coupon: code })} />
          </QuoteSummary>
        </div>
      </div>
    </div>
  );
}
