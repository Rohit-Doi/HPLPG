'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import {
  BadgePercent,
  Check,
  Coins,
  Download,
  Gift,
  Heart,
  KeyRound,
  Loader2,
  LogOut,
  MapPin,
  Moon,
  Package,
  Plus,
  RotateCcw,
  Settings2,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Sun,
  Trash2,
  User as UserIcon,
  UserCog,
  WifiOff,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { UserProfile } from '@clerk/nextjs';
import { initials, useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useSession } from '@/contexts/SessionContext';
import { useWishlist } from '@/contexts/WishlistContext';
import {
  createAddress,
  deleteAccount,
  deleteAddress,
  fetchAddresses,
  fetchExport,
  fetchHistory,
  fetchOffers,
  fetchOrders,
  fetchPoints,
  fetchSettings,
  isOffline,
  resetPersonalization,
  updateAddress,
  updateProfile as apiUpdateProfile,
  updateSettings,
} from '@/lib/api';
import { defaultSize, departmentLabel, getProducts, sizesFor } from '@/lib/catalog';
import { ORDER_STEPS, PAYMENT_LABEL, TERMINAL_STATUS, formatDate, formatEta, isTerminal, progressIndex, readLocalOrders, statusLabel } from '@/lib/orders';
import { KEYS, writeJSON } from '@/lib/storage';
import { BANK_OFFER, COUPONS, FREE_SHIPPING_OVER, POINTS } from '@/lib/storefront';
import type { Address, CurrencyCode, HistoryResponse, OffersResponse, Order, PointsResponse, Product, UserSettings, WishlistEntry } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CodeChip } from '@/components/modules/StoreModules';
import { Switch } from '@/components/agent/WhyDrawer';
import ProductCard from '@/components/product/ProductCard';
import ProductRail from '@/components/product/ProductRail';
import { AddressCard, AddressForm, EMPTY_ADDRESS, addressValid } from './AddressBits';
import Onboarding from './Onboarding';
import RequireAuth, { markLeaving } from '@/components/auth/RequireAuth';

export { AddressCard, AddressForm, EMPTY_ADDRESS, addressValid };

const TABS = [
  { id: 'overview', label: 'Overview', icon: UserIcon },
  { id: 'orders', label: 'Orders', icon: Package },
  { id: 'wishlist', label: 'Wishlist', icon: Heart },
  { id: 'addresses', label: 'Addresses', icon: MapPin },
  { id: 'info', label: 'Account info', icon: UserCog },
  { id: 'security', label: 'Security & sign-in', icon: KeyRound },
  { id: 'settings', label: 'Settings', icon: Settings2 },
  { id: 'offers', label: 'Offers & coupons', icon: BadgePercent },
  { id: 'points', label: 'Points', icon: Coins },
  { id: 'personalization', label: 'Personalization', icon: Sparkles },
] as const;
type Tab = (typeof TABS)[number]['id'];
const TAB_IDS = new Set<string>(TABS.map((t) => t.id));
/** old links (`?tab=preferences`) land on the account-info tab */
const ALIASES: Record<string, Tab> = { preferences: 'info', privacy: 'security', password: 'security' };

function Empty({ icon: Icon, title, text, cta }: { icon: typeof Package; title: string; text: string; cta?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-200 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
        <Icon className="h-6 w-6 text-brand-600" aria-hidden />
      </span>
      <p className="mt-3 font-bold text-ink">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-gray-500">{text}</p>
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}

function OfflineNote({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <WifiOff className="h-3.5 w-3.5" aria-hidden /> {text}
    </p>
  );
}

/* --------------------------------- overview --------------------------------- */

function Overview({ go }: { go: (t: Tab) => void }) {
  const { user } = useAuth();
  const wish = useWishlist();
  const { formatPrice } = useCurrency();
  if (!user) return null;
  const blocks = Math.floor(user.points / POINTS.block);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="label-xs">Signed in as</p>
          <p className="mt-1 truncate text-lg font-extrabold text-ink">{user.name}</p>
          <p className="truncate text-xs text-gray-500">{user.email}</p>
        </div>
        <div className="card p-5">
          <p className="label-xs">Member since</p>
          <p className="mt-1 text-lg font-extrabold text-ink">{formatDate(user.memberSince)}</p>
          <p className="text-xs text-gray-500">Signed in with {user.provider === 'password' ? 'email' : user.provider}</p>
        </div>
        <div className="card p-5">
          <p className="label-xs">Points balance</p>
          <p className="mt-1 text-lg font-extrabold text-ink">
            {user.points} <span className="text-sm font-semibold text-gray-500">pts</span>
          </p>
          <p className="text-xs text-gray-500">
            1 point = ₹1 · worth {formatPrice(blocks * POINTS.blockValue)} at checkout
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { t: 'orders' as Tab, title: 'Your orders', text: 'Status, delivery window and tracking.', icon: Package },
          { t: 'wishlist' as Tab, title: 'Wishlist', text: `${wish.ids.length} saved ${wish.ids.length === 1 ? 'item' : 'items'}${wish.synced ? ' · synced to your account' : ''}.`, icon: Heart },
          { t: 'addresses' as Tab, title: 'Addresses', text: 'Saved delivery addresses.', icon: MapPin },
          { t: 'offers' as Tab, title: 'Offers & coupons', text: 'Codes you can use right now.', icon: BadgePercent },
          { t: 'points' as Tab, title: 'Points', text: 'Balance and ledger.', icon: Coins },
          { t: 'settings' as Tab, title: 'Settings', text: 'Notifications, personalization, theme.', icon: Settings2 },
          { t: 'info' as Tab, title: 'Account info', text: 'Name, onboarding answers, sizes and styles.', icon: UserCog },
          { t: 'personalization' as Tab, title: 'Personalization', text: user.onboarded ? 'What the agent knows about you (Level 4).' : 'Complete onboarding to unlock Level 4.', icon: Sparkles },
        ].map((c) => (
          <button key={c.t} type="button" onClick={() => go(c.t)} className="card flex items-center gap-4 p-4 text-left transition hover:shadow-lift">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-50 text-ink">
              <c.icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block font-bold text-ink">{c.title}</span>
              <span className="text-sm text-gray-500">{c.text}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------- orders ---------------------------------- */

function OrdersTab() {
  const { formatPrice } = useCurrency();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchOrders()
      .then((o) => {
        if (!alive) return;
        const ids = new Set(o.map((x) => x.orderId));
        setOrders([...o, ...readLocalOrders().filter((x) => !ids.has(x.orderId))]);
      })
      .catch((e) => {
        if (!alive) return;
        setOffline(isOffline(e));
        setOrders(readLocalOrders());
      });
    return () => {
      alive = false;
    };
  }, []);
  if (!orders) return <div className="skeleton h-40" />;
  return (
    <div className="space-y-4">
      {offline && <OfflineNote text="API offline — showing orders placed from this browser only." />}
      {orders.length === 0 ? (
        <Empty
          icon={Package}
          title="No orders yet"
          text="When you place an order it shows up here with its status and delivery window."
          cta={
            <Link href="/sale" className="btn-primary">
              Shop the sale
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => {
            const step = progressIndex(o);
            const terminal = isTerminal(o.status);
            const cancelled = o.status === 'cancelled';
            const returning = o.status === 'return_requested' || o.status === 'returned';
            return (
              <li key={o.orderId} className={cn('card p-4 sm:p-5', cancelled && 'border-dashed bg-gray-50/60')} data-status={o.status}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-ink">#{o.orderId}</p>
                    <p className="text-xs text-gray-500">
                      Placed {formatDate(o.placedAt || o.createdAt)} · {o.lines?.length || 0} {o.lines?.length === 1 ? 'item' : 'items'} · {PAYMENT_LABEL[o.paymentMethod] || o.paymentMethod}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn('text-lg font-extrabold text-ink', cancelled && 'text-gray-400 line-through')}>{formatPrice(o.total)}</p>
                    <p className="text-xs text-gray-500">
                      {cancelled ? 'Cancelled' : returning ? 'Pick-up within 2 business days' : o.status === 'delivered' ? 'Delivered' : `Arrives by ${formatEta(o.eta)}`}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1" aria-label={`Status: ${statusLabel(o.status)}`}>
                  {ORDER_STEPS.map((s, i) => (
                    <span key={s.id} className={cn('h-1.5 flex-1 rounded-full', i <= step ? (terminal ? 'bg-gray-300' : 'bg-emerald-500') : 'bg-gray-100')} title={s.label} />
                  ))}
                  <span className={cn('ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', TERMINAL_STATUS[o.status]?.cls || (o.status === 'delivered' ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-50 text-brand-700'))}>
                    {statusLabel(o.status)}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
                  {(o.lines || []).slice(0, 6).map((l) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={l.id + (l.size || '')} src={l.image} alt={l.name} className={cn('h-14 w-11 shrink-0 rounded object-cover ring-1 ring-black/5', cancelled && 'opacity-50 grayscale')} />
                  ))}
                  <Link href={`/orders/${o.orderId}`} className="ml-auto shrink-0 text-sm font-semibold text-brand-600 hover:underline">
                    {o.canCancel ? 'Track or cancel' : o.canReturn ? 'Track or return' : terminal ? 'View order' : 'Track order'}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------- wishlist --------------------------------- */

function WishItem({ e }: { e: WishlistEntry }) {
  const wish = useWishlist();
  const cart = useCart();
  const auth = useAuth();
  const { recordCart } = useSession();
  const sizes = sizesFor(e);
  const preferred = auth.user?.profile?.sizes?.[e.department === 'footwear' ? 'shoe' : 'top'];
  const [size, setSize] = useState<string>((e.size && sizes.includes(e.size) ? e.size : preferred && sizes.includes(preferred) ? preferred : defaultSize(e)) || '');
  return (
    <div className="relative flex flex-col">
      <ProductCard product={e} />
      <button type="button" onClick={() => wish.remove(e.id)} aria-label={`Remove ${e.name} from wishlist`} className="absolute right-2.5 top-12 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm">
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="mt-1 flex gap-1.5">
        {sizes.length > 0 && (
          <select aria-label={`Size for ${e.name}`} value={size} onChange={(ev) => setSize(ev.target.value)} className="w-20 rounded-md border border-gray-300 bg-white px-2 text-xs font-bold focus:border-brand-500 focus:outline-none">
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="btn-outline min-w-0 flex-1 px-2 py-2 text-xs font-bold uppercase text-brand-600"
          onClick={() => {
            cart.add(e.id, sizes.length ? size : null);
            recordCart(e.id);
            wish.remove(e.id);
            toast.success(`Moved to bag${sizes.length ? ` (size ${size})` : ''}`);
          }}
        >
          <ShoppingBag className="h-4 w-4" aria-hidden /> Move to bag
        </button>
      </div>
    </div>
  );
}

function WishlistTab() {
  const wish = useWishlist();
  const auth = useAuth();
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        {wish.entries.length} {wish.entries.length === 1 ? 'item' : 'items'}
        {wish.synced ? ' · synced with your account' : auth.offline ? ' · API offline, showing this browser’s list' : ' · stored in this browser'}
      </p>
      {wish.entries.length === 0 ? (
        <Empty
          icon={Heart}
          title="Your wishlist is empty"
          text="Tap the heart on any product to save it here. Signed in, it follows you across devices."
          cta={
            <Link href="/" className="btn-primary">
              Discover styles
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:gap-x-5 xl:grid-cols-4">
          {wish.entries.map((e) => (
            <WishItem key={e.id} e={e} />
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- addresses -------------------------------- */

function AddressesTab() {
  const [list, setList] = useState<Address[] | null>(null);
  const [editing, setEditing] = useState<Address | 'new' | null>(null);
  const [draft, setDraft] = useState<Address>(EMPTY_ADDRESS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const load = useCallback(() => {
    fetchAddresses()
      .then((a) => setList(Array.isArray(a) ? a : []))
      .catch((e) => {
        setList([]);
        setError(isOffline(e) ? 'API offline — addresses cannot be loaded right now.' : e.message);
      });
  }, []);
  useEffect(load, [load]);

  const startNew = () => {
    setEditing('new');
    setDraft(EMPTY_ADDRESS);
    setTried(false);
  };
  const startEdit = (a: Address) => {
    setEditing(a);
    setDraft({ ...EMPTY_ADDRESS, ...a });
    setTried(false);
  };

  /** v5: PUT /me/addresses/{id} edits in place; POST creates. */
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addressValid(draft)) {
      setTried(true);
      return setError('Please fix the highlighted fields.');
    }
    setBusy(true);
    setError(null);
    try {
      const { id: _old, ...body } = draft;
      void _old;
      if (editing && editing !== 'new' && editing.id != null) await updateAddress(editing.id, body);
      else await createAddress(body);
      load();
      setEditing(null);
      setDraft(EMPTY_ADDRESS);
      toast.success(editing === 'new' ? 'Address saved' : 'Address updated');
    } catch (err) {
      setError(isOffline(err) ? 'API offline — the address could not be saved.' : err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const del = async (a: Address) => {
    if (a.id == null) return;
    try {
      await deleteAddress(a.id);
      setList((l) => (l || []).filter((x) => x.id !== a.id));
      toast.success('Address deleted');
    } catch (err) {
      toast.error(isOffline(err) ? 'API offline' : 'Could not delete');
    }
  };

  const makeDefault = async (a: Address) => {
    try {
      const { id, ...body } = a;
      if (id != null) await updateAddress(id, { ...body, isDefault: true });
      else await createAddress({ ...body, isDefault: true });
      load();
      toast.success('Default address updated');
    } catch (err) {
      toast.error(isOffline(err) ? 'API offline' : 'Could not update');
    }
  };

  if (!list) return <div className="skeleton h-40" />;
  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </p>
      )}
      {list.length === 0 && !editing ? (
        <Empty
          icon={MapPin}
          title="No saved addresses"
          text="Add an address to speed up checkout and delivery estimates."
          cta={
            <button type="button" onClick={startNew} className="btn-primary">
              <Plus className="h-4 w-4" aria-hidden /> Add address
            </button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((a, i) => (
            <AddressCard key={a.id ?? i} a={a} onDelete={() => del(a)} onEdit={() => startEdit(a)} onDefault={() => makeDefault(a)} />
          ))}
          {!editing && (
            <button type="button" onClick={startNew} className="flex min-h-28 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 text-sm font-semibold text-gray-500 hover:border-brand-300 hover:text-brand-600">
              <Plus className="h-4 w-4" aria-hidden /> Add address
            </button>
          )}
        </div>
      )}
      {editing && (
        <form onSubmit={save} className="card p-5" noValidate>
          <p className="label-xs mb-4 text-ink">{editing === 'new' ? 'New address' : 'Edit address'}</p>
          <AddressForm value={draft} onChange={setDraft} showErrors={tried} />
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!draft.isDefault} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} className="h-4 w-4 accent-brand-600" /> Make this my default address
          </label>
          <div className="mt-5 flex gap-3">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save address
            </button>
            <button type="button" onClick={() => setEditing(null)} className="btn-outline">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/* -------------------------------- account info -------------------------------- */

function InfoTab({ go }: { go: (t: Tab) => void }) {
  const auth = useAuth();
  const [name, setName] = useState(auth.user?.name || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(auth.user?.name || ''), [auth.user?.name]);

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (n.length < 2) return toast.error('Name is too short');
    setBusy(true);
    try {
      // v5: PUT /me/profile accepts `name` alongside the profile fields and returns the updated user
      const u = await apiUpdateProfile({ ...(auth.user?.profile || {}), name: n });
      auth.patchUser({ ...u, name: u?.name || n });
      toast.success('Name updated');
    } catch (err) {
      if (isOffline(err)) {
        auth.patchUser({ name: n });
        toast.message('API offline — name saved in this browser');
      } else toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={saveName} className="card p-5">
        <p className="label-xs mb-3 text-ink">Your details</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-gray-600">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} className="input mt-1" maxLength={80} />
          </label>
          <label className="text-xs font-semibold text-gray-600">
            Email
            <input value={auth.user?.email || ''} readOnly className="input mt-1 bg-gray-50 text-gray-500" />
          </label>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          {auth.user?.memberSince ? `Member since ${formatDate(auth.user.memberSince)}. ` : ''}Email, phone, password and connected accounts are managed under{' '}
          <button type="button" onClick={() => go('security')} className="font-semibold text-brand-600 underline">
            Security &amp; sign-in
          </button>
          .
        </p>
        <button type="submit" disabled={busy || name.trim() === auth.user?.name} className="btn-primary mt-4">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save name
        </button>
      </form>
      <div>
        <p className="mb-1 text-sm font-bold text-ink">Preferences</p>
        <p className="mb-4 text-sm text-gray-500">Edit the answers from onboarding — shopping for, age, location, departments, styles, sizes. Saving re-personalizes your home page.</p>
        <Onboarding onDone={() => go('personalization')} />
      </div>
    </div>
  );
}

/* ------------------------------ security & sign-in ------------------------------ */

/** Clerk's account manager: email addresses, phone, connected accounts, password, active sessions. */
function SecurityTab() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold text-ink">Security &amp; sign-in</p>
        <p className="mt-1 text-sm text-gray-500">Sign-in is handled by Clerk. Changes here apply to how you sign in to AURA on every device.</p>
      </div>
      <div className="min-w-0 overflow-x-auto" data-testid="clerk-user-profile">
        <UserProfile
          routing="hash"
          appearance={{ elements: { rootBox: 'w-full max-w-full', cardBox: 'w-full max-w-full shadow-none border border-gray-100 rounded-xl' } }}
        />
      </div>
      <p className="text-xs text-gray-400">Looking for “Download my data” or “Delete my account”? They are under Settings → Privacy &amp; data.</p>
    </div>
  );
}

/* ---------------------------------- settings ---------------------------------- */

export function applyTheme(theme: string | null | undefined) {
  if (typeof document === 'undefined') return;
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  writeJSON(KEYS.theme, t);
}

const DEFAULT_SETTINGS: UserSettings = { newsletter: true, smsAlerts: false, personalization: true, currency: 'INR', language: 'en', theme: 'light' };
const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिन्दी' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'de', label: 'Deutsch' },
];

function SettingRow({ title, text, saving, children }: { title: string; text: string; saving: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-gray-50 py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink">{title}</p>
        <p className="text-xs text-gray-500">{text}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" aria-label="Saving" />}
        {children}
      </div>
    </div>
  );
}

/** Confirm dialog for the irreversible account deletion (type DELETE to enable). */
function DeleteAccountDialog({ email, busy, onConfirm, onClose }: { email: string; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);
  const ok = typed.trim().toUpperCase() === 'DELETE';
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="del-title">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={() => !busy && onClose()} />
      <div className="relative w-full max-w-md rounded-t-2xl bg-white p-5 shadow-lift sm:rounded-2xl sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <ShieldAlert className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="del-title" className="text-lg font-extrabold text-ink">
              Delete your account?
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              This permanently removes <b className="text-ink">{email}</b>: profile, addresses, orders, wishlist, reviews, points and history. It cannot be undone.
            </p>
          </div>
        </div>
        <label className="mt-4 block text-xs font-semibold text-gray-600">
          Type <span className="font-mono text-ink">DELETE</span> to confirm
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="input mt-1 font-mono" placeholder="DELETE" />
        </label>
        <p className="mt-2 text-xs text-gray-400">Want a copy first? Use “Download my data” before deleting.</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="btn-outline">
            Keep my account
          </button>
          <button type="button" onClick={onConfirm} disabled={!ok || busy} className="btn-primary" data-testid="confirm-delete">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />} Delete account
          </button>
        </div>
      </div>
    </div>
  );
}

/** "Download my data" (GET /me/export) + "Delete my account" (DELETE /me). */
function PrivacyCard() {
  const auth = useAuth();
  const router = useRouter();
  const cart = useCart();
  const [exporting, setExporting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const download = async () => {
    setExporting(true);
    try {
      const data = await fetchExport();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `aura-export-${(auth.user?.email || 'account').replace(/[^a-z0-9]+/gi, '-')}-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Your data export is downloading');
    } catch (e) {
      toast.error(isOffline(e) ? 'API offline — the export is unavailable right now' : e instanceof Error ? e.message : 'Could not export your data');
    } finally {
      setExporting(false);
    }
  };

  const del = async () => {
    setDeleting(true);
    try {
      // DELETE /me removes our record and the Clerk user; then end the Clerk session locally
      const r = await deleteAccount();
      markLeaving();
      setConfirm(false);
      cart.clear();
      await auth.signOut({ redirectUrl: '/', quiet: true }).catch(() => router.replace('/'));
      toast.success(r?.message || 'Your account has been deleted', { duration: 6000 });
    } catch (e) {
      toast.error(isOffline(e) ? 'API offline — try again later' : e instanceof Error ? e.message : 'Could not delete the account');
      setDeleting(false);
    }
  };

  return (
    <div className="card p-5">
      <p className="label-xs mb-1 text-ink">Privacy &amp; data</p>
      <SettingRow title="Download my data" text="A JSON file with your profile, addresses, orders, wishlist, reviews, points ledger and events (GET /me/export)." saving={exporting}>
        <button type="button" onClick={download} disabled={exporting} className="btn-outline px-3 py-1.5 text-xs" data-testid="export-data">
          <Download className="h-3.5 w-3.5" aria-hidden /> Download
        </button>
      </SettingRow>
      <SettingRow title="Delete my account" text="Erases everything we hold about you and signs you out. This cannot be undone." saving={false}>
        <button type="button" onClick={() => setConfirm(true)} className="btn-outline border-brand-200 px-3 py-1.5 text-xs text-brand-600 hover:border-brand-400" data-testid="delete-account">
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
        </button>
      </SettingRow>
      {confirm && <DeleteAccountDialog email={auth.user?.email || ''} busy={deleting} onConfirm={del} onClose={() => setConfirm(false)} />}
    </div>
  );
}

function SettingsTab() {
  const cur = useCurrency();
  const [s, setS] = useState<UserSettings | null>(null);
  const [offline, setOffline] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSettings()
      .then((r) => {
        if (!alive) return;
        setS({ ...DEFAULT_SETTINGS, ...r });
        applyTheme(r.theme);
      })
      .catch(() => {
        if (!alive) return;
        setOffline(true);
        setS(DEFAULT_SETTINGS);
      });
    return () => {
      alive = false;
    };
  }, []);

  const saveCurrency = async (c: CurrencyCode) => {
    setSaving('currency');
    try {
      await cur.setCurrency(c); // persists to /me/settings for members (+ localStorage)
      setS((prev) => (prev ? { ...prev, currency: c } : prev));
      toast.success(`Prices now shown in ${c}`);
    } catch (e) {
      setOffline(isOffline(e));
      toast.error(isOffline(e) ? 'API offline — currency kept in this browser only' : 'Could not save');
    } finally {
      setSaving(null);
    }
  };

  const save = async (patch: Partial<UserSettings>) => {
    if (!s) return;
    const next = { ...s, ...patch };
    setS(next);
    if (patch.theme) applyTheme(patch.theme);
    const key = Object.keys(patch)[0];
    setSaving(key);
    try {
      const r = await updateSettings(patch);
      setS({ ...next, ...r });
      setOffline(false);
      toast.success('Settings saved');
    } catch (e) {
      setOffline(isOffline(e));
      toast.error(isOffline(e) ? 'API offline — setting kept in this browser only' : 'Could not save');
    } finally {
      setSaving(null);
    }
  };

  if (!s) return <div className="skeleton h-40" />;
  const Row = ({ k, title, text, children }: { k: string; title: string; text: string; children: React.ReactNode }) => (
    <SettingRow title={title} text={text} saving={saving === k}>
      {children}
    </SettingRow>
  );
  return (
    <div className="space-y-4">
      {offline && <OfflineNote text="API offline — settings are shown from defaults and saved in this browser only." />}
      <div className="card p-5">
        <p className="label-xs mb-1 text-ink">Notifications</p>
        <Row k="newsletter" title="Newsletter" text="Weekly edit, sale previews and new arrivals by email.">
          <Switch checked={s.newsletter} onChange={(v) => save({ newsletter: v })} label="Newsletter" />
        </Row>
        <Row k="smsAlerts" title="SMS alerts" text="Order and delivery updates by text message.">
          <Switch checked={s.smsAlerts} onChange={(v) => save({ smsAlerts: v })} label="SMS alerts" />
        </Row>
      </div>
      <div className="card p-5">
        <p className="label-xs mb-1 text-ink">Personalization</p>
        <Row k="personalization" title="Personalized home page" text="Let the agent use your history and answers. Off = popularity-only page.">
          <Switch checked={s.personalization} onChange={(v) => save({ personalization: v })} label="Personalization" />
        </Row>
      </div>
      <div className="card p-5">
        <p className="label-xs mb-1 text-ink">Display</p>
        <Row k="currency" title="Currency" text={`Prices are in Indian rupees (₹)${cur.currency !== 'INR' ? `; shown in ${cur.currency} for reference (₹1,000 ≈ ${cur.formatPrice(1000)})` : ''}. You are always charged in INR.`}>
          <select value={cur.currency} onChange={(e) => saveCurrency(e.target.value as CurrencyCode)} className="input w-auto py-1.5 text-sm" aria-label="Currency" data-testid="currency-select">
            {cur.options.map((c) => (
              <option key={c} value={c}>
                {c} {cur.symbols[c]?.trim()}
              </option>
            ))}
          </select>
        </Row>
        <Row k="language" title="Language" text="Interface language (demo: copy stays in English).">
          <select value={s.language} onChange={(e) => save({ language: e.target.value })} className="input w-auto py-1.5 text-sm" aria-label="Language">
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </Row>
        <Row k="theme" title="Theme" text="Light or dark storefront.">
          <div className="flex rounded-full border border-gray-200 p-0.5" role="radiogroup" aria-label="Theme">
            {(['light', 'dark'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={s.theme === t}
                onClick={() => save({ theme: t })}
                className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition', s.theme === t ? 'bg-ink text-white' : 'text-gray-600 hover:text-ink')}
              >
                {t === 'light' ? <Sun className="h-3.5 w-3.5" aria-hidden /> : <Moon className="h-3.5 w-3.5" aria-hidden />} {t === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </Row>
      </div>
      <PrivacyCard />
    </div>
  );
}

/* ----------------------------------- offers ----------------------------------- */

function OffersTab() {
  const { visitorId } = useSession();
  const { formatPrice } = useCurrency();
  const [data, setData] = useState<OffersResponse | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchOffers(visitorId || undefined)
      .then((r) => alive && setData(r))
      .catch(() => {
        if (!alive) return;
        setOffline(true);
        setData({ coupons: COUPONS.map((c) => ({ ...c, available: true, used: false })), bankOffer: BANK_OFFER, freeShippingOver: FREE_SHIPPING_OVER, points: POINTS });
      });
    return () => {
      alive = false;
    };
  }, [visitorId]);
  if (!data) return <div className="skeleton h-40" />;
  return (
    <div className="space-y-5">
      {offline && <OfflineNote text="API offline — showing the standard coupon list." />}
      <div>
        <p className="mb-3 text-sm font-bold text-ink">Coupons</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.coupons.map((c) => {
            const off = c.used || !c.available;
            return (
              <li key={c.code} className={cn('card relative overflow-hidden p-4', off && 'opacity-60')}>
                <span className="absolute inset-y-0 left-0 w-1 bg-brand-600" aria-hidden />
                <div className="flex flex-wrap items-center justify-between gap-2 pl-2">
                  <CodeChip code={c.code} />
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', c.used ? 'bg-gray-100 text-gray-500' : c.available ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
                    {c.used ? 'Used' : c.available ? 'Available' : 'Not available'}
                  </span>
                </div>
                <p className="mt-2 pl-2 text-sm font-semibold text-ink">{c.label}</p>
                <p className="pl-2 text-xs text-gray-500">
                  {c.min > 0 ? `Min. order ${formatPrice(c.min)}` : 'No minimum'}
                  {c.firstOrderOnly ? ' · first order only' : ''}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
      {data.bankOffer && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="label-xs text-brand-600">Bank offer</p>
            <p className="mt-0.5 text-sm font-bold text-ink">{data.bankOffer.label}</p>
            <p className="text-xs text-gray-500">Tick “{data.bankOffer.bank} card” when paying by credit card at checkout.</p>
          </div>
          <CodeChip code={data.bankOffer.code} />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-4">
          <p className="label-xs">Free delivery</p>
          <p className="mt-1 text-sm text-gray-700">
            Standard delivery is free on orders over <b className="text-ink">{formatPrice(data.freeShippingOver)}</b> (or with FREESHIP).
          </p>
        </div>
        <div className="card p-4">
          <p className="label-xs">Points rules</p>
          <p className="mt-1 text-sm text-gray-700">
            {data.points.text || `Earn ${data.points.perHundred} points per ₹100 · 1 point = ₹1 · redeem ${data.points.block} at a time on orders of ${formatPrice(data.points.minOrder)}+`}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------- points ----------------------------------- */

function PointsTab() {
  const auth = useAuth();
  const { formatPrice } = useCurrency();
  const [data, setData] = useState<PointsResponse | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchPoints()
      .then((r) => {
        if (!alive) return;
        setData(r);
        if (typeof r.balance === 'number') auth.patchUser({ points: r.balance });
      })
      .catch(() => {
        if (!alive) return;
        setOffline(true);
        setData({ balance: auth.user?.points ?? 0, rules: POINTS, ledger: [] });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!data) return <div className="skeleton h-40" />;
  const blocks = Math.floor(data.balance / data.rules.block);
  return (
    <div className="space-y-4">
      {offline && <OfflineNote text="API offline — ledger unavailable, showing the cached balance." />}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-5">
          <p className="label-xs">Balance</p>
          <p className="mt-1 text-2xl font-black text-ink">
            {data.balance} <span className="text-sm font-semibold text-gray-500">pts</span>
          </p>
        </div>
        <div className="card p-5">
          <p className="label-xs">Redeemable now</p>
          <p className="mt-1 text-2xl font-black text-emerald-600">{formatPrice(blocks * data.rules.blockValue)}</p>
          <p className="text-xs text-gray-500">
            {blocks} × {data.rules.block} points
          </p>
        </div>
        <div className="card p-5">
          <p className="label-xs">Earn rate</p>
          <p className="mt-1 text-2xl font-black text-ink">
            {data.rules.perHundred} <span className="text-sm font-semibold text-gray-500">pts / ₹100</span>
          </p>
          <p className="text-xs text-gray-500">1 point = ₹1 · redeem on orders of {formatPrice(data.rules.minOrder)}+</p>
        </div>
      </div>
      <div className="card overflow-hidden">
        <p className="label-xs border-b border-gray-100 px-4 py-3 text-ink">Ledger</p>
        {data.ledger.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">No point movements yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Date</th>
                  <th className="px-4 py-2 font-semibold">Reason</th>
                  <th className="px-4 py-2 font-semibold">Ref</th>
                  <th className="px-4 py-2 text-right font-semibold">Points</th>
                </tr>
              </thead>
              <tbody>
                {[...data.ledger].reverse().map((l, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="whitespace-nowrap px-4 py-2 text-gray-600">{formatDate(l.ts)}</td>
                    <td className="px-4 py-2 text-ink">{l.reason}</td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">{l.ref ? (String(l.ref).startsWith('AU') ? <Link href={`/orders/${l.ref}`} className="underline">{l.ref}</Link> : l.ref) : '—'}</td>
                    <td className={cn('whitespace-nowrap px-4 py-2 text-right font-bold', l.delta >= 0 ? 'text-emerald-600' : 'text-brand-600')}>
                      {l.delta >= 0 ? '+' : ''}
                      {l.delta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ personalization ------------------------------ */

function PersonalizationTab() {
  const { user, refresh } = useAuth();
  const session = useSession();
  const router = useRouter();
  const [hist, setHist] = useState<HistoryResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchHistory(session.visitorId)
      .then((h) => alive && setHist(h))
      .catch(() => {
        if (!alive) return;
        setOffline(true);
        setHist({ viewed: getProducts(session.viewedItems), carted: getProducts(session.cartedItems), purchased: [] });
      });
    return () => {
      alive = false;
    };
  }, [session.visitorId, session.viewedItems, session.cartedItems]);

  const p = user?.profile || {};
  const declared: { label: string; value?: string | null }[] = [
    { label: 'Shopping for', value: p.gender === 'female' ? 'Women' : p.gender === 'male' ? 'Men' : session.declared.gender ? (session.declared.gender === 'female' ? 'Women' : 'Men') : null },
    { label: 'Age group', value: p.ageGroup || session.declared.ageGroup },
    { label: 'Location', value: [p.city, p.region, p.country].filter(Boolean).join(', ') },
    { label: 'Departments', value: (p.preferredDepartments || (session.declared.preferredDepartment ? [session.declared.preferredDepartment] : [])).map(departmentLabel).join(', ') },
    { label: 'Styles', value: p.styles?.join(', ') },
    { label: 'Budget', value: p.budget },
    { label: 'Sizes', value: p.sizes ? Object.entries(p.sizes).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ') : '' },
  ];

  const reset = async () => {
    if (!window.confirm('Reset personalization? This clears your history and declared preferences on the server and in this browser.')) return;
    setBusy(true);
    try {
      session.clearDeclared();
      session.resetVisitor();
      try {
        await resetPersonalization();
        await refresh();
        toast.success('Personalization reset — the agent starts from scratch');
      } catch (e) {
        toast.message(isOffline(e) ? 'API offline — reset applied to this browser only' : 'Server reset failed — local memory cleared');
      }
      router.push('/');
    } finally {
      setBusy(false);
    }
  };

  const Rail = ({ title, items }: { title: string; items: Product[] }) =>
    items.length ? (
      <div>
        <p className="mb-2 text-sm font-bold text-ink">{title}</p>
        <ProductRail products={items.slice(0, 12)} />
      </div>
    ) : null;

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <p className="label-xs mb-3 text-ink">What the agent knows (declared)</p>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {declared.map((d) => (
            <div key={d.label} className="flex justify-between gap-3 border-b border-gray-50 py-1">
              <dt className="text-gray-500">{d.label}</dt>
              <dd className={cn('text-right font-semibold', d.value ? 'text-ink' : 'text-gray-300')}>{d.value || 'unknown'}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-gray-400">
          Signals like device, traffic source, timezone and time of day are read from the browser on every visit and are not stored.
        </p>
      </div>
      {offline && <OfflineNote text="API offline — showing the history stored in this browser." />}
      {hist ? (
        <>
          <Rail title="Recently viewed" items={hist.viewed || []} />
          <Rail title="Added to bag" items={hist.carted || []} />
          <Rail title="Purchased" items={hist.purchased || []} />
          {!hist.viewed?.length && !hist.carted?.length && !hist.purchased?.length && (
            <Empty icon={Sparkles} title="No history yet" text="Browse a few products and the agent will start learning what you like." />
          )}
        </>
      ) : (
        <div className="skeleton h-40" />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
        <div>
          <p className="text-sm font-bold text-ink">Reset personalization</p>
          <p className="text-xs text-gray-500">Forget declared preferences and history (DELETE /me/personalization) — start again as a new visitor.</p>
        </div>
        <button type="button" onClick={reset} disabled={busy} className="btn-outline">
          <RotateCcw className="h-4 w-4" aria-hidden /> Reset
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------- page ----------------------------------- */

function Inner() {
  const auth = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get('tab') || '';
  const tab: Tab = TAB_IDS.has(raw) ? (raw as Tab) : ALIASES[raw] || 'overview';
  const go = (t: Tab) => router.push(t === 'overview' ? '/account' : `/account?tab=${t}`);

  const u = auth.user!;
  const avatar = u.avatar || auth.contact?.imageUrl;
  const signOut = () => {
    markLeaving();
    auth.signOut({ redirectUrl: '/' });
  };

  return (
    <div className="container py-6 md:py-10">
      <div className="mb-6 flex flex-wrap items-center gap-4">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="h-14 w-14 rounded-full object-cover ring-2 ring-brand-100" />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-lg font-black text-white">{initials(u.name, u.email)}</span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold text-ink">{u.name}</h1>
          <p className="truncate text-sm text-gray-500">{u.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => go('points')} className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100">
            <Gift className="mr-1 inline h-3.5 w-3.5" aria-hidden /> {u.points} pts
          </button>
          <button type="button" onClick={signOut} className="btn-outline px-3 py-2 text-xs md:hidden">
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </div>
      </div>

      {auth.offline && <OfflineNote text="The API is unreachable — showing cached account data." />}

      {/* mobile: horizontal tabs */}
      <div className="no-scrollbar -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-gray-100 px-4 md:hidden" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => go(t.id)}
            className={cn('flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition', tab === t.id ? 'border-brand-600 text-ink' : 'border-transparent text-gray-500 hover:text-ink')}
          >
            <t.icon className="h-4 w-4" aria-hidden /> {t.label}
          </button>
        ))}
      </div>

      <div className="md:grid md:grid-cols-[220px_1fr] md:gap-8">
        {/* desktop: left nav */}
        <nav className="hidden md:block" aria-label="Account sections">
          <ul className="sticky top-24 space-y-0.5">
            {TABS.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => go(t.id)}
                  aria-current={tab === t.id ? 'page' : undefined}
                  className={cn('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold transition', tab === t.id ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-50 hover:text-ink')}
                >
                  <t.icon className="h-4 w-4" aria-hidden /> {t.label}
                  {tab === t.id && <Check className="ml-auto h-3.5 w-3.5" aria-hidden />}
                </button>
              </li>
            ))}
            <li className="pt-2">
              <button type="button" onClick={signOut} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:text-brand-600">
                <LogOut className="h-4 w-4" aria-hidden /> Logout
              </button>
            </li>
          </ul>
        </nav>

        <div role="tabpanel" className="min-w-0">
          {tab === 'overview' && <Overview go={go} />}
          {tab === 'orders' && <OrdersTab />}
          {tab === 'wishlist' && <WishlistTab />}
          {tab === 'addresses' && <AddressesTab />}
          {tab === 'info' && <InfoTab go={go} />}
          {tab === 'security' && <SecurityTab />}
          {tab === 'settings' && <SettingsTab />}
          {tab === 'offers' && <OffersTab />}
          {tab === 'points' && <PointsTab />}
          {tab === 'personalization' && <PersonalizationTab />}
        </div>
      </div>
    </div>
  );
}

function Guarded() {
  const params = useSearchParams();
  const raw = params.get('tab') || '';
  const skeleton = (
    <div className="container py-10">
      <div className="skeleton h-64" />
    </div>
  );
  return (
    <RequireAuth next={raw ? `/account?tab=${raw}` : '/account'} fallback={skeleton}>
      <Inner />
    </RequireAuth>
  );
}

export default function AccountClient() {
  return (
    <Suspense
      fallback={
        <div className="container py-10">
          <div className="skeleton h-64" />
        </div>
      }
    >
      <Guarded />
    </Suspense>
  );
}
