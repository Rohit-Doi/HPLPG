import type {
  Address,
  CartSyncLine,
  CurrencyMeta,
  DeliveryEstimate,
  EventType,
  Evaluation,
  Experiments,
  HistoryResponse,
  HistoryType,
  Insights,
  LandingPage,
  LandingPageRequest,
  MetaOptions,
  OffersResponse,
  Order,
  OrderRequest,
  PaymentConfig,
  RazorpayInstance,
  RazorpayOptions,
  RazorpayOrder,
  PointsResponse,
  Product,
  ProductDetailResponse,
  Profile,
  Quote,
  QuoteRequest,
  ReviewInput,
  ReviewsResponse,
  RichEvent,
  SearchParams,
  SearchResponse,
  ShippingMethod,
  SimilarResponse,
  StockInfo,
  Storefront,
  SuggestResponse,
  TrendingLiveResponse,
  User,
  UserSettings,
  WishlistEntry,
} from './types';
import { packAddress, unpackAddress } from './address';

export * from './types';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** True for network-level failures (API down, CORS, timeout) as opposed to 4xx/5xx responses. */
export function isOffline(err: unknown): boolean {
  return !(err instanceof ApiError) || err.status === 0 || err.status >= 502;
}

/* ------------------------------ auth token plumbing ------------------------------ */

/**
 * Returns the current session token (or null for guests). Registered by the auth layer
 * (`contexts/AuthContext.tsx` wraps Clerk's `getToken()`, which caches and refreshes the short-lived JWT itself).
 * Tokens are never written to storage.
 */
export type TokenGetter = () => Promise<string | null>;

let tokenGetter: TokenGetter | null = null;

export function setAuthTokenGetter(fn: TokenGetter | null) {
  tokenGetter = fn;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!tokenGetter) return {};
  try {
    const t = await tokenGetter();
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}

async function request<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 8000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const auth = await authHeaders();
    let res: Response;
    try {
      res = await fetch(`${API_URL}${path}`, {
        ...rest,
        signal: rest.signal ?? ctrl.signal,
        headers: { 'Content-Type': 'application/json', ...auth, ...(rest.headers || {}) },
      });
    } catch (e) {
      throw new ApiError(e instanceof Error ? e.message : 'network error', 0);
    }
    if (!res.ok) {
      // FastAPI puts the message in { detail }
      let msg = `${res.status} ${res.statusText}`;
      try {
        const body = await res.json();
        if (typeof body?.detail === 'string') msg = body.detail;
        else if (Array.isArray(body?.detail) && body.detail[0]?.msg) msg = body.detail.map((d: { msg: string }) => d.msg).join('; ');
        else if (typeof body?.message === 'string') msg = body.message;
      } catch {
        /* keep status text */
      }
      throw new ApiError(msg, res.status);
    }
    // image paths may contain %27, which Next's static server can't resolve (see fixImagePath)
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text.replace(/%27/gi, "'")) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Fire-and-forget POST (keepalive) with the session token when there is one. Never throws. */
function beacon(path: string, body: unknown) {
  authHeaders()
    .then((auth) =>
      fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(body),
        keepalive: true,
      }),
    )
    .catch(() => undefined);
}

const post = <T,>(path: string, body: unknown, extra: { timeoutMs?: number; signal?: AbortSignal } = {}) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body), ...extra });

/* ------------------------------------ v1 / v2 ------------------------------------ */

export function fetchLandingPage(body: LandingPageRequest, signal?: AbortSignal): Promise<LandingPage> {
  return post<LandingPage>('/api/v1/landing-page', body, { signal, timeoutMs: 12000 });
}

export function fetchProductDetail(id: string): Promise<ProductDetailResponse> {
  return request<ProductDetailResponse>(`/api/v1/products/${encodeURIComponent(id)}`);
}

export function toQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== false) qs.set(k, String(v));
  });
  return qs.toString();
}

export function fetchProducts(params: Record<string, string | number | boolean | undefined>): Promise<{ total: number; items: Product[] }> {
  return request(`/api/v1/products?${toQuery(params)}`);
}

export function fetchMetaOptions(): Promise<MetaOptions> {
  return request<MetaOptions>('/api/v1/meta/options');
}

export function fetchInsights(): Promise<Insights> {
  return request<Insights>('/api/v1/insights', { timeoutMs: 15000 });
}

export function fetchEvaluation(): Promise<Evaluation> {
  return request<Evaluation>('/api/v1/evaluation', { timeoutMs: 15000 });
}

export function fetchExperiments(signal?: AbortSignal): Promise<Experiments> {
  return request<Experiments>('/api/v1/experiments', { timeoutMs: 6000, signal });
}

export function fetchHealth(): Promise<{ status: string; artifactsLoaded: boolean; version: string }> {
  return request('/health', { timeoutMs: 3000 });
}

/** Fire-and-forget interaction logging. Never throws. */
export function sendEvent(e: { visitorId: string; type: EventType; pageId?: string; moduleId?: string; itemId?: string }) {
  if (typeof window === 'undefined' || !e.visitorId) return;
  beacon('/api/v1/events', e);
}

/* --------------------------- v3 / v7: account (Clerk session) --------------------------- */

export function fetchMe(): Promise<User> {
  return request<User>('/api/v1/auth/me', { timeoutMs: 5000 });
}

export function updateProfile(profile: Profile & { onboarded?: boolean; name?: string }): Promise<User> {
  return request<User>('/api/v1/me/profile', { method: 'PUT', body: JSON.stringify(profile) });
}

const unpackList = (r: Address | Address[]): Address | Address[] => (Array.isArray(r) ? r.map(unpackAddress) : r && typeof r === 'object' ? unpackAddress(r) : r);

export function fetchAddresses(): Promise<Address[]> {
  return request<Address[]>('/api/v1/me/addresses').then((list) => (Array.isArray(list) ? list.map(unpackAddress) : list));
}

export function createAddress(a: Address): Promise<Address | Address[]> {
  return post<Address | Address[]>('/api/v1/me/addresses', packAddress(a)).then(unpackList);
}

/** v5: PUT /me/addresses/{id} — same body as POST. */
export function updateAddress(id: number | string, a: Address): Promise<Address | Address[]> {
  const { id: _id, ...body } = packAddress(a);
  void _id;
  return request<Address | Address[]>(`/api/v1/me/addresses/${encodeURIComponent(String(id))}`, { method: 'PUT', body: JSON.stringify(body) }).then(unpackList);
}

export function deleteAddress(id: number | string): Promise<unknown> {
  return request(`/api/v1/me/addresses/${encodeURIComponent(String(id))}`, { method: 'DELETE' });
}

/** Persisted history (works signed-out too, keyed by visitorId). Fire-and-forget, never throws. */
export function sendHistory(e: { visitorId?: string; type: HistoryType; itemId: string }) {
  if (typeof window === 'undefined') return;
  beacon('/api/v1/me/history', e);
}

export function fetchHistory(visitorId?: string): Promise<HistoryResponse> {
  const qs = visitorId ? `?visitorId=${encodeURIComponent(visitorId)}` : '';
  return request<HistoryResponse>(`/api/v1/me/history${qs}`, { timeoutMs: 6000 });
}

/* ----------------------------------- v3: checkout ----------------------------------- */

export function fetchQuote(body: QuoteRequest, signal?: AbortSignal): Promise<Quote> {
  return post<Quote>('/api/v1/checkout/quote', body, { signal, timeoutMs: 6000 });
}

const unpackOrder = (o: Order): Order => (o && o.address ? { ...o, address: unpackAddress(o.address) } : o);

/** Also used as step 3 of the Razorpay flow (body.payment carries the Razorpay ids + signature). */
export function placeOrder(body: OrderRequest): Promise<Order> {
  return post<Order>('/api/v1/checkout/order', { ...body, address: packAddress(body.address) }, { timeoutMs: 15000 }).then(unpackOrder);
}

export function fetchOrders(): Promise<Order[]> {
  return request<Order[]>('/api/v1/me/orders').then((list) => (Array.isArray(list) ? list.map(unpackOrder) : list));
}

export function fetchOrder(id: string, visitorId?: string): Promise<Order> {
  const qs = visitorId ? `?visitorId=${encodeURIComponent(visitorId)}` : '';
  return request<Order>(`/api/v1/orders/${encodeURIComponent(id)}${qs}`).then(unpackOrder);
}

export function fetchStorefront(): Promise<Storefront> {
  return request<Storefront>('/api/v1/storefront', { timeoutMs: 6000 });
}

/* --------------------------------- v4: catalog --------------------------------- */

/** Server-side search with facets. Every listing page uses this; catalog.json is only the fallback. */
export function searchCatalogApi(params: SearchParams, signal?: AbortSignal): Promise<SearchResponse> {
  return request<SearchResponse>(`/api/v1/catalog/search?${toQuery(params as Record<string, string | number | boolean | undefined>)}`, { signal, timeoutMs: 8000 });
}

export function fetchSuggest(q: string, signal?: AbortSignal): Promise<SuggestResponse> {
  return request<SuggestResponse>(`/api/v1/catalog/suggest?q=${encodeURIComponent(q)}`, { signal, timeoutMs: 4000 });
}

/* ------------------------------- v4: product page ------------------------------- */

export function fetchReviews(id: string, params: { sort?: 'recent' | 'helpful'; limit?: number; offset?: number } = {}): Promise<ReviewsResponse> {
  return request<ReviewsResponse>(`/api/v1/products/${encodeURIComponent(id)}/reviews?${toQuery(params)}`, { timeoutMs: 6000 });
}

export function postReview(id: string, body: ReviewInput): Promise<ReviewsResponse> {
  return post<ReviewsResponse>(`/api/v1/products/${encodeURIComponent(id)}/reviews`, body);
}

export function markReviewHelpful(rid: number | string): Promise<{ helpful: number }> {
  return post<{ helpful: number }>(`/api/v1/reviews/${encodeURIComponent(String(rid))}/helpful`, {});
}

export function fetchDeliveryEstimate(
  params: { country?: string; region?: string; postalCode?: string; shipping: ShippingMethod | string },
  signal?: AbortSignal,
): Promise<DeliveryEstimate> {
  return request<DeliveryEstimate>(`/api/v1/delivery/estimate?${toQuery(params)}`, { signal, timeoutMs: 5000 });
}

export function fetchSimilar(id: string, visitorId?: string, limit = 12): Promise<SimilarResponse> {
  return request<SimilarResponse>(`/api/v1/products/${encodeURIComponent(id)}/similar?${toQuery({ visitorId, limit })}`, { timeoutMs: 6000 });
}

/* ----------------------------- v4: wishlist / cart sync ----------------------------- */

export function fetchWishlist(): Promise<WishlistEntry[]> {
  return request<WishlistEntry[]>('/api/v1/me/wishlist', { timeoutMs: 6000 });
}

export function addWishlist(itemId: string, size?: string | null): Promise<unknown> {
  return post('/api/v1/me/wishlist', { itemId, size: size ?? undefined });
}

export function removeWishlist(itemId: string): Promise<unknown> {
  return request(`/api/v1/me/wishlist/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
}

export function fetchServerCart(): Promise<CartSyncLine[]> {
  return request<CartSyncLine[]>('/api/v1/me/cart', { timeoutMs: 6000 });
}

/** PUT /me/cart — `merge: true` on login merges the guest bag into the account bag and returns the result. */
export function putServerCart(items: { itemId: string; size: string | null; qty: number }[], merge: boolean): Promise<CartSyncLine[]> {
  return request<CartSyncLine[]>('/api/v1/me/cart', { method: 'PUT', body: JSON.stringify({ items, merge }), timeoutMs: 6000 });
}

export function deleteServerCartLine(id: string, size?: string | null): Promise<unknown> {
  return request(`/api/v1/me/cart/${encodeURIComponent(id)}?${toQuery({ size: size ?? undefined })}`, { method: 'DELETE' });
}

/* ------------------------- v4: points, offers, settings, reset ------------------------- */

export function fetchPoints(): Promise<PointsResponse> {
  return request<PointsResponse>('/api/v1/me/points', { timeoutMs: 6000 });
}

export function fetchOffers(visitorId?: string): Promise<OffersResponse> {
  return request<OffersResponse>(`/api/v1/me/offers?${toQuery({ visitorId })}`, { timeoutMs: 6000 });
}

export function fetchSettings(): Promise<UserSettings> {
  return request<UserSettings>('/api/v1/me/settings', { timeoutMs: 6000 });
}

export function updateSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  return request<UserSettings>('/api/v1/me/settings', { method: 'PUT', body: JSON.stringify(patch) });
}

/** Clears server-side history + declared preferences for the signed-in user. */
export function resetPersonalization(): Promise<unknown> {
  return request('/api/v1/me/personalization', { method: 'DELETE' });
}

/* ------------------------------- v5: operations ------------------------------- */

export function fetchStock(id: string): Promise<StockInfo> {
  return request<StockInfo>(`/api/v1/products/${encodeURIComponent(id)}/stock`, { timeoutMs: 5000 });
}

export function cancelOrder(id: string, reason?: string, visitorId?: string): Promise<{ status: string }> {
  return post(`/api/v1/orders/${encodeURIComponent(id)}/cancel?${toQuery({ visitorId })}`, { reason: reason || '' });
}

export function returnOrder(id: string, reason?: string, visitorId?: string): Promise<{ status: string; pickup?: string }> {
  return post(`/api/v1/orders/${encodeURIComponent(id)}/return?${toQuery({ visitorId })}`, { reason: reason || '' });
}

export function fetchTrendingLive(windowH = 24, limit = 12): Promise<TrendingLiveResponse> {
  return request<TrendingLiveResponse>(`/api/v1/trending/live?${toQuery({ window_h: windowH, limit })}`, { timeoutMs: 6000 });
}

/** Full JSON export of the signed-in account (GET /me/export). */
export function fetchExport(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>('/api/v1/me/export', { timeoutMs: 15000 });
}

export function deleteAccount(): Promise<{ ok: boolean; message: string }> {
  return request('/api/v1/me', { method: 'DELETE' });
}

/* ------------------------------ v6: India & payments ------------------------------ */

export function fetchIndiaStates(): Promise<{ states: string[] }> {
  return request<{ states: string[] }>('/api/v1/meta/india-states', { timeoutMs: 5000 });
}

export function fetchPaymentConfig(): Promise<PaymentConfig> {
  return request<PaymentConfig>('/api/v1/payments/config', { timeoutMs: 6000 });
}

/** Step 1 of the Razorpay flow: same body as /checkout/quote; returns the Razorpay order (amount in paise). */
export function createRazorpayOrder(body: QuoteRequest): Promise<RazorpayOrder> {
  return post<RazorpayOrder>('/api/v1/payments/razorpay/order', body);
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

export const RAZORPAY_CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let razorpayLoader: Promise<void> | null = null;

/** Step 2 of the Razorpay flow: inject checkout.js once (resolves immediately if window.Razorpay already exists). */
export function loadRazorpayCheckout(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Razorpay needs a browser'));
  if (window.Razorpay) return Promise.resolve();
  if (razorpayLoader) return razorpayLoader;
  razorpayLoader = new Promise<void>((resolve, reject) => {
    let el = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_CHECKOUT_SRC}"]`);
    if (!el) {
      el = document.createElement('script');
      el.src = RAZORPAY_CHECKOUT_SRC;
      el.async = true;
      document.body.appendChild(el);
    }
    el.addEventListener('load', () => (window.Razorpay ? resolve() : reject(new Error('Razorpay Checkout did not initialise'))));
    el.addEventListener('error', () => {
      razorpayLoader = null;
      el?.remove();
      reject(new Error('Could not load Razorpay Checkout'));
    });
  });
  return razorpayLoader;
}

export function fetchCurrencyMeta(): Promise<CurrencyMeta> {
  return request<CurrencyMeta>('/api/v1/meta/currency', { timeoutMs: 5000 });
}

/* --------------------------------- v4: rich events --------------------------------- */

/** Fire-and-forget behavioural event (feeds analytics + retraining). Never throws. */
export function sendRichEvent(e: RichEvent) {
  if (typeof window === 'undefined') return;
  beacon('/api/v1/events/rich', e);
}
