'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { putServerCart } from '@/lib/api';
import { getProduct } from '@/lib/catalog';
import { KEYS, readJSON, writeJSON } from '@/lib/storage';
import type { Product } from '@/lib/types';

export type BagLine = { productId: string; size: string | null; qty: number };
export type BagItem = BagLine & { product: Product };

type CartState = {
  /** false until localStorage was read on the client */
  hydrated: boolean;
  lines: BagLine[];
  items: BagItem[];
  count: number;
  subtotal: number;
  mrp: number;
  /** true when the bag mirrors /me/cart (signed in + API reachable) */
  synced: boolean;
  add: (productId: string, size?: string | null, qty?: number) => void;
  setQty: (productId: string, size: string | null, qty: number) => void;
  remove: (productId: string, size: string | null) => void;
  clear: () => void;
};

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [lines, setLines] = useState<BagLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [synced, setSynced] = useState(false);
  const lastToken = useRef<string | null | undefined>(undefined);
  const skipPush = useRef(false);
  /** true once the login merge has answered — later changes are then mirrored to the server */
  const merged = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLines(readJSON<BagLine[]>(KEYS.bag, []));
    setHydrated(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEYS.bag || e.key === null) setLines(readJSON<BagLine[]>(KEYS.bag, []));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (hydrated) writeJSON(KEYS.bag, lines);
  }, [lines, hydrated]);

  // sign-in: PUT /me/cart {merge:true} with the guest bag and adopt the merged result
  useEffect(() => {
    if (!hydrated || !auth.ready) return;
    const token = auth.accountKey;
    if (lastToken.current === token) return;
    lastToken.current = token;
    merged.current = false;
    if (!token) {
      setSynced(false);
      return;
    }
    let alive = true;
    const local = readJSON<BagLine[]>(KEYS.bag, []);
    putServerCart(
      local.map((l) => ({ itemId: l.productId, size: l.size, qty: l.qty })),
      true,
    )
      .then((res) => {
        if (!alive || !Array.isArray(res)) return;
        skipPush.current = true;
        merged.current = true;
        setLines(res.map((l) => ({ productId: l.id, size: l.size ?? null, qty: Math.max(1, Math.min(10, l.qty || 1)) })));
        setSynced(true);
      })
      .catch(() => alive && setSynced(false));
    return () => {
      alive = false;
    };
  }, [hydrated, auth.ready, auth.accountKey]);

  // signed in: mirror every later change to the server (debounced, fire-and-forget)
  useEffect(() => {
    if (!hydrated || !auth.signedIn || !merged.current) return;
    if (skipPush.current) {
      skipPush.current = false;
      return;
    }
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      putServerCart(
        lines.map((l) => ({ itemId: l.productId, size: l.size, qty: l.qty })),
        false,
      )
        .then(() => setSynced(true))
        .catch(() => setSynced(false));
    }, 400);
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, hydrated, auth.signedIn]);

  const add = useCallback((productId: string, size: string | null = null, qty = 1) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.productId === productId && l.size === size);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: Math.min(10, next[i].qty + qty) };
        return next;
      }
      return [...prev, { productId, size, qty }];
    });
  }, []);

  const setQty = useCallback((productId: string, size: string | null, qty: number) => {
    setLines((prev) =>
      prev
        .map((l) => (l.productId === productId && l.size === size ? { ...l, qty: Math.max(0, Math.min(10, qty)) } : l))
        .filter((l) => l.qty > 0),
    );
  }, []);

  const remove = useCallback((productId: string, size: string | null) => {
    setLines((prev) => prev.filter((l) => !(l.productId === productId && l.size === size)));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(() => {
    const items = lines
      .map((l) => ({ ...l, product: getProduct(l.productId) }))
      .filter((l): l is BagItem => !!l.product);
    const subtotal = items.reduce((s, l) => s + l.product.price * l.qty, 0);
    const mrp = items.reduce((s, l) => s + (l.product.compareAt ?? l.product.price) * l.qty, 0);
    const count = items.reduce((s, l) => s + l.qty, 0);
    return { hydrated, lines, items, count, subtotal, mrp, synced, add, setQty, remove, clear };
  }, [hydrated, lines, synced, add, setQty, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
