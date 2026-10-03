'use client';

import { useEffect, useRef, useState } from 'react';
import { Banknote, Clock, Loader2, MapPin, Truck, WifiOff, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { ApiError, fetchAddresses, fetchDeliveryEstimate } from '@/lib/api';
import { formatEta } from '@/lib/orders';
import { FREE_SHIPPING_OVER, PIN_RE, SHIPPING } from '@/lib/storefront';
import type { Address, DeliveryEstimate, ShippingMethod } from '@/lib/types';
import { cn } from '@/lib/utils';

export type DeliveryTarget = { country?: string; region?: string; postalCode?: string };

const isIndia = (c?: string) => !c || c === 'India';

/** Local fallback when /delivery/estimate is unreachable: same day ranges as the backend (India 3-6 / express 1-2, abroad 8-14). */
export function localEstimate(shipping: ShippingMethod | string, target: DeliveryTarget): DeliveryEstimate {
  const express = shipping === 'express';
  const india = isIndia(target.country);
  const [minDays, maxDays] = express ? (india ? [1, 2] : [5, 8]) : india ? [3, 6] : [8, 14];
  const now = Math.floor(Date.now() / 1000);
  return {
    zone: india ? 'india' : 'intl',
    minDays,
    maxDays,
    earliest: now + minDays * 86400,
    latest: now + maxDays * 86400,
    text: `${express ? 'Express' : 'Standard'} delivery in ${minDays}-${maxDays} days${target.postalCode ? ` to PIN ${target.postalCode}` : target.region ? ` to ${target.region}` : ''}`,
    cutoff: null,
    freeOver: FREE_SHIPPING_OVER,
    codAvailable: india,
  };
}

/**
 * Debounced GET /delivery/estimate for one shipping method. Returns the estimate (API or local
 * fallback) and whether it came from the fallback. An Indian PIN that is not 6 digits yet is left
 * out of the request (the API answers 400 for invalid PINs), so partially typed codes never error.
 */
export function useDeliveryEstimate(target: DeliveryTarget, shipping: ShippingMethod | string, enabled = true) {
  const [est, setEst] = useState<DeliveryEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const pin = (target.postalCode || '').trim();
  const postalCode = isIndia(target.country) ? (PIN_RE.test(pin) ? pin : undefined) : pin || undefined;
  const country = target.country || 'India';
  const key = JSON.stringify({ c: country, r: target.region || '', p: postalCode || '', s: shipping });
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const my = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const ctrl = new AbortController();
      try {
        const r = await fetchDeliveryEstimate({ country, region: target.region || undefined, postalCode, shipping }, ctrl.signal);
        if (my !== seq.current) return;
        setEst(r);
        setOffline(false);
      } catch (e) {
        if (my !== seq.current) return;
        setEst(localEstimate(shipping, { ...target, postalCode }));
        setOffline(!(e instanceof ApiError && e.status >= 400 && e.status < 500));
      } finally {
        if (my === seq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return { estimate: est, loading, offline };
}

/** "Thu, 2 Oct – Sat, 4 Oct" */
export function windowText(e: DeliveryEstimate | null) {
  if (!e) return '';
  const a = formatEta(e.earliest);
  const b = formatEta(e.latest);
  return a === b ? a : `${a} – ${b}`;
}

type Props = { price?: number; className?: string };

type Check = { pin: string; std: DeliveryEstimate; exp: DeliveryEstimate; offline: boolean };

/**
 * Product-page delivery block: "Enter PIN code" + Check -> GET /delivery/estimate (standard + express)
 * showing "Delivery by <date>" and COD availability. Prefilled from the default saved address PIN.
 */
export default function DeliveryEstimateBlock({ price, className }: Props) {
  const auth = useAuth();
  const { formatPrice } = useCurrency();
  const [pin, setPin] = useState('');
  const [prefilled, setPrefilled] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Check | null>(null);
  const seq = useRef(0);

  const check = async (raw: string) => {
    const code = raw.trim();
    if (!PIN_RE.test(code)) {
      setError('Enter a valid 6-digit PIN code.');
      setResult(null);
      return;
    }
    setError(null);
    setChecking(true);
    const my = ++seq.current;
    try {
      const q = { country: 'India', postalCode: code };
      const [std, exp] = await Promise.all([fetchDeliveryEstimate({ ...q, shipping: 'standard' }), fetchDeliveryEstimate({ ...q, shipping: 'express' })]);
      if (my !== seq.current) return;
      setResult({ pin: code, std, exp, offline: false });
    } catch (e) {
      if (my !== seq.current) return;
      if (e instanceof ApiError && e.status === 400) {
        setError(e.message || 'Enter a valid 6-digit PIN code.');
        setResult(null);
      } else {
        const t = { country: 'India', postalCode: code };
        setResult({ pin: code, std: localEstimate('standard', t), exp: localEstimate('express', t), offline: true });
      }
    } finally {
      if (my === seq.current) setChecking(false);
    }
  };

  // prefill from the default saved address PIN (Indian addresses only)
  useEffect(() => {
    if (!auth.ready || !auth.signedIn) return;
    let alive = true;
    fetchAddresses()
      .then((list) => {
        if (!alive || !Array.isArray(list) || !list.length) return;
        const india = (list as Address[]).filter((a) => isIndia(a.country) && PIN_RE.test((a.postalCode || '').trim()));
        const def = india.find((a) => a.isDefault) || india[0];
        if (!def) return;
        const code = def.postalCode.trim();
        setPin(code);
        setPrefilled(`your ${def.isDefault ? 'default ' : ''}address`);
        check(code);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.ready, auth.signedIn, auth.user?.id]);

  const freeOver = result?.std.freeOver ?? FREE_SHIPPING_OVER;
  const freeStd = price != null && price >= freeOver;

  return (
    <div className={cn('rounded-xl border border-gray-100 p-4', className)} aria-label="Delivery estimate" data-testid="pin-estimate">
      <p className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-ink">
        <MapPin className="h-4 w-4 text-brand-600" aria-hidden /> Delivery options
      </p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          check(pin);
        }}
        noValidate
      >
        <label htmlFor="pdp-pin" className="sr-only">
          Enter PIN code
        </label>
        <input
          id="pdp-pin"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
            setError(null);
          }}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          pattern="[1-9][0-9]{5}"
          placeholder="Enter PIN code"
          aria-invalid={!!error}
          aria-describedby={error ? 'pdp-pin-err' : undefined}
          className={cn('input min-w-0 flex-1 py-2 text-sm tracking-widest', error && 'border-brand-400')}
        />
        <button type="submit" className="btn-outline shrink-0 px-4 py-2 text-sm" disabled={checking}>
          {checking ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Checking" /> : 'Check'}
        </button>
      </form>
      {error && (
        <p id="pdp-pin-err" className="mt-1 text-xs text-brand-600" role="alert">
          {error}
        </p>
      )}
      {prefilled && result && result.pin === pin && <p className="mt-1 text-[11px] text-gray-400">Prefilled from {prefilled}.</p>}

      {result ? (
        <ul className="mt-3 space-y-2 text-sm text-gray-700" aria-live="polite">
          {[
            { id: 'standard', icon: Truck, r: result.std, label: SHIPPING.standard.label, cost: freeStd ? 'FREE' : formatPrice(SHIPPING.standard.price) },
            { id: 'express', icon: Zap, r: result.exp, label: SHIPPING.express.label, cost: formatPrice(SHIPPING.express.price) },
          ].map((row) => (
            <li key={row.id} className="flex items-start gap-2">
              <row.icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-ink">
                  Delivery by {formatEta(row.r.latest)}
                  {row.r.minDays !== row.r.maxDays && <span className="font-normal text-gray-500"> (as early as {formatEta(row.r.earliest)})</span>}
                </span>
                <span className="block text-xs text-gray-500">
                  {row.label} · <b className={cn(row.cost === 'FREE' ? 'text-emerald-600' : 'text-ink')}>{row.cost}</b>
                  {row.id === 'standard' && row.r.zone === 'metro' ? ' · metro PIN' : ''}
                </span>
              </span>
            </li>
          ))}
          <li className="flex items-start gap-2">
            <Banknote className={cn('mt-0.5 h-4 w-4 shrink-0', result.std.codAvailable ? 'text-emerald-600' : 'text-gray-400')} aria-hidden />
            <span className={cn('text-xs font-semibold', result.std.codAvailable ? 'text-emerald-700' : 'text-gray-500')}>
              {result.std.codAvailable ? 'COD available' : 'Cash on delivery not available for this PIN'}
            </span>
          </li>
        </ul>
      ) : (
        !error && <p className="mt-2 text-xs text-gray-500">Check delivery dates and cash-on-delivery for your PIN code.</p>
      )}
      <p className="mt-2 text-xs text-gray-500">
        {freeStd ? `Free standard delivery — this item is over ${formatPrice(freeOver)}.` : `Free standard delivery on orders over ${formatPrice(freeOver)}.`}
        {result?.std.cutoff ? (
          <span className="ml-1 inline-flex items-center gap-1 text-amber-700">
            <Clock className="h-3 w-3" aria-hidden /> {result.std.cutoff}
          </span>
        ) : null}
      </p>
      {result?.offline && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-700">
          <WifiOff className="h-3 w-3" aria-hidden /> Estimated locally — the delivery API is unreachable.
        </p>
      )}
    </div>
  );
}
