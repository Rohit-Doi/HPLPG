'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { useSession } from '@/contexts/SessionContext';
import { fetchQuote, isOffline } from '@/lib/api';
import { readLocalOrders } from '@/lib/orders';
import { KEYS, readJSON, writeJSON } from '@/lib/storage';
import { localQuote } from '@/lib/storefront';
import type { PaymentMethodId, Quote, QuoteRequest, ShippingMethod } from '@/lib/types';

export type CheckoutOptions = {
  coupon: string;
  usePoints: number;
  shipping: ShippingMethod;
  paymentMethod: PaymentMethodId;
  bankCard: boolean;
};

const DEFAULTS: CheckoutOptions = { coupon: '', usePoints: 0, shipping: 'standard', paymentMethod: 'upi', bankCard: false };

/** v3 ids saved in older drafts -> v4 ids */
const LEGACY_PM: Record<string, PaymentMethodId> = { card: 'credit_card', paypal: 'wallet' };

/**
 * Debounced POST /checkout/quote on every change of the bag or the checkout options.
 * Falls back to the local rules engine (same maths) when the API is unreachable.
 * Options are persisted so /cart and /checkout share the coupon / delivery / payment choice.
 */
export function useQuote() {
  const cart = useCart();
  const auth = useAuth();
  const session = useSession();
  const [options, setOptionsState] = useState<CheckoutOptions>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const seq = useRef(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const saved = readJSON<Partial<CheckoutOptions>>(KEYS.checkout + '.options', {});
    const pm = saved.paymentMethod ? LEGACY_PM[saved.paymentMethod] || saved.paymentMethod : DEFAULTS.paymentMethod;
    setOptionsState({ ...DEFAULTS, ...saved, paymentMethod: pm });
    setHydrated(true);
  }, []);

  const setOptions = useCallback((patch: Partial<CheckoutOptions>) => {
    setOptionsState((prev) => {
      const next = { ...prev, ...patch };
      writeJSON(KEYS.checkout + '.options', next);
      return next;
    });
  }, []);

  const request: QuoteRequest | null = useMemo(() => {
    if (!cart.lines.length) return null;
    return {
      items: cart.lines.map((l) => ({ id: l.productId, qty: l.qty, size: l.size })),
      coupon: options.coupon.trim() ? options.coupon.trim().toUpperCase() : undefined,
      usePoints: options.usePoints || 0,
      shipping: options.shipping,
      paymentMethod: options.paymentMethod,
      bankCard: options.bankCard,
      visitorId: session.visitorId || undefined,
    };
  }, [cart.lines, options, session.visitorId]);

  const fallback = useCallback(
    (req: QuoteRequest) =>
      localQuote(req, {
        firstOrder: readLocalOrders().length === 0,
        pointsBalance: auth.user?.points ?? 0,
        signedIn: auth.signedIn,
      }),
    [auth.user?.points, auth.signedIn],
  );

  useEffect(() => {
    if (!hydrated || !session.ready || !auth.ready) return;
    if (!request) {
      setQuote(null);
      return;
    }
    const my = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        const q = await fetchQuote(request, ctrl.signal);
        if (my !== seq.current) return;
        setQuote(q);
        setOffline(false);
      } catch (e) {
        if (my !== seq.current || ctrl.signal.aborted) return;
        setOffline(isOffline(e));
        setQuote(fallback(request));
      } finally {
        if (my === seq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [request, hydrated, session.ready, auth.ready, auth.accountKey, fallback]);

  return { quote, loading, offline, options, setOptions, request, ready: hydrated };
}
