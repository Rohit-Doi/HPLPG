import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Store currency is INR (whole rupees); en-IN gives Indian digit grouping: 123456 -> "₹1,23,456". */
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** Server-safe rupee formatter (client components should prefer useCurrency().formatPrice, which honours the switcher). */
export function formatPrice(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '';
  return inr.format(Math.round(v));
}

/** Compact rupees with Indian units: 2,35,00,000 -> "₹2.4Cr", 1,50,000 -> "₹1.5L", 12,500 -> "₹12.5k". */
export function formatMoneyCompact(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5)}L`;
  if (a >= 1e4) return `${sign}₹${trim(a / 1e3)}k`;
  return `${sign}${inr.format(Math.round(a))}`;
}

/** 1934 -> "1.9k", 120174 -> "120k" */
export function compactNumber(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e6) return `${trim(v / 1e6)}M`;
  if (a >= 1e4) return `${Math.round(v / 1e3)}k`;
  if (a >= 1e3) return `${trim(v / 1e3)}k`;
  return `${Math.round(v)}`;
}

function trim(n: number) {
  return n.toFixed(1).replace(/\.0$/, '');
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(digits).replace(/\.0+$/, '')}%`;
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      /* fall through */
    }
  }
  return 'v-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function hourLabel(h: number) {
  const hh = ((h % 24) + 24) % 24;
  const suffix = hh < 12 ? 'am' : 'pm';
  const base = hh % 12 === 0 ? 12 : hh % 12;
  return `${base}${suffix}`;
}
