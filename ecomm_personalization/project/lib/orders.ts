import { KEYS, readJSON, writeJSON } from './storage';
import type { Address, Order, OrderStatus, PaymentMethodId, Quote, ShippingMethod } from './types';

export const ORDER_STEPS: { id: OrderStatus; label: string }[] = [
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'packed', label: 'Packed' },
  { id: 'shipped', label: 'Shipped' },
  { id: 'out_for_delivery', label: 'Out for delivery' },
  { id: 'delivered', label: 'Delivered' },
];

export function orderStepIndex(status: string) {
  const i = ORDER_STEPS.findIndex((s) => s.id === status);
  return i < 0 ? 0 : i;
}

/** v5: terminal states that are not part of the 5-step delivery progression. */
export const TERMINAL_STATUS: Record<string, { label: string; cls: string }> = {
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-600' },
  return_requested: { label: 'Return requested', cls: 'bg-amber-50 text-amber-800' },
  returned: { label: 'Returned', cls: 'bg-gray-100 text-gray-600' },
};

export function isTerminal(status: string) {
  return status in TERMINAL_STATUS;
}

export function statusLabel(status: string) {
  return TERMINAL_STATUS[status]?.label || ORDER_STEPS.find((s) => s.id === status)?.label || status.replace(/_/g, ' ');
}

/** Furthest step marked done by the API timeline (falls back to the status index). */
export function progressIndex(o: { status: string; timeline?: { status: string; done?: boolean }[] }) {
  if (isTerminal(o.status)) {
    // show how far the parcel got before the cancel / return event
    const doneSteps = (o.timeline || []).filter((t) => t.done);
    return doneSteps.length ? Math.max(...doneSteps.map((t) => orderStepIndex(t.status))) : 0;
  }
  const tl = (o.timeline || []).filter((t) => t.done !== undefined);
  if (tl.length) {
    const done = tl.filter((t) => t.done).map((t) => orderStepIndex(t.status));
    return done.length ? Math.max(...done) : 0;
  }
  return orderStepIndex(o.status);
}

/** Orders placed from this browser while the API was offline (demo fallback). */
export function readLocalOrders(): Order[] {
  return readJSON<Order[]>(KEYS.localOrders, []);
}

export function saveLocalOrder(o: Order) {
  const list = readLocalOrders().filter((x) => x.orderId !== o.orderId);
  writeJSON(KEYS.localOrders, [o, ...list].slice(0, 20));
}

export function getLocalOrder(id: string): Order | undefined {
  return readLocalOrders().find((o) => o.orderId === id);
}

/** Build an order object from a (local) quote — same shape as POST /checkout/order. */
export function buildLocalOrder(q: Quote, address: Address, paymentMethod: PaymentMethodId, shipping: ShippingMethod, email?: string): Order {
  const now = Math.floor(Date.now() / 1000);
  const d = new Date();
  const yymmdd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const hex = Array.from({ length: 6 }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');
  return {
    ...q,
    orderId: `AU${yymmdd}${hex}`,
    status: 'confirmed',
    eta: now + (shipping === 'express' ? 2 : 5) * 86400,
    placedAt: now,
    createdAt: now,
    address,
    paymentMethod,
    payment: paymentMethod === 'cod' ? { provider: 'cod', mode: 'cash', status: 'pay_on_delivery' } : { provider: 'simulated', mode: 'simulated', status: 'simulated' },
    email: email || null,
    timeline: [{ status: 'confirmed', ts: now }],
    pointsBalance: Math.max(0, (q.pointsBalance || 0) - q.pointsUsed) + q.pointsEarned,
    offline: true,
  };
}

/** Human ETA from unix seconds. */
export function formatEta(eta?: number | null): string {
  if (!eta) return '—';
  const d = new Date(eta * 1000);
  return d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatDate(ts?: number | string | null): string {
  if (!ts) return '—';
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

export const PAYMENT_LABEL: Record<string, string> = {
  card: 'Credit / debit card',
  credit_card: 'Credit card',
  debit_card: 'Debit card',
  upi: 'UPI',
  netbanking: 'Net banking',
  wallet: 'Wallet',
  paypal: 'PayPal',
  cod: 'Cash on delivery',
};

/** "Arrives Tue, Oct 6 – Thu, Oct 8" from unix seconds. */
export function formatWindow(earliest?: number | null, latest?: number | null): string {
  if (!earliest && !latest) return '—';
  if (!earliest || !latest || Math.abs(latest - earliest) < 3600) return formatEta(latest || earliest);
  return `${formatEta(earliest)} – ${formatEta(latest)}`;
}
