'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { fetchCurrencyMeta, fetchSettings, updateSettings } from '@/lib/api';
import { KEYS, readJSON, writeJSON } from '@/lib/storage';
import type { CurrencyCode } from '@/lib/types';

/** INR first: the store prices in rupees; the rest are optional display conversions. */
export const CURRENCIES: CurrencyCode[] = ['INR', 'USD', 'EUR', 'GBP', 'AED'];
export const BASE_CURRENCY: CurrencyCode = 'INR';

/** Mirror of GET /meta/currency (INR -> X multipliers), used until the API answers (or when it is down). */
const FALLBACK_RATES: Record<string, number> = { INR: 1, USD: 0.011905, EUR: 0.010952, GBP: 0.009286, AED: 0.04369 };
const FALLBACK_SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'AED ' };

/** One-time migration: earlier builds defaulted to USD; v6 is an Indian store, so a stored "USD" becomes "INR" once. */
const MIGRATION_KEY = 'aura.currencyMigrated.v6';
type MigrationState = { local?: boolean; users?: (number | string)[] };

type CurrencyState = {
  /** display currency (catalog prices are always INR) */
  currency: CurrencyCode;
  rates: Record<string, number>;
  symbols: Record<string, string>;
  /** INR -> display multiplier */
  rate: number;
  symbol: string;
  /** true once the rates came from the API */
  live: boolean;
  options: CurrencyCode[];
  /** persists to localStorage (guests) and to /me/settings (members) */
  setCurrency: (c: CurrencyCode) => Promise<void>;
  /** INR amount -> "₹1,23,456" / "€132.93" */
  formatPrice: (inr: number | null | undefined) => string;
  /** convert from INR without formatting */
  convert: (inr: number) => number;
};

const CurrencyContext = createContext<CurrencyState | null>(null);

function isCode(v: unknown): v is CurrencyCode {
  return typeof v === 'string' && (CURRENCIES as string[]).includes(v);
}

const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** Format an INR amount in `currency`. INR: whole rupees with Indian grouping (₹1,23,456); others: up to 2 decimals. */
export function formatIn(inr: number | null | undefined, currency: string, rates: Record<string, number>, symbols: Record<string, string>): string {
  if (inr == null || Number.isNaN(inr)) return '';
  if (currency === 'INR') {
    const r = Math.round(inr);
    return `${r < 0 ? '−' : ''}${inrFmt.format(Math.abs(r))}`;
  }
  const v = inr * (rates[currency] ?? 1);
  const sym = symbols[currency] ?? `${currency} `;
  const decimals = Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2;
  const num = new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Math.abs(v));
  return `${v < 0 ? '−' : ''}${sym}${num}`;
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [currency, setCur] = useState<CurrencyCode>(BASE_CURRENCY);
  const [rates, setRates] = useState(FALLBACK_RATES);
  const [symbols, setSymbols] = useState(FALLBACK_SYMBOLS);
  const [live, setLive] = useState(false);
  const lastUser = useRef<number | null | undefined>(undefined);

  // boot: local preference + live rates
  useEffect(() => {
    const mig = readJSON<MigrationState>(MIGRATION_KEY, {});
    let saved = readJSON<string>(KEYS.currency, BASE_CURRENCY);
    if (!mig.local) {
      if (saved === 'USD') {
        saved = BASE_CURRENCY;
        writeJSON(KEYS.currency, saved);
      }
      writeJSON(MIGRATION_KEY, { ...mig, local: true });
    }
    if (isCode(saved)) setCur(saved);
    let alive = true;
    fetchCurrencyMeta()
      .then((m) => {
        if (!alive || !m?.rates) return;
        setRates({ ...FALLBACK_RATES, ...m.rates });
        setSymbols({ ...FALLBACK_SYMBOLS, ...(m.symbols || {}) });
        setLive(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // members: the account setting wins over the browser preference
  useEffect(() => {
    if (!auth.ready) return;
    const id = auth.signedIn ? auth.user?.id ?? null : null;
    if (lastUser.current === id) return;
    lastUser.current = id;
    if (!id) return;
    let alive = true;
    fetchSettings()
      .then((s) => {
        if (!alive || !isCode(s?.currency)) return;
        let c: CurrencyCode = s.currency;
        const mig = readJSON<MigrationState>(MIGRATION_KEY, {});
        const users = mig.users || [];
        if (!users.includes(id)) {
          // one-time: an account still on the old USD default moves to INR
          if (c === 'USD') {
            c = BASE_CURRENCY;
            updateSettings({ currency: c }).catch(() => undefined);
          }
          writeJSON(MIGRATION_KEY, { ...mig, users: [...users, id] });
        }
        setCur(c);
        writeJSON(KEYS.currency, c);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [auth.ready, auth.signedIn, auth.user?.id]);

  const setCurrency = useCallback(
    async (c: CurrencyCode) => {
      if (!isCode(c)) return;
      setCur(c);
      writeJSON(KEYS.currency, c);
      if (auth.signedIn) await updateSettings({ currency: c });
    },
    [auth.signedIn],
  );

  const value = useMemo<CurrencyState>(() => {
    const rate = rates[currency] ?? 1;
    return {
      currency,
      rates,
      symbols,
      rate,
      symbol: symbols[currency] ?? `${currency} `,
      live,
      options: CURRENCIES,
      setCurrency,
      formatPrice: (inr) => formatIn(inr, currency, rates, symbols),
      convert: (inr) => inr * rate,
    };
  }, [currency, rates, symbols, live, setCurrency]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}
