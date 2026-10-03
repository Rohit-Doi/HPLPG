'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, Award, BarChart3, CheckCircle2, IndianRupee, Layers, Package, ShoppingCart, Trophy, Users, WifiOff } from 'lucide-react';
import { API_URL, fetchEvaluation, fetchInsights } from '@/lib/api';
import type { Evaluation, Insights, ModelResult } from '@/lib/types';
import { cn, compactNumber, formatMoneyCompact, titleCase } from '@/lib/utils';
import Pipeline from './Pipeline';
import Experiments from './Experiments';
import { Ablations, Breakdowns, HybridLift, ModelSelection, Reranker, Robustness, Sensitivity } from './EvaluationExtras';
import { AXIS, BRAND, CATEGORICAL, Card, ChartTooltip, DataTable, GRID, MUTED, SectionTitle, asPct, has, num, rate, type AnyRow } from './shared';

/* ------------------------------ helpers ------------------------------ */

/**
 * The analytics dataset (GA e-commerce sample) records revenue in its source currency (USD); the store
 * itself is priced in INR. Revenue is shown in rupees using the same fixed rate the catalog pipeline
 * used to convert prices (backend config USD_TO_INR = 84), so both pages speak ₹.
 */
const DATASET_TO_INR = 84;
const revenueInr = (v: number | null | undefined) => formatMoneyCompact(v == null || Number.isNaN(Number(v)) ? v : Number(v) * DATASET_TO_INR);

function KV({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object');
  const nested = Object.entries(data).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v));
  const fmt = (k: string, v: unknown) => {
    if (typeof v === 'number') {
      if (/(rate|pct|percent|share|ratio)/i.test(k)) return rate(v);
      return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(3);
    }
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return String(v);
  };
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {entries.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-gray-50 px-3 py-2">
            <dt className="text-[11px] text-gray-500">{titleCase(k)}</dt>
            <dd className="text-sm font-bold tabular-nums text-ink">{fmt(k, v)}</dd>
          </div>
        ))}
      </dl>
      {nested.map(([k, v]) => (
        <div key={k}>
          <p className="label-xs mb-2">{titleCase(k)}</p>
          <KV data={v as Record<string, unknown>} />
        </div>
      ))}
    </div>
  );
}

/* --------------------------- sections --------------------------- */

function Kpis({ o }: { o: NonNullable<Insights['overview']> }) {
  const tiles = [
    { label: 'Events', value: compactNumber(o.events), icon: Activity },
    { label: 'Users', value: compactNumber(o.users), icon: Users },
    { label: 'Sessions', value: compactNumber(o.sessions), icon: Layers },
    { label: 'Orders', value: compactNumber(o.transactions), icon: ShoppingCart },
    { label: 'Revenue (₹)', value: revenueInr(o.revenue), icon: IndianRupee },
    { label: 'Items', value: compactNumber(o.items), icon: Package },
  ].filter((t) => t.value !== '—');
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="card p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
              <t.icon className="h-4 w-4 text-brand-600" aria-hidden /> {t.label}
            </div>
            <p className="mt-2 text-2xl font-black tabular-nums text-ink">{t.value}</p>
          </div>
        ))}
      </div>
      {o.dateRange && (
        <p className="mt-2 text-xs text-gray-500">
          Data window: {String(o.dateRange[0]).slice(0, 10)} → {String(o.dateRange[1]).slice(0, 10)}
        </p>
      )}
    </div>
  );
}

function Funnel({ data }: { data: NonNullable<Insights['funnel']> }) {
  const max = Math.max(...data.map((d) => d.sessions), 1);
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={d.stage}>
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-semibold text-ink">{titleCase(d.stage)}</span>
            <span className="tabular-nums text-gray-600">
              {compactNumber(d.sessions)} sessions · <b className="text-ink">{rate(d.rate)}</b>
            </span>
          </div>
          <div className="mt-1 h-7 overflow-hidden rounded-md bg-gray-50">
            <div
              className="flex h-full items-center rounded-r-md"
              style={{ width: `${Math.max(1.5, (d.sessions / max) * 100)}%`, background: BRAND, opacity: 1 - i * 0.14 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function RateBars({ rows, keyField, metric = 'conversionRate', height = 260 }: { rows: AnyRow[]; keyField: string; metric?: string; height?: number }) {
  const data = rows.map((r) => ({ name: titleCase(String(r[keyField] ?? '')), value: asPct(r[metric]) }));
  const best = Math.max(...data.map((d) => d.value));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" tick={AXIS} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={AXIS} width={110} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} content={<ChartTooltip fmt={(v) => `${v.toFixed(2)}%`} />} />
          <Bar dataKey="value" name={titleCase(metric)} radius={[0, 4, 4, 0]} maxBarSize={18}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.value === best ? BRAND : '#fda4af'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const METRICS: { key: keyof ModelResult['metrics']; label: string }[] = [
  { key: 'ndcg', label: 'NDCG@k' },
  { key: 'hitRate', label: 'HitRate@k' },
  { key: 'recall', label: 'Recall@k' },
  { key: 'precision', label: 'Precision@k' },
  { key: 'mrr', label: 'MRR' },
  { key: 'coverage', label: 'Coverage' },
  { key: 'diversity', label: 'Diversity' },
];

function ModelTable({ models, k }: { models: ModelResult[]; k?: number }) {
  const present = METRICS.filter((m) => models.some((x) => typeof x.metrics?.[m.key] === 'number'));
  const best: Record<string, number> = {};
  present.forEach((m) => (best[m.key] = Math.max(...models.map((x) => x.metrics?.[m.key] ?? -Infinity))));
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[600px] text-left text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-500">
            <th className="py-2 pr-3 font-semibold">Model</th>
            {present.map((m) => (
              <th key={m.key} className="py-2 pr-3 text-right font-semibold">
                {k ? m.label.replace('@k', `@${k}`) : m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((x) => (
            <tr key={x.name} className={cn('border-b border-gray-50 last:border-0', best.ndcg != null && x.metrics?.ndcg === best.ndcg && 'bg-brand-50/40')}>
              <td className="py-2 pr-3">
                <p className="font-semibold text-ink">
                  {x.label || x.name}
                  {/ltr|audience/i.test(x.name) && <span className="ml-1.5 rounded bg-brand-100 px-1 py-0.5 text-[9px] font-bold uppercase text-brand-700">v2</span>}
                </p>
                {x.description && <p className="max-w-xs text-[10px] text-gray-400">{x.description}</p>}
              </td>
              {present.map((m) => {
                const v = x.metrics?.[m.key];
                const isBest = typeof v === 'number' && v === best[m.key];
                return (
                  <td key={m.key} className={cn('py-2 pr-3 text-right tabular-nums', isBest && 'font-black text-brand-700')}>
                    {isBest && <Trophy className="mr-1 inline h-3 w-3" aria-label="best" />}
                    {num(v)}
                    {m.key === 'ndcg' && x.ci?.ndcg && (
                      <span className="block text-[10px] font-normal text-gray-400">
                        [{num(x.ci.ndcg[0])}, {num(x.ci.ndcg[1])}]
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModelBars({ models, k }: { models: ModelResult[]; k?: number }) {
  const present = METRICS.filter((m) => models.some((x) => typeof x.metrics?.[m.key] === 'number'));
  const [metric, setMetric] = useState<keyof ModelResult['metrics']>(present[0]?.key || 'ndcg');
  const data = models.map((x) => ({ name: x.label || x.name, value: x.metrics?.[metric] ?? 0 }));
  const best = Math.max(...data.map((d) => d.value));
  const label = (METRICS.find((m) => m.key === metric)?.label || '').replace('@k', k ? `@${k}` : '@k');
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Metric">
        {present.map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={metric === m.key}
            onClick={() => setMetric(m.key)}
            className={cn('rounded-full px-2.5 py-1 text-[11px] font-bold', metric === m.key ? 'bg-ink text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
          >
            {k ? m.label.replace('@k', `@${k}`) : m.label}
          </button>
        ))}
      </div>
      <div style={{ height: Math.max(180, data.length * 36 + 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={AXIS} width={140} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} content={<ChartTooltip fmt={(v) => v.toFixed(4)} />} />
            <Bar dataKey="value" name={label} radius={[0, 4, 4, 0]} maxBarSize={20} label={{ position: 'right', fontSize: 10, fill: '#374151', formatter: (v: number) => v.toFixed(3) }}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.value === best ? BRAND : MUTED} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[11px] text-gray-500">
        <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: BRAND }} /> best model for {label}
      </p>
    </div>
  );
}

/* ------------------------------ main ------------------------------ */

export default function InsightsClient() {
  const [ins, setIns] = useState<Insights | null>(null);
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [state, setState] = useState<{ ins: 'loading' | 'ok' | 'err'; ev: 'loading' | 'ok' | 'err' }>({ ins: 'loading', ev: 'loading' });

  useEffect(() => {
    fetchInsights()
      .then((d) => {
        setIns(d);
        setState((s) => ({ ...s, ins: 'ok' }));
      })
      .catch(() => setState((s) => ({ ...s, ins: 'err' })));
    fetchEvaluation()
      .then((d) => {
        setEv(d);
        setState((s) => ({ ...s, ev: 'ok' }));
      })
      .catch(() => setState((s) => ({ ...s, ev: 'err' })));
  }, []);

  const deviceShare = useMemo(() => {
    const rows = (ins?.devices || []) as AnyRow[];
    const total = rows.reduce((s, r) => s + (Number(r.sessions) || 0), 0) || 1;
    return rows.map((r) => ({ device: String(r.device), share: ((Number(r.sessions) || 0) / total) * 100, conv: asPct(r.conversionRate), cart: asPct(r.cartRate) }));
  }, [ins]);

  const loading = state.ins === 'loading' || state.ev === 'loading';
  const offline = state.ins === 'err' && state.ev === 'err';

  return (
    <div className="bg-gray-50/60">
      <div className="container py-8">
        <p className="label-xs flex items-center gap-1.5 text-brand-600">
          <BarChart3 className="h-3.5 w-3.5" aria-hidden /> Data &amp; Model Insights
        </p>
        <h1 className="text-2xl font-black tracking-tight text-ink md:text-4xl">What the agent learned from the data</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-600">
          The pipeline behind the personalization: how raw GA-style event data becomes context priors, personas and propensity models — and how
          well they beat a popularity baseline on unseen visitors.
        </p>

        <SectionTitle eyebrow="How it works" title="From raw events to a personalized page" />
        <Pipeline />

        {offline && (
          <div className="mt-8 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              Analytics are served by the agent API at <code className="font-mono">{API_URL}</code>, which isn&apos;t reachable right now. Start the backend and
              reload this page. <Link href="/lab" className="font-semibold underline">Open the Lab</Link> in the meantime.
            </p>
          </div>
        )}

        {loading && (
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-24" />
            ))}
            <div className="skeleton col-span-2 h-72 lg:col-span-3" />
            <div className="skeleton col-span-2 h-72 lg:col-span-3" />
          </div>
        )}

        {ins && (
          <>
            {ins.overview && (
              <>
                <SectionTitle eyebrow="Dataset" title="At a glance" />
                <Kpis o={ins.overview} />
              </>
            )}

            <SectionTitle eyebrow="Behaviour" title="How visitors shop" text="Conversion varies strongly by channel, device and hour — exactly the signals available for a brand-new visitor." />
            <div className="grid gap-4 lg:grid-cols-2">
              {has(ins.funnel) && (
                <Card title="Session funnel" subtitle="Share of sessions reaching each stage">
                  <Funnel data={ins.funnel} />
                </Card>
              )}
              {has(ins.channels) && (
                <Card title="Conversion by channel" subtitle="Session → purchase rate; best channel highlighted">
                  <RateBars rows={ins.channels as AnyRow[]} keyField="channel" height={Math.max(200, ins.channels.length * 30 + 30)} />
                </Card>
              )}
              {has(ins.channels) && (
                <Card title="Channel performance" className="lg:col-span-2">
                  <DataTable
                    rows={ins.channels as AnyRow[]}
                    columns={[
                      { key: 'channel', label: 'Channel', fmt: (v) => titleCase(String(v)) },
                      { key: 'users', label: 'Users', fmt: (v) => compactNumber(Number(v)), align: 'right' },
                      { key: 'sessions', label: 'Sessions', fmt: (v) => compactNumber(Number(v)), align: 'right' },
                      { key: 'cartRate', label: 'Add-to-cart', fmt: (v) => rate(v), align: 'right' },
                      { key: 'conversionRate', label: 'Conversion', fmt: (v) => rate(v, 2), align: 'right' },
                      { key: 'revenue', label: 'Revenue (₹)', fmt: (v) => revenueInr(Number(v)), align: 'right' },
                    ]}
                  />
                </Card>
              )}
              {deviceShare.length > 0 && (
                <Card title="Device split" subtitle="Share of sessions, with add-to-cart and conversion rate">
                  <div className="flex h-4 overflow-hidden rounded-full" role="img" aria-label="Device share of sessions">
                    {deviceShare.map((d, i) => (
                      <div key={d.device} style={{ width: `${d.share}%`, background: CATEGORICAL[i % CATEGORICAL.length] }} className="border-r-2 border-white last:border-r-0" title={`${d.device}: ${d.share.toFixed(1)}%`} />
                    ))}
                  </div>
                  <div className="mt-4 space-y-2">
                    {deviceShare.map((d, i) => (
                      <div key={d.device} className="flex items-center gap-3 text-xs">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CATEGORICAL[i % CATEGORICAL.length] }} />
                        <span className="w-20 font-semibold text-ink">{titleCase(d.device)}</span>
                        <span className="w-24 tabular-nums text-gray-600">{d.share.toFixed(1)}% sessions</span>
                        <span className="tabular-nums text-gray-600">cart {d.cart.toFixed(1)}%</span>
                        <span className="ml-auto tabular-nums font-bold text-ink">conv {d.conv.toFixed(2)}%</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
              {has(ins.hourly) && (
                <Card title="Conversion by hour of day" subtitle="Local hour → purchase rate">
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={(ins.hourly as AnyRow[]).map((h) => ({ hour: Number(h.hour), conv: asPct(h.conversionRate) }))} margin={{ left: -8, right: 12, top: 8 }}>
                        <CartesianGrid vertical={false} stroke={GRID} />
                        <XAxis dataKey="hour" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(h) => `${h}h`} interval={2} />
                        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={44} />
                        <Tooltip content={<ChartTooltip fmt={(v) => `${v.toFixed(2)}%`} />} labelFormatter={(h) => `${h}:00`} />
                        <Line type="monotone" dataKey="conv" name="Conversion" stroke={BRAND} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              )}
              {has(ins.geo) && (
                <Card title="Top geographies" subtitle="Conversion by region">
                  <RateBars rows={(ins.geo as AnyRow[]).slice(0, 10)} keyField="geo" height={Math.min(10, ins.geo.length) * 28 + 30} />
                </Card>
              )}
            </div>

            {(has(ins.segments) || has(ins.personas)) && (
              <SectionTitle eyebrow="Segmentation" title="Segments & personas" text="Rule-based engagement segments describe behaviour; personas are what the agent predicts for a new visitor from context alone." />
            )}
            {has(ins.segments) && (
              <Card title="Engagement segments" subtitle="Share of users (bar) and conversion rate">
                <div className="space-y-3">
                  {ins.segments.map((s) => (
                    <div key={s.id} className="grid gap-1 sm:grid-cols-[200px_1fr_120px] sm:items-center sm:gap-4">
                      <div>
                        <p className="text-sm font-bold text-ink">{s.label}</p>
                        <p className="text-[11px] leading-snug text-gray-500">{s.description}</p>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-gray-100" title={`${rate(s.share)} of users`}>
                        <div className="h-full rounded-full" style={{ width: `${Math.max(1, asPct(s.share))}%`, background: BRAND }} />
                      </div>
                      <p className="text-xs tabular-nums text-gray-600 sm:text-right">
                        {rate(s.share)} users · <b className="text-ink">{rate(s.conversionRate)}</b> conv
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {has(ins.personas) && (
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {ins.personas.map((p) => (
                  <div key={p.id} className="card flex flex-col p-5">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 font-black text-white">{p.name?.[0]}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-extrabold text-ink">{p.name}</p>
                        <p className="text-xs font-medium text-brand-700">{p.tagline}</p>
                      </div>
                      <div className="text-right text-xs">
                        <p className="font-black text-ink">{rate(p.share)}</p>
                        <p className="text-gray-400">of users</p>
                      </div>
                    </div>
                    {p.description && <p className="mt-3 text-xs leading-relaxed text-gray-600">{p.description}</p>}
                    <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-gray-600">
                      <span>
                        Users <b className="text-ink">{compactNumber(p.users)}</b>
                      </span>
                      <span>
                        Conversion <b className="text-ink">{rate(p.conversionRate)}</b>
                      </span>
                    </div>
                    {has(p.topDepartments) && (
                      <div className="mt-3 space-y-1">
                        {p.topDepartments.slice(0, 3).map((d) => (
                          <div key={d.department} className="flex items-center gap-2 text-[11px]">
                            <span className="w-20 truncate">{titleCase(d.department)}</span>
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                              <div className="h-full rounded-full bg-brand-500" style={{ width: `${asPct(d.share)}%` }} />
                            </div>
                            <span className="w-9 text-right tabular-nums text-gray-500">{rate(d.share, 0)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {has(p.topChannels) && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {p.topChannels.slice(0, 4).map((c) => (
                          <span key={c.channel} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                            {titleCase(c.channel)} {rate(c.share, 0)}
                          </span>
                        ))}
                      </div>
                    )}
                    {has(p.topProducts) && (
                      <div className="mt-auto flex gap-1.5 pt-4">
                        {p.topProducts.slice(0, 5).map((pr) => (
                          <Link key={pr.id} href={`/product/${pr.id}`} className="w-1/5" title={pr.name}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={pr.image} alt={pr.name} className="aspect-[3/4] w-full rounded object-cover" />
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {has(ins.departments) && (
              <>
                <SectionTitle eyebrow="Catalog" title="Department performance" />
                <Card title="Departments" subtitle="Views, carts and orders per department">
                  <DataTable
                    rows={ins.departments as unknown as AnyRow[]}
                    columns={[
                      { key: 'label', label: 'Department' },
                      { key: 'views', label: 'Views', fmt: (v) => compactNumber(Number(v)), align: 'right' },
                      { key: 'carts', label: 'Carts', fmt: (v) => compactNumber(Number(v)), align: 'right' },
                      { key: 'orders', label: 'Orders', fmt: (v) => compactNumber(Number(v)), align: 'right' },
                      { key: 'revenue', label: 'Revenue (₹)', fmt: (v) => revenueInr(Number(v)), align: 'right' },
                    ]}
                  />
                </Card>
              </>
            )}

            {(ins.dataQuality || ins.catalog) && (
              <>
                <SectionTitle eyebrow="Data engineering" title="Cleaning & data quality" text="What the pipeline fixed before training — duplicates, bots, noisy demographics and join coverage." />
                <div className="grid gap-4 lg:grid-cols-2">
                  {ins.dataQuality && (
                    <Card title="Data quality" icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />}>
                      <KV data={ins.dataQuality} />
                    </Card>
                  )}
                  {ins.catalog && (
                    <Card title="Catalog build" icon={<Package className="h-4 w-4 text-brand-600" aria-hidden />}>
                      <KV data={ins.catalog} />
                    </Card>
                  )}
                </div>
              </>
            )}
          </>
        )}

        <Experiments />

        {ev && (
          <>
            <SectionTitle
              eyebrow="Offline evaluation"
              title="Does personalization beat popularity?"
              text={ev.protocol?.description || 'Models are trained on past data and tested on later, unseen visitors.'}
            />
            {ev.protocol && (
              <div className="mb-4 flex flex-wrap gap-2 text-xs">
                {[
                  ['Train until', ev.protocol.trainEnd],
                  ['Test window', `${ev.protocol.testStart} → ${ev.protocol.testEnd}`],
                  ['Test users', compactNumber(ev.protocol.testUsers)],
                  ['k', String(ev.protocol.k)],
                ].map(([k, v]) => (
                  <span key={k} className="chip">
                    <span className="text-gray-500">{k}:</span> <b>{v}</b>
                  </span>
                ))}
              </div>
            )}
            {ev.hybridLiftVsPopularity && <HybridLift lift={ev.hybridLiftVsPopularity} validationNdcg={ev.validationNdcg} />}
            {ev.modelSelection && (
              <div className="mb-4">
                <ModelSelection ms={ev.modelSelection} />
              </div>
            )}
            <div className="grid gap-4 xl:grid-cols-2">
              {has(ev.coldStart) && (
                <Card title="Cold start — first page view" subtitle="Ranking quality using context only" icon={<Award className="h-4 w-4 text-brand-600" aria-hidden />}>
                  <ModelBars models={ev.coldStart} k={ev.protocol?.k} />
                </Card>
              )}
              {(has(ev.byChannel) || has(ev.byDevice) || has(ev.byGeo) || has(ev.byGender)) && <Breakdowns ev={ev} />}
              {has(ev.coldStart) && (
                <Card title="Cold-start model comparison" className="xl:col-span-2">
                  <ModelTable models={ev.coldStart} k={ev.protocol?.k} />
                </Card>
              )}
              {has(ev.secondaryFold) && (
                <div className="xl:col-span-2">
                  <Robustness ev={ev} />
                </div>
              )}
              {has(ev.warmStart) && (
                <Card title="Warm start — after the first item" subtitle="Ranking quality once one in-session item is observed" className="xl:col-span-2">
                  <ModelTable models={ev.warmStart} k={ev.protocol?.k} />
                </Card>
              )}
              {has(ev.ablations) && <Ablations rows={ev.ablations} />}
              {has(ev.sensitivity) && <Sensitivity rows={ev.sensitivity} />}
              {(ev.ltr || (ev.chainWeights && Object.keys(ev.chainWeights).length > 0)) && (
                <div className="xl:col-span-2">
                  <Reranker ev={ev} />
                </div>
              )}
              {has(ev.classifiers) && (
                <Card title="Propensity classifiers" subtitle="Metric vs. baseline">
                  <div className="space-y-4">
                    {ev.classifiers.map((c) => {
                      const max = Math.max(c.value, c.baseline, 0.0001);
                      const lift = c.baseline ? c.value / c.baseline : null;
                      return (
                        <div key={c.name + c.metric}>
                          <div className="flex items-baseline justify-between text-xs">
                            <span className="font-bold text-ink">
                              {c.label || c.name} <span className="font-normal text-gray-500">· {c.metric}</span>
                            </span>
                            {lift != null && <span className={cn('font-bold', lift >= 1 ? 'text-emerald-600' : 'text-gray-500')}>{lift.toFixed(2)}× baseline</span>}
                          </div>
                          <div className="mt-1.5 space-y-1">
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className="w-16 text-gray-500">Model</span>
                              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                                <div className="h-full rounded-full" style={{ width: `${(c.value / max) * 100}%`, background: BRAND }} />
                              </div>
                              <span className="w-12 text-right tabular-nums font-semibold">{num(c.value)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className="w-16 text-gray-500">Baseline</span>
                              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                                <div className="h-full rounded-full" style={{ width: `${(c.baseline / max) * 100}%`, background: MUTED }} />
                              </div>
                              <span className="w-12 text-right tabular-nums">{num(c.baseline)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}
              {ev.blendWeights && Object.keys(ev.blendWeights).length > 0 && !ev.ltr && !(ev.chainWeights && Object.keys(ev.chainWeights).length > 0) && (
                <Card title="Blend weights" subtitle="How the agent mixes model scores into the final ranking">
                  {(() => {
                    const entries = Object.entries(ev.blendWeights!).sort((a, b) => b[1] - a[1]);
                    const total = entries.reduce((s, [, v]) => s + Math.abs(v), 0) || 1;
                    return (
                      <>
                        <div className="flex h-5 overflow-hidden rounded-full" role="img" aria-label="Blend weights">
                          {entries.map(([k, v], i) => (
                            <div key={k} className="border-r-2 border-white last:border-r-0" style={{ width: `${(Math.abs(v) / total) * 100}%`, background: CATEGORICAL[i % CATEGORICAL.length] }} title={`${k}: ${v}`} />
                          ))}
                        </div>
                        <ul className="mt-4 space-y-1.5">
                          {entries.map(([k, v], i) => (
                            <li key={k} className="flex items-center gap-2 text-xs">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORICAL[i % CATEGORICAL.length] }} />
                              <span className="flex-1 text-gray-700">{titleCase(k)}</span>
                              <span className="tabular-nums font-bold text-ink">{v.toFixed(2)}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    );
                  })()}
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
