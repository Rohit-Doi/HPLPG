'use client';

import { cn, titleCase } from '@/lib/utils';

export const BRAND = '#e11d48';
export const MUTED = '#9ca3af';
export const GRID = '#eef0f3';
export const AXIS = { fontSize: 11, fill: '#6b7280' };
export const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
export const POSITIVE = '#059669';
export const NEGATIVE = '#e11d48';

/** Rates may arrive as fractions (0.023) or percentages (2.3). */
export function rate(v: unknown, digits = 1): string {
  if (typeof v !== 'number' || Number.isNaN(v)) return '—';
  const p = v <= 1 ? v * 100 : v;
  return `${p.toFixed(digits)}%`;
}
export function asPct(v: unknown): number {
  if (typeof v !== 'number') return 0;
  return v <= 1 ? v * 100 : v;
}
export function num(v: unknown, d = 3) {
  return typeof v === 'number' && !Number.isNaN(v) ? v.toFixed(d) : '—';
}
export function signedPct(v: unknown, d = 1) {
  if (typeof v !== 'number' || Number.isNaN(v)) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(d)}%`;
}
export function has<T>(v: T[] | undefined | null): v is T[] {
  return Array.isArray(v) && v.length > 0;
}

export type AnyRow = Record<string, unknown>;

export function Card({ title, subtitle, children, className, icon }: { title: string; subtitle?: string; children: React.ReactNode; className?: string; icon?: React.ReactNode }) {
  return (
    <section className={cn('card p-5', className)}>
      <div className="mb-4">
        <h3 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-ink">
          {icon}
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="mb-5 mt-12">
      <p className="label-xs text-brand-600">{eyebrow}</p>
      <h2 className="text-xl font-black tracking-tight text-ink md:text-2xl">{title}</h2>
      {text && <p className="mt-1 max-w-3xl text-sm text-gray-600">{text}</p>}
    </div>
  );
}

export function ChartTooltip({
  active,
  payload,
  label,
  fmt,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string; payload?: AnyRow }[];
  label?: string | number;
  fmt?: (v: number, name: string, row?: AnyRow) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lift">
      <p className="mb-1 font-bold text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-gray-600">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <b className="text-ink">{fmt ? fmt(p.value, p.name, p.payload) : p.value}</b>
        </p>
      ))}
    </div>
  );
}

export type Column = { key: string; label: string; fmt?: (v: unknown, row: AnyRow) => React.ReactNode; align?: 'right'; highlight?: (v: unknown, row: AnyRow) => boolean };

export function DataTable({ rows, columns, minWidth = 480 }: { rows: AnyRow[]; columns: Column[]; minWidth?: number }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full text-left text-xs" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-500">
            {columns.map((c) => (
              <th key={c.key} className={cn('py-2 pr-3 font-semibold', c.align === 'right' && 'text-right')}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-50 last:border-0">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'py-2 pr-3 tabular-nums',
                    c.align === 'right' && 'text-right',
                    c.key === columns[0].key && 'font-semibold text-ink',
                    c.highlight?.(r[c.key], r) && 'font-black text-brand-700',
                  )}
                >
                  {c.fmt ? c.fmt(r[c.key], r) : String(r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Small chip list for weight maps such as blendWeights / chainWeights. */
export function WeightChips({ weights, label }: { weights: Record<string, number>; label: string }) {
  const entries = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  return (
    <div>
      <p className="label-xs mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([k, v]) => (
          <span key={k} className="chip">
            <span className="text-gray-500">{titleCase(k)}</span> <b className="tabular-nums">{typeof v === 'number' ? v.toFixed(2) : String(v)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
