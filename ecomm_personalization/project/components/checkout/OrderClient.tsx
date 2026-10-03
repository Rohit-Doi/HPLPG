'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Ban, Banknote, Check, CheckCircle2, FlaskConical, Gift, ShieldCheck, Loader2, MapPin, Package, PackageCheck, RotateCcw, Truck, Undo2, WifiOff, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useSession } from '@/contexts/SessionContext';
import { ApiError, cancelOrder, fetchOrder, isOffline, returnOrder } from '@/lib/api';
import { ORDER_STEPS, PAYMENT_LABEL, TERMINAL_STATUS, formatDate, formatEta, getLocalOrder, isTerminal, progressIndex, saveLocalOrder, statusLabel } from '@/lib/orders';
import { useDeliveryEstimate, windowText } from '@/components/product/DeliveryEstimate';
import type { Order } from '@/lib/types';
import { formatMobile, isIndia } from '@/lib/address';
import { cn } from '@/lib/utils';

const STEP_ICONS = [CheckCircle2, Package, Truck, Truck, PackageCheck];

/** 5-step progress (confirmed → packed → shipped → out for delivery → delivered) driven by the API timeline. */
export function OrderTimeline({ order }: { order: Pick<Order, 'status' | 'eta' | 'timeline'> }) {
  const cur = progressIndex(order);
  const terminal = isTerminal(order.status);
  const tsFor = (id: string) => order.timeline?.find((t) => t.status === id)?.ts;
  return (
    <ol className={cn('grid grid-cols-5 gap-0.5 sm:gap-1', terminal && 'opacity-60')} aria-label="Order progress">
      {ORDER_STEPS.map((s, i) => {
        const Icon = STEP_ICONS[i];
        const done = terminal ? i <= cur : i < cur;
        const active = !terminal && i === cur;
        const ts = tsFor(s.id);
        return (
          <li key={s.id} className="relative flex flex-col items-center text-center">
            {i > 0 && <span className={cn('absolute left-[-50%] right-[50%] top-4 h-0.5', i <= cur ? (terminal ? 'bg-gray-400' : 'bg-emerald-500') : 'bg-gray-200')} aria-hidden />}
            <span
              className={cn(
                'relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2',
                done
                  ? terminal
                    ? 'border-gray-400 bg-gray-400 text-white'
                    : 'border-emerald-500 bg-emerald-500 text-white'
                  : active
                    ? 'border-emerald-500 bg-white text-emerald-600'
                    : 'border-gray-200 bg-white text-gray-300',
              )}
              aria-current={active ? 'step' : undefined}
            >
              {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
            </span>
            <span className={cn('mt-2 text-[10px] font-bold leading-tight sm:text-xs', active || done ? 'text-ink' : 'text-gray-400')}>{s.label}</span>
            {ts && !terminal && (done || active) ? (
              <span className="text-[10px] text-gray-400">{formatEta(ts)}</span>
            ) : s.id === 'delivered' && order.eta && !terminal ? (
              <span className="text-[10px] text-gray-400">by {formatEta(order.eta)}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Small modal with an optional reason — used for cancel and return. */
function ReasonDialog({
  title,
  text,
  confirmLabel,
  reasons,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  reasons: string[];
  busy: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState(reasons[0] || '');
  const [other, setOther] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);
  const value = reason === 'Other' ? other.trim() : reason;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="reason-title">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={() => !busy && onClose()} />
      <div className="relative w-full max-w-md rounded-t-2xl bg-white p-5 shadow-lift sm:rounded-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="reason-title" className="text-lg font-extrabold text-ink">
              {title}
            </h2>
            <p className="mt-1 text-sm text-gray-500">{text}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <fieldset className="mt-4">
          <legend className="label-xs mb-2 text-ink">Reason (optional)</legend>
          <div className="space-y-1.5">
            {[...reasons, 'Other'].map((r) => (
              <label key={r} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm', reason === r ? 'border-brand-600 bg-brand-50' : 'border-gray-200 hover:border-gray-400')}>
                <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-brand-600" />
                {r}
              </label>
            ))}
          </div>
          {reason === 'Other' && <textarea value={other} onChange={(e) => setOther(e.target.value.slice(0, 240))} rows={2} placeholder="Tell us more" className="input mt-2 resize-none" />}
        </fieldset>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="btn-outline">
            Keep order
          </button>
          <button type="button" onClick={() => onConfirm(value)} disabled={busy} className="btn-primary">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const CANCEL_REASONS = ['Ordered by mistake', 'Found a better price', 'Delivery takes too long', 'Changed my mind'];
const RETURN_REASONS = ['Wrong size or fit', 'Not as described', 'Damaged or defective', 'Changed my mind'];

export default function OrderClient({ id }: { id: string }) {
  const session = useSession();
  const auth = useAuth();
  const router = useRouter();
  const { formatPrice } = useCurrency();
  const [order, setOrder] = useState<Order | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'offline'>('loading');
  const [dialog, setDialog] = useState<'cancel' | 'return' | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickup, setPickup] = useState<string | null>(null);

  const load = (silent = false) => {
    if (!silent) setState('loading');
    return fetchOrder(id, session.visitorId)
      .then((o) => {
        setOrder(o);
        setState('ok');
        return o;
      })
      .catch((e) => {
        // guests may only open their own orders (by visitorId); anything else needs a sign-in
        if (!auth.signedIn && auth.enabled && e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404)) {
          router.replace(`/sign-in?next=${encodeURIComponent(`/orders/${id}`)}`);
          return null;
        }
        setState(isOffline(e) ? 'offline' : 'missing');
        return null;
      });
  };

  useEffect(() => {
    if (!session.ready || !auth.ready) return;
    let alive = true;
    const local = getLocalOrder(id);
    // orders stored offline stay local; anything else is always refreshed (status is time-driven)
    if (local?.offline) {
      setOrder(local);
      setState('ok');
      return;
    }
    fetchOrder(id, session.visitorId)
      .then((o) => {
        if (!alive) return;
        setOrder(o);
        setState('ok');
      })
      .catch((e) => {
        if (!alive) return;
        if (local) {
          setOrder(local);
          setState('ok');
          return;
        }
        if (!auth.signedIn && auth.enabled && e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404)) {
          router.replace(`/sign-in?next=${encodeURIComponent(`/orders/${id}`)}`);
          return;
        }
        setState(isOffline(e) ? 'offline' : 'missing');
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session.ready, session.visitorId, auth.ready]);

  const win = useDeliveryEstimate(
    { country: order?.address?.country, region: order?.address?.region, postalCode: order?.address?.postalCode },
    order?.shipping?.id || 'standard',
    !!order && order.status !== 'delivered' && !isTerminal(order.status),
  );

  const doCancel = async (reason: string) => {
    if (!order) return;
    setBusy(true);
    try {
      await cancelOrder(order.orderId, reason, session.visitorId || undefined);
      const fresh = await load(true);
      if (fresh) saveLocalOrder(fresh);
      if (auth.signedIn) auth.refresh();
      setDialog(null);
      toast.success('Order cancelled — stock released and points reversed');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : isOffline(e) ? 'API offline — try again later' : 'Could not cancel the order');
    } finally {
      setBusy(false);
    }
  };

  const doReturn = async (reason: string) => {
    if (!order) return;
    setBusy(true);
    try {
      const r = await returnOrder(order.orderId, reason, session.visitorId || undefined);
      setPickup(r?.pickup || 'A courier will collect the parcel; the refund follows once it is checked.');
      const fresh = await load(true);
      if (fresh) saveLocalOrder(fresh);
      setDialog(null);
      toast.success('Return requested');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : isOffline(e) ? 'API offline — try again later' : 'Could not request a return');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'loading')
    return (
      <div className="container max-w-4xl py-10">
        <div className="skeleton h-10 w-72" />
        <div className="skeleton mt-6 h-64" />
      </div>
    );

  if (state !== 'ok' || !order)
    return (
      <div className="container flex flex-col items-center py-24 text-center">
        {state === 'offline' ? <WifiOff className="h-12 w-12 text-amber-500" aria-hidden /> : <Package className="h-12 w-12 text-gray-300" aria-hidden />}
        <h1 className="mt-4 text-xl font-extrabold">{state === 'offline' ? 'The API is unreachable' : 'Order not found'}</h1>
        <p className="mt-1 max-w-sm text-sm text-gray-500">
          {state === 'offline' ? `We could not load order #${id} right now. Try again when the AURA API is back.` : 'This order may belong to another account or visitor.'}
        </p>
        <Link href="/account?tab=orders" className="btn-primary mt-6">
          Your orders
        </Link>
      </div>
    );

  const addr = order.address;
  const terminal = isTerminal(order.status);
  const cancelled = order.status === 'cancelled';
  const returning = order.status === 'return_requested' || order.status === 'returned';
  const event = order.timeline?.filter((t) => t.status === order.status).slice(-1)[0];
  const delivered = order.status === 'delivered';

  return (
    <div className="container max-w-4xl py-8 md:py-12">
      <div className="flex flex-col items-center text-center">
        <span className={cn('flex h-16 w-16 items-center justify-center rounded-full', cancelled ? 'bg-gray-100' : returning ? 'bg-amber-50' : 'bg-emerald-50')}>
          {cancelled ? <Ban className="h-9 w-9 text-gray-500" aria-hidden /> : returning ? <Undo2 className="h-9 w-9 text-amber-600" aria-hidden /> : <CheckCircle2 className="h-9 w-9 text-emerald-500" aria-hidden />}
        </span>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-ink md:text-3xl" data-testid="order-title">
          {cancelled ? 'This order was cancelled' : returning ? 'Return requested' : delivered ? 'Delivered — enjoy your order' : `Thank you — your order is ${statusLabel(order.status).toLowerCase()}`}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Order <b className="font-mono text-ink">#{order.orderId}</b> · placed {formatDate(order.placedAt || order.createdAt)}
          {terminal ? (
            event?.ts ? <> · {statusLabel(order.status).toLowerCase()} {formatDate(event.ts)}</> : null
          ) : delivered ? (
            ' · delivered'
          ) : win.estimate ? (
            <>
              {' '}
              · arrives <b className="text-ink">{windowText(win.estimate)}</b>
            </>
          ) : (
            <>
              {' '}
              · arriving by <b className="text-ink">{formatEta(order.eta)}</b>
            </>
          )}
        </p>
        {order.email && !terminal && <p className="text-xs text-gray-400">{order.offline ? `A confirmation will be sent to ${order.email} once the store is back online.` : `A confirmation has been sent to ${order.email} (or written to the store's outbox log when email is not configured).`}</p>}
        {order.offline && (
          <p className="mt-3 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <WifiOff className="h-3.5 w-3.5" aria-hidden /> Placed while the API was offline — stored in this browser only.
          </p>
        )}
      </div>

      {cancelled && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700" role="status" data-testid="order-cancelled">
          <p className="flex items-center gap-2 font-bold text-ink">
            <Ban className="h-4 w-4 text-gray-500" aria-hidden /> Cancelled{event?.ts ? ` on ${formatDate(event.ts)}` : ''}
          </p>
          <p className="mt-1">
            {event?.reason ? (
              <>
                Reason: <i>{event.reason}</i>.{' '}
              </>
            ) : null}
            {order.payment?.provider === 'razorpay' ? 'The Razorpay payment will be refunded to the original method.' : 'Nothing was charged.'} Items went back into stock
            {order.pointsEarned > 0 || order.pointsUsed > 0 ? ' and the points movement for this order was reversed' : ''}.
          </p>
        </div>
      )}
      {returning && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status" data-testid="order-return">
          <p className="flex items-center gap-2 font-bold">
            <Undo2 className="h-4 w-4" aria-hidden /> {statusLabel(order.status)}
            {event?.ts ? ` · ${formatDate(event.ts)}` : ''}
          </p>
          <p className="mt-1">{pickup || 'A courier will collect the parcel within 2 business days; refund to the original method within 5 days of pickup.'}</p>
          {event?.reason && (
            <p className="mt-1 text-xs opacity-80">
              Reason: <i>{event.reason}</i>
            </p>
          )}
        </div>
      )}

      <section className="card mt-8 p-5 sm:p-6" aria-labelledby="track">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 id="track" className="label-xs text-ink">
            Track order
          </h2>
          <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide', TERMINAL_STATUS[order.status]?.cls || (delivered ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-50 text-brand-700'))} data-testid="order-status">
            {statusLabel(order.status)}
          </span>
        </div>
        <OrderTimeline order={order} />
        {(order.canCancel || order.canReturn) && !order.offline && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-500">
              {order.canCancel ? 'You can cancel until the parcel ships. Stock is released and points are reversed straight away.' : 'Delivered — returns are free within 30 days of delivery.'}
            </p>
            <div className="flex gap-2">
              {order.canCancel && (
                <button type="button" onClick={() => setDialog('cancel')} className="btn-outline text-brand-600" data-testid="cancel-order">
                  <Ban className="h-4 w-4" aria-hidden /> Cancel order
                </button>
              )}
              {order.canReturn && (
                <button type="button" onClick={() => setDialog('return')} className="btn-outline" data-testid="request-return">
                  <RotateCcw className="h-4 w-4" aria-hidden /> Request return
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="card min-w-0 p-5 sm:p-6">
          <h2 className="label-xs mb-3 text-ink">Items ({order.lines.length})</h2>
          <ul className="divide-y divide-gray-100">
            {order.lines.map((l) => (
              <li key={l.id + (l.size || '')} className={cn('flex items-center gap-3 py-3 text-sm', cancelled && 'opacity-60')}>
                <Link href={`/product/${l.id}`} className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={l.image} alt={l.name} className="h-16 w-12 rounded object-cover ring-1 ring-black/5" />
                </Link>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink">{l.brand}</span>
                  <span className="block truncate text-gray-500">{l.name}</span>
                  <span className="text-xs text-gray-400">
                    {l.size ? `Size ${l.size} · ` : ''}Qty {l.qty}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-bold">{formatPrice(l.lineTotal)}</span>
                  {l.compareAt != null && l.compareAt > l.unitPrice && <span className="text-xs text-gray-400 line-through">{formatPrice(l.compareAt * l.qty)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="min-w-0 space-y-6">
          <section className="card p-5">
            <h2 className="label-xs mb-3 text-ink">Payment summary</h2>
            <dl className="space-y-1.5 text-sm">
              <Row k="Subtotal" v={formatPrice(order.subtotal)} />
              {order.itemSavings > 0 && <Row k="Item savings" v={`−${formatPrice(order.itemSavings)}`} green />}
              {order.coupon && <Row k={`Coupon ${order.coupon.code}`} v={`−${formatPrice(order.couponDiscount)}`} green />}
              {order.bankDiscount > 0 && <Row k="Bank discount" v={`−${formatPrice(order.bankDiscount)}`} green />}
              {order.pointsDiscount > 0 && <Row k={`Points (${order.pointsUsed})`} v={`−${formatPrice(order.pointsDiscount)}`} green />}
              <Row k={`Delivery · ${order.shipping?.label || ''}`} v={order.shipping?.cost ? formatPrice(order.shipping.cost) : 'FREE'} green={!order.shipping?.cost} />
              {order.codFee > 0 && <Row k="COD fee" v={formatPrice(order.codFee)} />}
              <div className={cn('flex justify-between border-t border-gray-100 pt-2 text-base font-extrabold', cancelled && 'text-gray-400 line-through')}>
                <dt>Total</dt>
                <dd>{formatPrice(order.total)}</dd>
              </div>
            </dl>
            <PaymentLine order={order} cancelled={cancelled} />
            {order.pointsEarned > 0 && !cancelled && (
              <p className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800">
                <Gift className="h-3.5 w-3.5" aria-hidden /> You earned {order.pointsEarned} points
                {typeof order.pointsBalance === 'number' && auth.signedIn ? ` · balance ${order.pointsBalance}` : !auth.signedIn ? ' — sign in to keep them' : ''}
              </p>
            )}
          </section>
          <section className="card p-5">
            <h2 className="label-xs mb-3 flex items-center gap-1.5 text-ink">
              <MapPin className="h-3.5 w-3.5" aria-hidden /> Delivery address
            </h2>
            <p className="text-sm text-gray-700">
              <b className="text-ink">{addr.name}</b>
              <br />
              {addr.line1}
              {addr.line2 ? `, ${addr.line2}` : ''}
              {addr.landmark ? ` (near ${addr.landmark.replace(/^near\s+/i, '')})` : ''}
              <br />
              {addr.city}, {addr.region} {isIndia(addr.country) ? '– ' : ''}
              {addr.postalCode}
              <br />
              {addr.country}
              {addr.phone ? ` · ${isIndia(addr.country) ? formatMobile(addr.phone) : addr.phone}` : ''}
              {addr.addressType ? ` · ${addr.addressType}` : ''}
            </p>
          </section>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn-primary">
          Continue shopping
        </Link>
        {(auth.signedIn || auth.enabled) && (
          <Link href={auth.signedIn ? '/account?tab=orders' : '/sign-up'} className="btn-outline">
            {auth.signedIn ? 'All orders' : 'Create an account to track orders'}
          </Link>
        )}
      </div>

      {dialog === 'cancel' && (
        <ReasonDialog
          title="Cancel this order?"
          text={`Order #${order.orderId} has not shipped yet. Cancelling releases the stock and reverses any points.`}
          confirmLabel="Cancel order"
          reasons={CANCEL_REASONS}
          busy={busy}
          onConfirm={doCancel}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'return' && (
        <ReasonDialog
          title="Request a return"
          text="Free pick-up within 30 days of delivery. Refund to the original payment method once the parcel is checked."
          confirmLabel="Request return"
          reasons={RETURN_REASONS}
          busy={busy}
          onConfirm={doReturn}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function Row({ k, v, green }: { k: string; v: string; green?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-600">{k}</dt>
      <dd className={cn('font-semibold', green && 'text-emerald-600')}>{v}</dd>
    </div>
  );
}

/** v6: "Paid via Razorpay · pay_xxx" / "Cash on delivery" / "Simulated payment". */
function PaymentLine({ order, cancelled }: { order: Order; cancelled: boolean }) {
  const pay = order.payment;
  const method = PAYMENT_LABEL[order.paymentMethod] || order.paymentMethod;
  const provider = pay?.provider || (order.paymentMethod === 'cod' ? 'cod' : 'simulated');
  if (provider === 'razorpay') {
    return (
      <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-gray-600" data-testid="order-payment">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
        <span>
          {cancelled ? 'Refund to' : 'Paid via'} <b className="text-ink">Razorpay</b>
          {pay?.razorpayPaymentId ? <> · <code className="font-mono text-[11px]">{pay.razorpayPaymentId}</code></> : null}
          {' · '}
          {method}
          {pay?.mode && pay.mode !== 'live' ? ` · ${pay.mode} mode` : ''}
          {pay?.status ? ` · ${pay.status}` : ''}
        </span>
      </p>
    );
  }
  if (provider === 'cod') {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-600" data-testid="order-payment">
        <Banknote className="h-3.5 w-3.5" aria-hidden /> <b className="text-ink">Cash on delivery</b>
        {cancelled ? ' · nothing to pay' : ' · pay when your order arrives'}
      </p>
    );
  }
  return (
    <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-600" data-testid="order-payment">
      <FlaskConical className="h-3.5 w-3.5 text-amber-600" aria-hidden /> <b className="text-ink">Simulated payment</b> · {method} (test mode — no money was charged)
    </p>
  );
}
