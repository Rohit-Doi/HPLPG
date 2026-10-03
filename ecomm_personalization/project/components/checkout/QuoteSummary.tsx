'use client';

import { Gift, Loader2, WifiOff } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { Quote } from '@/lib/types';
import { cn } from '@/lib/utils';

function Row({ k, v, green, muted }: { k: React.ReactNode; v: React.ReactNode; green?: boolean; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={cn('text-gray-600', muted && 'text-gray-400')}>{k}</dt>
      <dd className={cn('font-semibold text-ink', green && 'text-emerald-600')}>{v}</dd>
    </div>
  );
}

type Props = { quote: Quote | null; loading?: boolean; offline?: boolean; cta?: React.ReactNode; title?: string; children?: React.ReactNode };

/** Price breakdown from POST /checkout/quote (or the local fallback). */
export function QuoteSummary({ quote, loading, offline, cta, title = 'Price details', children }: Props) {
  const cur = useCurrency();
  const { formatPrice } = cur;
  const q = quote;
  const count = q?.lines.reduce((s, l) => s + l.qty, 0) ?? 0;
  return (
    <div className="card p-5" aria-busy={loading}>
      <div className="mb-4 flex items-center justify-between">
        <p className="label-xs text-ink">
          {title} {count > 0 && `(${count} ${count === 1 ? 'item' : 'items'})`}
        </p>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" aria-label="Updating" />}
      </div>
      {children}
      {!q ? (
        <div className="space-y-2">
          <div className="skeleton h-4" />
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-6 w-1/2" />
        </div>
      ) : (
        <dl className="space-y-2.5 text-sm">
          <Row k="Subtotal (MRP)" v={formatPrice(q.subtotal + q.itemSavings)} />
          {q.itemSavings > 0 && <Row k="Item savings" v={`−${formatPrice(q.itemSavings)}`} green />}
          {q.coupon && <Row k={`Coupon ${q.coupon.code}`} v={`−${formatPrice(q.couponDiscount)}`} green />}
          {q.bankDiscount > 0 && <Row k={`${q.bankOffer?.bank || 'Bank'} card offer`} v={`−${formatPrice(q.bankDiscount)}`} green />}
          {q.pointsDiscount > 0 && <Row k={`${q.pointsUsed} points`} v={`−${formatPrice(q.pointsDiscount)}`} green />}
          <Row k={`Delivery · ${q.shipping.label}`} v={q.shipping.cost === 0 ? 'FREE' : formatPrice(q.shipping.cost)} green={q.shipping.cost === 0} />
          {q.codFee > 0 && <Row k="Cash-on-delivery fee" v={formatPrice(q.codFee)} />}
          <div className="flex justify-between border-t border-gray-100 pt-3 text-base font-extrabold">
            <dt>Total</dt>
            <dd>{formatPrice(q.total)}</dd>
          </div>
          {q.pointsEarned > 0 && (
            <p className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800">
              <Gift className="h-3.5 w-3.5" aria-hidden /> Earn {q.pointsEarned} points with this order
            </p>
          )}
        </dl>
      )}
      {q && q.subtotal > 0 && q.subtotal < q.shipping.freeOver && q.shipping.id === 'standard' && q.shipping.cost > 0 && (
        <p className="mt-3 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">Add {formatPrice(q.shipping.freeOver - q.subtotal)} more for free standard delivery.</p>
      )}
      {cur.currency !== 'INR' && (
        <p className="mt-3 text-[11px] text-gray-400" data-testid="currency-note">
          Prices are in INR, shown in {cur.currency} for reference only. You are charged in rupees{q ? ` (₹${Math.round(q.total).toLocaleString('en-IN')})` : ''}.
        </p>
      )}
      {offline && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-amber-700">
          <WifiOff className="h-3 w-3" aria-hidden /> Prices computed locally — the API is offline.
        </p>
      )}
      {cta && <div className="mt-5">{cta}</div>}
    </div>
  );
}
