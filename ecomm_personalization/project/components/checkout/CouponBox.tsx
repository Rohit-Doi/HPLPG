'use client';

import { useState } from 'react';
import { Check, Tag, X } from 'lucide-react';
import { COUPONS } from '@/lib/storefront';
import type { Quote } from '@/lib/types';
import { cn } from '@/lib/utils';

type Props = { quote: Quote | null; coupon: string; onChange: (code: string) => void };

/** Coupon input with the list of available coupons (from the quote, fallback storefront.json). */
export default function CouponBox({ quote, coupon, onChange }: Props) {
  const [draft, setDraft] = useState(coupon);
  const [open, setOpen] = useState(false);
  const available = quote?.availableCoupons?.length ? quote.availableCoupons : COUPONS.map((c) => ({ code: c.code, label: c.label }));
  const applied = quote?.coupon;
  const error = quote?.errors?.find((e) => /coupon|WELCOME10/i.test(e));

  return (
    <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onChange(draft.trim().toUpperCase());
        }}
      >
        <label htmlFor="coupon" className="sr-only">
          Coupon code
        </label>
        <div className="relative min-w-0 flex-1">
          <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            id="coupon"
            value={draft}
            onChange={(e) => setDraft(e.target.value.toUpperCase())}
            placeholder="Coupon code"
            className={cn('input pl-9 uppercase', error && 'border-brand-400')}
            aria-invalid={!!error}
            aria-describedby="coupon-msg"
          />
        </div>
        {applied && applied.code === coupon ? (
          <button
            type="button"
            onClick={() => {
              setDraft('');
              onChange('');
            }}
            className="btn-outline px-3"
            aria-label="Remove coupon"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button type="submit" className="btn-dark px-4" disabled={!draft.trim()}>
            Apply
          </button>
        )}
      </form>
      <p id="coupon-msg" className={cn('mt-1.5 text-xs', error ? 'font-medium text-brand-600' : applied ? 'text-emerald-600' : 'text-gray-400')} aria-live="polite">
        {error ? error : applied ? `${applied.code} applied · ${applied.label}` : 'Apply a code or pick one below.'}
      </p>
      <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-xs font-semibold text-brand-600 hover:underline" aria-expanded={open}>
        {open ? 'Hide' : 'Show'} available coupons ({available.length})
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {available.map((c) => {
            const on = applied?.code === c.code;
            return (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(c.code);
                    onChange(c.code);
                  }}
                  className={cn('flex w-full items-center gap-2 rounded-md border bg-white px-2.5 py-1.5 text-left text-xs transition', on ? 'border-emerald-400' : 'border-gray-200 hover:border-gray-400')}
                >
                  <span className="rounded border border-dashed border-brand-300 bg-brand-50 px-1.5 py-0.5 font-mono font-bold text-brand-700">{c.code}</span>
                  <span className="min-w-0 flex-1 truncate text-gray-600">{c.label}</span>
                  {on && <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
