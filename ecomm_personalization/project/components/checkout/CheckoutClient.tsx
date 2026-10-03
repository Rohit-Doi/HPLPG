'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Banknote, Check, CreditCard, FlaskConical, Gift, Landmark, Loader2, Lock, Minus, Plus, ShieldCheck, ShoppingBag, Smartphone, Truck, Wallet, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useSession } from '@/contexts/SessionContext';
import { ApiError, createRazorpayOrder, fetchAddresses, fetchPaymentConfig, isOffline, loadRazorpayCheckout, placeOrder } from '@/lib/api';
import { MOBILE_RE, formatMobile, isIndia, normalizeMobile } from '@/lib/address';
import { buildLocalOrder, saveLocalOrder } from '@/lib/orders';
import { KEYS, readJSON, removeKey, writeJSON } from '@/lib/storage';
import { BANK_OFFER, BANK_OFFER_METHODS, CARD_METHODS, COD_FEE, FREE_SHIPPING_OVER, PAYMENT_METHODS, POINTS, SHIPPING } from '@/lib/storefront';
import type { Address, Order, OrderRequest, PaymentConfig, PaymentMethodId, PaymentMethodOption, QuoteLine, RazorpayOrder, RazorpaySuccess, ShippingMethod } from '@/lib/types';
import { cn, formatPrice as formatInr } from '@/lib/utils';
import { AddressCard, AddressForm, EMPTY_ADDRESS, addressValid } from '@/components/account/AddressBits';
import { useDeliveryEstimate, windowText } from '@/components/product/DeliveryEstimate';
import CouponBox from './CouponBox';
import { QuoteSummary } from './QuoteSummary';
import { useQuote } from './useQuote';

const STEPS = ['Address', 'Delivery & payment', 'Review'];

type Card = { number: string; expiry: string; cvv: string; name: string };
const EMPTY_CARD: Card = { number: '', expiry: '', cvv: '', name: '' };

function luhn(num: string) {
  const s = num.replace(/\D/g, '');
  if (s.length < 12) return false;
  let sum = 0;
  let dbl = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let d = Number(s[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

function cardErrors(c: Card): Partial<Record<keyof Card, string>> {
  const e: Partial<Record<keyof Card, string>> = {};
  if (!luhn(c.number)) e.number = 'Enter a valid card number.';
  const m = c.expiry.match(/^(\d{2})\s*\/\s*(\d{2})$/);
  if (!m) e.expiry = 'Use MM/YY.';
  else {
    const mm = Number(m[1]);
    const yy = 2000 + Number(m[2]);
    const now = new Date();
    if (mm < 1 || mm > 12 || yy < now.getFullYear() || (yy === now.getFullYear() && mm < now.getMonth() + 1)) e.expiry = 'Card has expired.';
  }
  if (!/^\d{3,4}$/.test(c.cvv)) e.cvv = '3 or 4 digits.';
  if (c.name.trim().length < 2) e.name = 'Name on card.';
  return e;
}

const PAY_ICONS: Record<string, typeof CreditCard> = { credit_card: CreditCard, debit_card: CreditCard, card: CreditCard, upi: Smartphone, netbanking: Landmark, wallet: Wallet, paypal: Wallet, cod: Banknote };

/** quote.paymentMethods grouped Flipkart-style (card / upi / bank / wallet / cash). */
const GROUPS: { id: string; label: string }[] = [
  { id: 'card', label: 'Cards' },
  { id: 'upi', label: 'UPI' },
  { id: 'bank', label: 'Net banking' },
  { id: 'wallet', label: 'Wallets' },
  { id: 'cash', label: 'Pay on delivery' },
];
const GROUP_OF: Record<string, string> = { credit_card: 'card', debit_card: 'card', card: 'card', upi: 'upi', netbanking: 'bank', wallet: 'wallet', paypal: 'wallet', cod: 'cash' };
const BANKS = ['AURA Bank', 'HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Mahindra Bank', 'Punjab National Bank', 'Bank of Baroda', 'Yes Bank'];
const WALLETS = ['Paytm', 'Amazon Pay', 'PhonePe', 'Mobikwik', 'Freecharge'];
/** our method choice -> Razorpay's `prefill.method` hint (Razorpay still lets the shopper switch) */
const RZP_METHOD: Record<string, string> = { upi: 'upi', credit_card: 'card', debit_card: 'card', card: 'card', netbanking: 'netbanking', wallet: 'wallet' };
const SIMULATED: PaymentConfig = { provider: 'simulated', mode: 'simulated', keyId: null, currency: 'INR', merchantName: 'AURA' };
const UPI_RE = /^[a-z0-9][\w.\-]{1,}@[a-z][a-z0-9]{1,}$/i;

/**
 * v5: POST /checkout/order answers 409 "{name} (size {size}) has only N left; …" when stock ran out.
 * Split the message into per-line problems and match them back to the quote lines by name + size.
 */
type StockProblem = { text: string; line?: QuoteLine };
function parseStockProblems(message: string, lines: QuoteLine[]): StockProblem[] {
  return message
    .split(/;\s*/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text) => {
      const m = text.match(/^(.*?)\s*\(size ([^)]+)\)/i);
      const name = (m?.[1] || text).toLowerCase();
      const size = m?.[2]?.trim();
      const line = lines.find((l) => l.name.toLowerCase() === name && (!size || (l.size || 'One size') === size)) || lines.find((l) => name.startsWith(l.name.toLowerCase()));
      return { text, line };
    });
}

/** One shipping option with its live delivery estimate for the chosen address. */
function ShippingOption({ id, on, onSelect, quote, address }: { id: ShippingMethod; on: boolean; onSelect: () => void; quote: { subtotal: number; shipping: { freeOver: number } } | null; address: Address }) {
  const { formatPrice } = useCurrency();
  const s = SHIPPING[id];
  const free = id === 'standard' && quote && quote.subtotal >= quote.shipping.freeOver;
  const est = useDeliveryEstimate({ country: address.country, region: address.region, postalCode: address.postalCode }, id);
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onSelect} className={cn('flex items-center justify-between gap-3 rounded-xl border p-4 text-left transition', on ? 'border-brand-600 ring-2 ring-brand-200' : 'border-gray-200 hover:border-gray-400')}>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-ink">{s.label}</span>
        <span className="block text-xs text-gray-500">{id === 'express' ? 'Priority handling' : `Free over ${formatPrice(quote?.shipping.freeOver ?? FREE_SHIPPING_OVER)}`}</span>
        <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-700">
          <Truck className="h-3.5 w-3.5" aria-hidden /> {est.estimate ? `Arrives ${windowText(est.estimate)}` : 'Estimating…'}
          {est.offline && <span className="font-normal text-gray-400">(est.)</span>}
        </span>
      </span>
      <span className={cn('shrink-0 text-sm font-extrabold', free ? 'text-emerald-600' : 'text-ink')}>{free ? 'FREE' : formatPrice(s.price)}</span>
    </button>
  );
}

export default function CheckoutClient() {
  const router = useRouter();
  const cart = useCart();
  const auth = useAuth();
  const session = useSession();
  const { formatPrice } = useCurrency();
  const { quote, loading, offline, options, setOptions, request, ready } = useQuote();

  const [step, setStep] = useState(0);
  /** v5: per-line stock problems from a 409 on place-order */
  const [stockProblems, setStockProblems] = useState<StockProblem[]>([]);
  const [saved, setSaved] = useState<Address[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | number | 'new' | null>(null);
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [email, setEmail] = useState('');
  const [card, setCard] = useState<Card>(EMPTY_CARD);
  const [upi, setUpi] = useState('');
  const [bank, setBank] = useState('');
  const [walletName, setWalletName] = useState('');
  const [touched, setTouched] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** v6: GET /payments/config — null while loading */
  const [payCfg, setPayCfg] = useState<PaymentConfig | null>(null);
  const [payCfgOffline, setPayCfgOffline] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchPaymentConfig()
      .then((c) => alive && setPayCfg(c?.provider ? c : SIMULATED))
      .catch(() => {
        if (!alive) return;
        setPayCfg(SIMULATED);
        setPayCfgOffline(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // restore draft
  useEffect(() => {
    const d = readJSON<{ address?: Address; email?: string; step?: number }>(KEYS.checkout, {});
    if (d.address) setAddress({ ...EMPTY_ADDRESS, ...d.address });
    if (d.email) setEmail(d.email);
  }, []);
  useEffect(() => {
    writeJSON(KEYS.checkout, { address, email });
  }, [address, email]);

  // prefill empty contact fields from the account / Clerk profile (never overwrite what the shopper typed)
  useEffect(() => {
    const mail = auth.user?.email || auth.contact?.email || '';
    const name = auth.user?.name || auth.contact?.name || '';
    const phone = normalizeMobile(auth.contact?.phone);
    if (mail && !email) setEmail(mail);
    if (name || phone)
      setAddress((a) => ({ ...a, name: a.name || name, phone: a.phone || phone }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.id, auth.contact?.email, auth.contact?.phone]);

  useEffect(() => {
    if (!auth.signedIn) {
      setSaved(null);
      setSelectedId('new');
      return;
    }
    fetchAddresses()
      .then((list) => {
        const arr = Array.isArray(list) ? list : [];
        setSaved(arr);
        const def = arr.find((a) => a.isDefault) || arr[0];
        if (def && def.id != null) {
          setSelectedId(def.id);
          setAddress(def);
        } else setSelectedId('new');
      })
      .catch(() => {
        setSaved([]);
        setSelectedId('new');
      });
  }, [auth.signedIn, auth.accountKey]);

  const pm = options.paymentMethod;
  const methods: PaymentMethodOption[] = quote?.paymentMethods?.length ? quote.paymentMethods : PAYMENT_METHODS;
  const grouped = GROUPS.map((g) => ({ ...g, methods: methods.filter((m) => (m.group || GROUP_OF[m.id] || 'wallet') === g.id) })).filter((g) => g.methods.length);
  const isCard = CARD_METHODS.has(pm);
  const arrival = useDeliveryEstimate({ country: address.country, region: address.region, postalCode: address.postalCode }, options.shipping, step === 2);
  const pointsBalance = quote?.pointsBalance ?? auth.user?.points ?? 0;
  const maxBlocks = useMemo(() => {
    if (!quote || quote.subtotal < POINTS.minOrder) return 0;
    const after = Math.max(quote.subtotal - quote.couponDiscount - quote.bankDiscount, 0);
    return Math.min(Math.floor(pointsBalance / POINTS.block), Math.floor(after / POINTS.blockValue));
  }, [quote, pointsBalance]);
  const blocks = Math.min(Math.floor(options.usePoints / POINTS.block), maxBlocks);

  const addrOk = addressValid(address);
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const razorpay = payCfg?.provider === 'razorpay';
  /** Razorpay's window collects card / UPI / net-banking / wallet details — our own forms are hidden */
  const useRzp = razorpay && pm !== 'cod';
  const modeLabel = payCfg?.mode === 'live' ? 'Live mode' : 'Test mode';
  const cardErr = isCard && !useRzp ? cardErrors(card) : {};
  const payOk = useRzp
    ? true
    : isCard
      ? Object.keys(cardErr).length === 0
      : pm === 'upi'
        ? UPI_RE.test(upi.trim())
        : pm === 'netbanking'
          ? !!bank
          : pm === 'wallet'
            ? !!walletName
            : true;
  const savedInvalid = selectedId !== 'new' && !!saved?.length && !addrOk;
  const quoteErrors = quote?.errors || [];

  const next = () => {
    setTouched(true);
    if (step === 0 && !(addrOk && emailOk)) return;
    if (step === 1 && !payOk) return;
    setTouched(false);
    setStep((s) => Math.min(2, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** Shared success path (simulated, COD and Razorpay). */
  const complete = (order: Order) => {
    if (typeof order.pointsBalance === 'number' && auth.user) auth.patchUser({ points: order.pointsBalance });
    saveLocalOrder(order);
    cart.clear();
    removeKey(KEYS.checkout);
    removeKey(KEYS.checkout + '.options');
    toast.success(`Order #${order.orderId} placed`);
    router.push(`/orders/${order.orderId}`);
  };

  /** 409 from /checkout/order: stock problems are shown per line; anything else inline. */
  const handleConflict = (e: ApiError) => {
    const problems = quote ? parseStockProblems(e.message, quote.lines) : [];
    if (problems.some((p) => p.line)) setStockProblems(problems);
    else setError(`${e.message}. Please review your bag and try again.`);
  };

  const orderBody = (): OrderRequest | null =>
    request ? { ...request, usePoints: blocks * POINTS.block, address, email: email.trim() || undefined } : null;

  /** Step 3 of the Razorpay flow: Razorpay's handler -> POST /checkout/order with the payment proof. */
  const finishRazorpay = async (resp: RazorpaySuccess, rp: RazorpayOrder) => {
    const body = orderBody();
    if (!body) return;
    try {
      const order = await placeOrder({
        ...body,
        payment: {
          provider: 'razorpay',
          razorpayOrderId: resp.razorpay_order_id || rp.razorpayOrderId,
          razorpayPaymentId: resp.razorpay_payment_id,
          razorpaySignature: resp.razorpay_signature,
        },
      });
      complete(order);
    } catch (e) {
      setPlacing(false);
      if (e instanceof ApiError && e.status === 409) return handleConflict(e);
      if (e instanceof ApiError && e.status === 402) return setError(`Payment not completed: ${e.message}. Please pay again.`);
      if (e instanceof ApiError && e.status === 400) return setError(`We could not verify the payment (${e.message}). If money was debited it will be refunded automatically. Reference: ${resp.razorpay_payment_id}.`);
      setError(
        `Payment ${resp.razorpay_payment_id} was received but the order could not be confirmed (${e instanceof Error ? e.message : 'network error'}). Please retry in a moment or contact support with this reference.`,
      );
    }
  };

  /** Steps 1 + 2: create the Razorpay order, load checkout.js, open Razorpay's window. */
  const payWithRazorpay = async () => {
    const body = orderBody();
    if (!body || !payCfg) return;
    let rp: RazorpayOrder;
    try {
      const { address: _a, email: _e, ...quoteBody } = body;
      void _a;
      void _e;
      rp = await createRazorpayOrder(quoteBody);
    } catch (e) {
      setPlacing(false);
      if (e instanceof ApiError && e.status === 409) return handleConflict(e);
      return setError(isOffline(e) ? 'The payment service is unreachable — please try again in a moment.' : e instanceof Error ? e.message : 'Could not start the payment');
    }
    try {
      await loadRazorpayCheckout();
    } catch {
      setPlacing(false);
      return setError('Could not load Razorpay Checkout. Check your connection (or ad-blocker) and try again.');
    }
    const Rzp = window.Razorpay;
    if (!Rzp) {
      setPlacing(false);
      return setError('Razorpay Checkout is unavailable.');
    }
    const mobile = normalizeMobile(address.phone);
    const contact = MOBILE_RE.test(mobile) ? `+91${mobile}` : (address.phone || '').trim() || undefined;
    const rzp = new Rzp({
      key: rp.keyId || payCfg.keyId || '',
      amount: rp.amount,
      currency: rp.currency || 'INR',
      order_id: rp.razorpayOrderId,
      name: rp.merchantName || payCfg.merchantName || 'AURA',
      description: rp.description,
      prefill: { ...rp.prefill, name: rp.prefill?.name || address.name, email: rp.prefill?.email || email.trim() || undefined, contact, method: RZP_METHOD[pm] },
      notes: { address: `${address.city}, ${address.region} ${address.postalCode}`.trim() },
      theme: { color: '#e11d48' },
      handler: (resp) => {
        void finishRazorpay(resp, rp);
      },
      modal: {
        ondismiss: () => {
          setPlacing(false);
          toast('Payment cancelled');
        },
      },
    });
    rzp.on('payment.failed', (r) => setError(`Payment failed: ${r?.error?.description || 'please try another method'}.`));
    rzp.open();
  };

  const submit = async () => {
    if (!request || !quote) return;
    if (quoteErrors.length) {
      setError(quoteErrors.join(' '));
      return;
    }
    setPlacing(true);
    setError(null);
    setStockProblems([]);
    if (useRzp) return payWithRazorpay();
    const body = orderBody()!;
    try {
      let order: Order;
      try {
        order = await placeOrder(body);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          // stock ran out between quote and order: name the failing line(s) inline
          handleConflict(e);
          setPlacing(false);
          return;
        }
        if (e instanceof ApiError && e.status === 402) {
          // the backend switched to Razorpay since this page loaded
          setPlacing(false);
          setError(`${e.message}. Reload the page to pay with Razorpay.`);
          fetchPaymentConfig().then(setPayCfg).catch(() => undefined);
          return;
        }
        if (!isOffline(e)) throw e;
        // API down: keep the demo flow alive with a locally stored order
        order = buildLocalOrder(quote, address, pm, options.shipping, email.trim() || undefined);
        toast.message('API offline — order stored in this browser');
      }
      complete(order);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Could not place the order');
      setPlacing(false);
    }
  };

  if (ready && cart.hydrated && !cart.items.length && !placing) {
    return (
      <div className="container flex flex-col items-center py-24 text-center">
        <ShoppingBag className="h-12 w-12 text-gray-300" aria-hidden />
        <h1 className="mt-4 text-xl font-extrabold">Nothing to check out</h1>
        <p className="mt-1 text-sm text-gray-500">Your bag is empty.</p>
        <Link href="/" className="btn-primary mt-6">
          Go shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="container py-6 md:py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Checkout</h1>
        <Link href="/cart" className="text-sm font-semibold text-gray-500 hover:text-ink">
          <ArrowLeft className="mr-1 inline h-4 w-4" aria-hidden /> Back to bag
        </Link>
      </div>

      {/* progress */}
      <ol className="mb-6 grid grid-cols-3 gap-2" aria-label="Checkout steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500',
              )}
              aria-current={i === step ? 'step' : undefined}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={cn('truncate text-xs font-semibold sm:text-sm', i === step ? 'text-ink' : 'text-gray-400')}>{s}</span>
          </li>
        ))}
      </ol>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-5">
          {/* ------------------------------ step 0: address ------------------------------ */}
          {step === 0 && (
            <section className="card p-5 md:p-6" aria-labelledby="s-address">
              <h2 id="s-address" className="label-xs mb-4 text-ink">
                Delivery address
              </h2>
              {!auth.signedIn && (
                <p className="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  Checking out as a guest.{' '}
                  {auth.enabled ? (
                    <Link href="/sign-in?next=/checkout" className="font-bold text-brand-600 underline">
                      Sign in
                    </Link>
                  ) : (
                    'Sign in'
                  )}{' '}
                  to use saved addresses and points.
                </p>
              )}
              {saved && saved.length > 0 && (
                <div className="mb-5 grid gap-3 sm:grid-cols-2">
                  {saved.map((a, i) => (
                    <AddressCard
                      key={a.id ?? i}
                      a={a}
                      selected={selectedId === a.id}
                      onSelect={() => {
                        setSelectedId(a.id ?? 'new');
                        setAddress(a);
                      }}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId('new');
                      setAddress({ ...EMPTY_ADDRESS, name: auth.user?.name || '' });
                    }}
                    aria-pressed={selectedId === 'new'}
                    className={cn('flex min-h-24 items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm font-semibold', selectedId === 'new' ? 'border-brand-400 text-brand-600' : 'border-gray-200 text-gray-500 hover:border-gray-400')}
                  >
                    <Plus className="h-4 w-4" aria-hidden /> New address
                  </button>
                </div>
              )}
              {savedInvalid && (
                <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">This saved address is missing details (e.g. a 10-digit mobile or 6-digit PIN) — complete them below.</p>
              )}
              {(selectedId === 'new' || !saved?.length || savedInvalid) && <AddressForm value={address} onChange={setAddress} idPrefix="co" showErrors={touched} />}
              <div className="mt-4">
                <label htmlFor="co-email" className="mb-1 block text-xs font-semibold text-gray-600">
                  Email for order updates
                </label>
                <input id="co-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required className={cn('input', touched && !emailOk && 'border-brand-400')} placeholder="you@example.com" />
                {touched && !emailOk && <p className="mt-1 text-xs text-brand-600">Enter a valid email address.</p>}
              </div>
              {touched && !addrOk && <p className="mt-3 text-xs font-medium text-brand-600">Please fix the highlighted address fields.</p>}
            </section>
          )}

          {/* ------------------------- step 1: delivery & payment ------------------------- */}
          {step === 1 && (
            <>
              <section className="card p-5 md:p-6" aria-labelledby="s-delivery">
                <h2 id="s-delivery" className="label-xs mb-4 text-ink">
                  Delivery
                </h2>
                <p className="mb-3 -mt-2 text-xs text-gray-500">
                  Estimates for {[address.postalCode, address.region, address.country].filter(Boolean).join(', ') || 'your address'}.
                </p>
                <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Delivery speed">
                  {(Object.keys(SHIPPING) as ShippingMethod[]).map((id) => (
                    <ShippingOption key={id} id={id} on={options.shipping === id} onSelect={() => setOptions({ shipping: id })} quote={quote} address={address} />
                  ))}
                </div>
              </section>

              <section className="card p-5 md:p-6" aria-labelledby="s-payment">
                <h2 id="s-payment" className="label-xs mb-4 flex flex-wrap items-center justify-between gap-2 text-ink">
                  Payment
                  {payCfg && !razorpay && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-amber-800" data-testid="pay-test-mode">
                      <FlaskConical className="h-3 w-3" aria-hidden /> Test mode — payments are simulated
                    </span>
                  )}
                  {razorpay && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-emerald-700">
                      <ShieldCheck className="h-3 w-3" aria-hidden /> Secured by Razorpay · {modeLabel}
                    </span>
                  )}
                </h2>
                <div className="space-y-4" role="radiogroup" aria-label="Payment method">
                  {grouped.map((g) => (
                    <div key={g.id}>
                      <p className="label-xs mb-1.5">{g.label}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {g.methods.map((m) => {
                          const Icon = PAY_ICONS[m.id] || CreditCard;
                          const on = pm === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              onClick={() => setOptions({ paymentMethod: m.id as PaymentMethodId, bankCard: BANK_OFFER_METHODS.has(m.id) ? options.bankCard : false })}
                              className={cn('flex items-center gap-3 rounded-xl border p-3.5 text-left transition', on ? 'border-brand-600 ring-2 ring-brand-200' : 'border-gray-200 hover:border-gray-400')}
                            >
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-50 text-ink">
                                <Icon className="h-4 w-4" aria-hidden />
                              </span>
                              <span className="min-w-0">
                                <span className="block text-sm font-bold text-ink">{m.label}</span>
                                <span className="block truncate text-xs text-gray-500">{m.note}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {useRzp && (
                  <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-gray-700" data-testid="rzp-note">
                    <p className="flex items-center gap-2 font-semibold text-ink">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden /> Pay securely in Razorpay&apos;s window
                    </p>
                    <p className="mt-1 text-xs text-gray-600">
                      After review, Razorpay opens to collect your {methods.find((m) => m.id === pm)?.label || 'payment'} details (UPI, cards, net banking and wallets are all available there). AURA never sees your card or UPI PIN.
                    </p>
                    {BANK_OFFER_METHODS.has(pm) && (
                      <label className="mt-3 flex items-start gap-2 text-sm">
                        <input type="checkbox" checked={options.bankCard} onChange={(e) => setOptions({ bankCard: e.target.checked })} className="mt-0.5 h-4 w-4 accent-brand-600" />
                        <span>
                          I&apos;ll pay with an {BANK_OFFER.bank} credit card <b className="text-emerald-700">({BANK_OFFER.pct}% instant discount)</b>
                          <span className="block text-xs text-gray-500">{BANK_OFFER.label}</span>
                        </span>
                      </label>
                    )}
                  </div>
                )}
                {isCard && !useRzp && (
                  <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <p className="mb-3 flex items-center gap-2 text-xs text-gray-500">
                      <Lock className="h-3.5 w-3.5" aria-hidden /> Mock card form — validated in your browser only (Luhn check) and never sent anywhere.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label htmlFor="cc-number" className="mb-1 block text-xs font-semibold text-gray-600">
                          Card number
                        </label>
                        <input
                          id="cc-number"
                          inputMode="numeric"
                          autoComplete="off"
                          value={card.number}
                          onChange={(e) => setCard({ ...card, number: e.target.value.replace(/[^\d ]/g, '').slice(0, 19) })}
                          placeholder="4242 4242 4242 4242"
                          className={cn('input font-mono', touched && cardErr.number && 'border-brand-400')}
                        />
                        {touched && cardErr.number && <p className="mt-1 text-xs text-brand-600">{cardErr.number}</p>}
                      </div>
                      <div>
                        <label htmlFor="cc-exp" className="mb-1 block text-xs font-semibold text-gray-600">
                          Expiry
                        </label>
                        <input id="cc-exp" inputMode="numeric" autoComplete="off" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value.slice(0, 5) })} placeholder="MM/YY" className={cn('input font-mono', touched && cardErr.expiry && 'border-brand-400')} />
                        {touched && cardErr.expiry && <p className="mt-1 text-xs text-brand-600">{cardErr.expiry}</p>}
                      </div>
                      <div>
                        <label htmlFor="cc-cvv" className="mb-1 block text-xs font-semibold text-gray-600">
                          CVV
                        </label>
                        <input id="cc-cvv" inputMode="numeric" autoComplete="off" type="password" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="•••" className={cn('input font-mono', touched && cardErr.cvv && 'border-brand-400')} />
                        {touched && cardErr.cvv && <p className="mt-1 text-xs text-brand-600">{cardErr.cvv}</p>}
                      </div>
                      <div className="col-span-2">
                        <label htmlFor="cc-name" className="mb-1 block text-xs font-semibold text-gray-600">
                          Name on card
                        </label>
                        <input id="cc-name" autoComplete="off" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} className={cn('input', touched && cardErr.name && 'border-brand-400')} />
                        {touched && cardErr.name && <p className="mt-1 text-xs text-brand-600">{cardErr.name}</p>}
                      </div>
                    </div>
                    {BANK_OFFER_METHODS.has(pm) ? (
                      <label className="mt-4 flex items-start gap-2 text-sm">
                        <input type="checkbox" checked={options.bankCard} onChange={(e) => setOptions({ bankCard: e.target.checked })} className="mt-0.5 h-4 w-4 accent-brand-600" />
                        <span>
                          Pay with an {BANK_OFFER.bank} credit card <b className="text-emerald-700">({BANK_OFFER.pct}% instant discount)</b>
                          <span className="block text-xs text-gray-500">{BANK_OFFER.label}</span>
                        </span>
                      </label>
                    ) : (
                      <p className="mt-4 text-xs text-gray-500">The {BANK_OFFER.bank} instant discount applies to credit cards only.</p>
                    )}
                  </div>
                )}
                {pm === 'upi' && !useRzp && (
                  <div className="mt-5">
                    <label htmlFor="upi" className="mb-1 block text-xs font-semibold text-gray-600">
                      UPI ID
                    </label>
                    <input id="upi" value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@bank" autoComplete="off" className={cn('input', touched && !payOk && 'border-brand-400')} />
                    <p className="mt-1 text-xs text-gray-500">Format: handle@bank, e.g. sam@okaxis. Test mode: no collect request is sent and nothing is charged.</p>
                    {touched && !payOk && <p className="mt-1 text-xs text-brand-600">Enter a valid UPI id like name@bank.</p>}
                  </div>
                )}
                {pm === 'netbanking' && !useRzp && (
                  <div className="mt-5">
                    <label htmlFor="nb-bank" className="mb-1 block text-xs font-semibold text-gray-600">
                      Choose your bank
                    </label>
                    <select id="nb-bank" value={bank} onChange={(e) => setBank(e.target.value)} className={cn('input', touched && !payOk && 'border-brand-400')}>
                      <option value="">Select a bank</option>
                      {BANKS.map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                    </select>
                    {touched && !payOk && <p className="mt-1 text-xs text-brand-600">Please choose a bank.</p>}
                    <p className="mt-1 text-xs text-gray-500">Test mode: no bank redirect happens and nothing is charged.</p>
                  </div>
                )}
                {pm === 'wallet' && !useRzp && (
                  <div className="mt-5">
                    <label htmlFor="wallet" className="mb-1 block text-xs font-semibold text-gray-600">
                      Wallet
                    </label>
                    <select id="wallet" value={walletName} onChange={(e) => setWalletName(e.target.value)} className={cn('input', touched && !payOk && 'border-brand-400')}>
                      <option value="">Select a wallet</option>
                      {WALLETS.map((w) => (
                        <option key={w}>{w}</option>
                      ))}
                    </select>
                    {touched && !payOk && <p className="mt-1 text-xs text-brand-600">Please choose a wallet.</p>}
                  </div>
                )}
                {pm === 'paypal' && <p className="mt-5 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">You would be redirected to PayPal after review. (Demo — no redirect happens.)</p>}
                {pm === 'cod' && (
                  <p className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="cod-fee-note">
                    Cash on delivery adds a {formatInr(quote?.codFee || COD_FEE)} handling fee. Pay in cash or UPI to the delivery partner.
                  </p>
                )}
              </section>

              <section className="card p-5 md:p-6" aria-labelledby="s-points">
                <h2 id="s-points" className="label-xs mb-1 flex items-center gap-1.5 text-ink">
                  <Gift className="h-3.5 w-3.5" aria-hidden /> Rewards
                </h2>
                {!auth.signedIn ? (
                  <p className="text-sm text-gray-500">
                    {auth.enabled ? (
                      <Link href="/sign-in?next=/checkout" className="font-bold text-brand-600 underline">
                        Sign in to use points
                      </Link>
                    ) : (
                      'Members can use points'
                    )}{' '}
                    — 1 point = ₹1, redeemable {POINTS.block} at a time on orders of {formatPrice(POINTS.minOrder)}+.
                  </p>
                ) : (
                  <div>
                    <p className="text-sm text-gray-500">
                      Balance <b className="text-ink">{pointsBalance} pts</b> · 1 point = ₹1
                      {maxBlocks === 0 && (quote && quote.subtotal < POINTS.minOrder ? ` · redeem on orders of ${formatPrice(POINTS.minOrder)}+` : ' · nothing redeemable on this bag')}
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex items-center rounded border border-gray-200">
                        <button type="button" className="p-2 hover:bg-gray-50 disabled:opacity-40" aria-label="Use fewer points" disabled={blocks <= 0} onClick={() => setOptions({ usePoints: (blocks - 1) * POINTS.block })}>
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-20 text-center text-sm font-bold" aria-live="polite">
                          {blocks * POINTS.block} pts
                        </span>
                        <button type="button" className="p-2 hover:bg-gray-50 disabled:opacity-40" aria-label="Use more points" disabled={blocks >= maxBlocks} onClick={() => setOptions({ usePoints: (blocks + 1) * POINTS.block })}>
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <input type="range" min={0} max={maxBlocks} step={1} value={blocks} onChange={(e) => setOptions({ usePoints: Number(e.target.value) * POINTS.block })} className="flex-1 accent-brand-600" aria-label="Points to use" disabled={maxBlocks === 0} />
                      <span className="text-sm font-bold text-emerald-600">−{formatPrice(blocks * POINTS.blockValue)}</span>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}

          {/* ------------------------------- step 2: review ------------------------------- */}
          {step === 2 && quote && (
            <section className="card p-5 md:p-6" aria-labelledby="s-review">
              <h2 id="s-review" className="label-xs mb-4 text-ink">
                Review your order
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="min-w-0 break-words rounded-lg bg-gray-50 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="label-xs">Deliver to</p>
                    <button type="button" onClick={() => setStep(0)} className="text-xs font-semibold text-brand-600">
                      Edit
                    </button>
                  </div>
                  <p className="mt-1 font-bold text-ink">{address.name}</p>
                  <p className="text-gray-600">
                    {address.line1}
                    {address.line2 ? `, ${address.line2}` : ''}
                    {address.landmark ? ` (near ${address.landmark.replace(/^near\s+/i, '')})` : ''}, {address.city}, {address.region} {isIndia(address.country) ? '– ' : ''}
                    {address.postalCode}, {address.country}
                  </p>
                  <p className="text-xs text-gray-500">
                    {address.phone ? `${isIndia(address.country) ? formatMobile(address.phone) : address.phone} · ` : ''}
                    {email}
                  </p>
                </div>
                <div className="min-w-0 break-words rounded-lg bg-gray-50 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="label-xs">Delivery & payment</p>
                    <button type="button" onClick={() => setStep(1)} className="text-xs font-semibold text-brand-600">
                      Edit
                    </button>
                  </div>
                  <p className="mt-1 font-bold text-ink">{quote.shipping.label}</p>
                  <p className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <Truck className="h-3.5 w-3.5" aria-hidden /> {arrival.estimate ? `Arrives ${windowText(arrival.estimate)}` : 'Estimating arrival…'}
                  </p>
                  <p className="text-gray-600">
                    {methods.find((m) => m.id === pm)?.label}
                    {!useRzp && isCard && card.number ? ` · •••• ${card.number.replace(/\D/g, '').slice(-4)}` : ''}
                    {!useRzp && pm === 'upi' && upi ? ` · ${upi}` : ''}
                    {!useRzp && pm === 'netbanking' && bank ? ` · ${bank}` : ''}
                    {!useRzp && pm === 'wallet' && walletName ? ` · ${walletName}` : ''}
                    {useRzp ? ' · via Razorpay' : pm !== 'cod' ? ' · simulated' : ''}
                    {BANK_OFFER_METHODS.has(pm) && options.bankCard ? ` · ${BANK_OFFER.bank} offer` : ''}
                  </p>
                  {blocks > 0 && <p className="text-xs text-emerald-700">Using {blocks * POINTS.block} points</p>}
                </div>
              </div>
              <ul className="mt-5 divide-y divide-gray-100 border-t border-gray-100">
                {quote.lines.map((l) => {
                  const problem = stockProblems.find((p) => p.line && p.line.id === l.id && (p.line.size || null) === (l.size || null));
                  return (
                    <li key={l.id + (l.size || '')} className={cn('py-3 text-sm', problem && '-mx-2 rounded-lg bg-brand-50/70 px-2 ring-1 ring-brand-200')}>
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={l.image} alt="" className="h-14 w-11 rounded object-cover" />
                        <span className="min-w-0 flex-1 truncate">
                          <b>{l.brand}</b> {l.name}
                          {l.size && <span className="text-gray-500"> · {l.size}</span>} × {l.qty}
                        </span>
                        <span className="font-semibold">{formatPrice(l.lineTotal)}</span>
                      </div>
                      {problem && (
                        <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-brand-700">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span>
                            Not enough stock: {problem.text}.{' '}
                            <Link href="/cart" className="underline">
                              Change quantity or size in your bag
                            </Link>
                            .
                          </span>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              {stockProblems.length > 0 && (
                <div role="alert" className="mt-4 rounded-md border border-brand-200 bg-brand-50 px-3 py-2.5 text-xs text-brand-800" data-testid="stock-error">
                  <p className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> We could not place this order — stock changed while you were checking out.
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {stockProblems.map((p, i) => (
                      <li key={i}>
                        {p.line ? (
                          <>
                            <b>{p.line.name}</b>
                            {p.line.size ? ` (size ${p.line.size})` : ''} — {p.text.replace(/^.*?\)\s*/, '')}
                          </>
                        ) : (
                          p.text
                        )}
                      </li>
                    ))}
                  </ul>
                  <Link href="/cart" className="mt-1.5 inline-block font-bold underline">
                    Fix in bag
                  </Link>
                </div>
              )}
              {quoteErrors.length > 0 && (
                <p role="alert" className="mt-4 rounded-md bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">
                  {quoteErrors.join(' ')}{' '}
                  <Link href="/cart" className="underline">
                    Fix in bag
                  </Link>
                </p>
              )}
              {error && (
                <p role="alert" className="mt-4 rounded-md bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">
                  {error}
                </p>
              )}
              {useRzp ? (
                <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500" data-testid="pay-provider-note">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> <b className="text-ink">Secured by Razorpay</b> · {modeLabel}
                  {payCfg?.mode !== 'live' && ' — use Razorpay test cards / UPI ids; no real money moves.'}
                </p>
              ) : pm === 'cod' ? (
                <p className="mt-4 flex items-center gap-2 text-xs text-gray-500" data-testid="pay-provider-note">
                  <Banknote className="h-3.5 w-3.5" aria-hidden /> Pay {formatInr(quote.total)} in cash (incl. {formatInr(quote.codFee || COD_FEE)} COD fee) when your order arrives.
                </p>
              ) : (
                <p className="mt-4 flex items-center gap-2 text-xs text-amber-800" data-testid="pay-provider-note">
                  <FlaskConical className="h-3.5 w-3.5" aria-hidden /> Test mode — payments are simulated. No money is charged{payCfgOffline ? ' (payment service unreachable)' : ''}.
                </p>
              )}
            </section>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="btn-outline">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back
            </button>
            {step < 2 ? (
              <button type="button" onClick={next} className="btn-primary w-full sm:w-auto">
                Continue <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            ) : (
              <div className="flex w-full flex-col items-stretch gap-1 sm:w-auto sm:items-end">
                <button type="button" onClick={submit} disabled={placing || !quote || loading || !payCfg} className="btn-primary h-12 w-full px-6 text-base sm:w-auto" data-testid="pay-button">
                  {placing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}{' '}
                  {pm === 'cod' ? `Place order · ${quote ? formatInr(quote.total) : ''}` : `Pay ${quote ? formatInr(quote.total) : ''}`}
                </button>
                <span className="text-center text-[11px] text-gray-500 sm:text-right">
                  {pm === 'cod' ? 'Cash on delivery' : razorpay ? `Secured by Razorpay · ${modeLabel}` : 'Test mode — payments are simulated'}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <QuoteSummary quote={quote} loading={loading} offline={offline}>
            <CouponBox quote={quote} coupon={options.coupon} onChange={(code) => setOptions({ coupon: code })} />
          </QuoteSummary>
          {offline && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> The AURA API is offline: your order will be stored in this browser so you can still see the confirmation page.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
