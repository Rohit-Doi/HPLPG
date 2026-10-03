'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useSession } from './SessionContext';
import { addWishlist, fetchWishlist, removeWishlist, sendRichEvent } from '@/lib/api';
import { fixImagePath, getProduct } from '@/lib/catalog';
import { KEYS, readJSON, writeJSON } from '@/lib/storage';
import type { Product, WishlistEntry } from '@/lib/types';

export type WishLine = { id: string; size?: string | null; addedAt?: number };

type WishlistState = {
  ids: string[];
  /** wishlist entries with product data (catalog.json or the server copy) */
  entries: WishlistEntry[];
  products: Product[];
  /** true when the list mirrors GET /me/wishlist (signed in + API reachable) */
  synced: boolean;
  has: (id: string) => boolean;
  /** returns the new state (true = now on the wishlist) */
  toggle: (id: string, size?: string | null) => boolean;
  remove: (id: string) => void;
};

const WishlistContext = createContext<WishlistState | null>(null);

/** localStorage kept the old string[] shape; accept both. */
function readLocal(): WishLine[] {
  const raw = readJSON<unknown>(KEYS.wishlist, []);
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => (typeof x === 'string' ? { id: x } : (x as WishLine))).filter((x) => x && typeof x.id === 'string');
}

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const { visitorId } = useSession();
  const [lines, setLines] = useState<WishLine[]>([]);
  const [server, setServer] = useState<Record<string, WishlistEntry>>({});
  const [synced, setSynced] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const lastToken = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    setLines(readLocal());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) writeJSON(KEYS.wishlist, lines);
  }, [lines, hydrated]);

  // sign-in: merge the local wishlist into the account, then adopt the server copy
  useEffect(() => {
    if (!hydrated || !auth.ready) return;
    const token = auth.accountKey;
    if (lastToken.current === token) return;
    lastToken.current = token;
    if (!token) {
      setSynced(false);
      setServer({});
      return;
    }
    let alive = true;
    (async () => {
      try {
        const local = readLocal();
        const remote = await fetchWishlist();
        const remoteIds = new Set((remote || []).map((e) => e.id));
        const missing = local.filter((l) => !remoteIds.has(l.id));
        await Promise.all(missing.map((l) => addWishlist(l.id, l.size).catch(() => undefined)));
        const merged = missing.length ? await fetchWishlist().catch(() => remote) : remote;
        if (!alive) return;
        const entries = (merged || []).map((e) => ({ ...e, image: fixImagePath(e.image) }));
        setServer(Object.fromEntries(entries.map((e) => [e.id, e])));
        setLines(entries.map((e) => ({ id: e.id, size: e.size ?? null, addedAt: e.addedAt })));
        setSynced(true);
      } catch {
        if (alive) setSynced(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [hydrated, auth.ready, auth.accountKey]);

  const has = useCallback((id: string) => lines.some((l) => l.id === id), [lines]);

  const toggle = useCallback(
    (id: string, size: string | null = null) => {
      const on = !lines.some((l) => l.id === id);
      setLines((prev) => (prev.some((l) => l.id === id) ? prev.filter((l) => l.id !== id) : [{ id, size, addedAt: Date.now() / 1000 }, ...prev]));
      if (auth.signedIn) {
        (on ? addWishlist(id, size) : removeWishlist(id)).catch(() => undefined);
      }
      sendRichEvent({ visitorId: visitorId || undefined, type: 'wishlist', itemId: id, meta: { action: on ? 'add' : 'remove', size } });
      return on;
    },
    [lines, auth.signedIn, visitorId],
  );

  const remove = useCallback(
    (id: string) => {
      setLines((prev) => prev.filter((l) => l.id !== id));
      if (auth.signedIn) removeWishlist(id).catch(() => undefined);
      sendRichEvent({ visitorId: visitorId || undefined, type: 'wishlist', itemId: id, meta: { action: 'remove' } });
    },
    [auth.signedIn, visitorId],
  );

  const value = useMemo<WishlistState>(() => {
    const entries = lines
      .map((l) => {
        const p = getProduct(l.id) || server[l.id];
        return p ? ({ ...p, size: l.size ?? null, addedAt: l.addedAt } as WishlistEntry) : null;
      })
      .filter((x): x is WishlistEntry => !!x);
    return { ids: lines.map((l) => l.id), entries, products: entries, synced, has, toggle, remove };
  }, [lines, server, synced, has, toggle, remove]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used within WishlistProvider');
  return ctx;
}
