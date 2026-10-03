// SSR-safe localStorage helpers.

export const KEYS = {
  visitorId: 'aura.visitorId',
  viewed: 'aura.viewedItems',
  carted: 'aura.cartedItems',
  bag: 'aura.bag',
  wishlist: 'aura.wishlist',
  explain: 'aura.explainMode',
  /** declared preferences from the style quiz: { preferredDepartment?, gender?, ageGroup? } */
  declared: 'aura.declared',
  /** true once the visitor dismissed the style quiz this session */
  quizDismissed: 'aura.quizDismissed',
  /** cached account record `{ clerkId, user }` (refreshed from /auth/me on load; never holds a token) */
  user: 'aura.user',
  /** Clerk user ids already sent to /welcome once after their first sign-in */
  welcomed: 'aura.welcomed',
  /** orders placed from this browser while the API was offline (demo fallback) */
  localOrders: 'aura.localOrders',
  /** checkout draft (address / delivery / payment) so a refresh does not lose progress */
  checkout: 'aura.checkout',
  /** "light" | "dark" — mirrors /me/settings.theme so the theme applies before the API answers */
  theme: 'aura.theme',
  /** display currency (INR default | USD | EUR | GBP | AED) — mirrors /me/settings.currency for members */
  currency: 'aura.currency',
} as const;

export function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode – ignore */
  }
}

export function removeKey(key: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
