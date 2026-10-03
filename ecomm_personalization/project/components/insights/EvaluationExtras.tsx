'use client';

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Check, Gavel, Layers, Scale, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import type { Evaluation } from '@/lib/types';
import { cn, compactNumber, titleCase } from '@/lib/utils';
import { AXIS, BRAND, Card, ChartTooltip, DataTable, GRID, MUTED, NEGATIVE, POSITIVE, WeightChips, has, num, rate, signedPct, type AnyRow } from './shared';

const SERVED_LABEL: Record<string, string> = { hybrid_blend: 'Hybrid blend', lean_lambdarank: 'Lean LambdaRank reranker' };

/* ------------------------------ hero stat ------------------------------ */

export function HybridLift({ lift, validationNdcg }: { lift: NonNullable<Evaluation['hybridLiftVsPopularity']>; validationNdcg?: number }) {
  const [lo, hi] = lift.ci95 || [];
  return (
    <div className="mb-4 flex flex-col gap-4 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 via-white to-white p-5 sm:flex-row sm:items-center">
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
          <TrendingUp className="h-6 w-6" aria-hidden />
        </span>
        <div>
          <p className="text-3xl font-black tabular-nums leading-none text-ink md:text-4xl">{signedPct(lift.pct)}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">NDCG lift vs. popularity</p>
        </div>
      </div>
      <div className="text-sm text-gray-600 sm:border-l sm:border-brand-100 sm:pl-4">
        <p>
          Served model: <b className="text-ink">{SERVED_LABEL[lift.model] || titleCase(lift.model)}</b>
        </p>
        {typeof lo === 'number' && typeof hi === 'number' && (
          <p className="text-xs text-gray-500">
            95% bootstrap CI: <b className="tabular-nums text-ink">{signedPct(lo)}</b> to <b className="tabular-nums text-ink">{signedPct(hi)}</b>
            {lo > 0 && <span className="ml-1.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">significant</span>}
          </p>
        )}
        {typeof validationNdcg === 'number' && <p className="text-xs text-gray-500">Validation NDCG: {num(validationNdcg)}</p>}
      </div>
    </div>
  );
}

/* ------------------------------ ablations ------------------------------ */

export function Ablations({ rows }: { rows: NonNullable<Evaluation['ablations']> }) {
  const data = [...rows].sort((a, b) => a.deltaPct - b.deltaPct).map((r) => ({ name: r.label || titleCase(r.name), delta: r.deltaPct, ndcg: r.ndcg, description: r.description }));
  return (
    <Card
      title="What each signal adds"
      subtitle="NDCG change when one signal group is removed from the blend — more negative means the signal matters more"
      icon={<Layers className="h-4 w-4 text-brand-600" aria-hidden />}
    >
      <div style={{ height: Math.max(180, data.length * 34 + 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="name" tick={AXIS} width={150} axisLine={false} tickLine={false} />
            <ReferenceLine x={0} stroke="#374151" />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} content={<ChartTooltip fmt={(v, _n, row) => `${signedPct(v, 2)} (NDCG ${num(row?.ndcg)})`} />} />
            <Bar dataKey="delta" name="Δ NDCG" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.delta < 0 ? NEGATIVE : POSITIVE} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 space-y-1 text-[11px] text-gray-500">
        {rows.map((r) => (
          <li key={r.name}>
            <b className="text-gray-700">{r.label || titleCase(r.name)}:</b>{' '}
            <span className={cn('font-bold tabular-nums', r.deltaPct < 0 ? 'text-brand-700' : 'text-emerald-700')}>{signedPct(r.deltaPct)}</span>
            {r.description ? ` — ${r.description}` : ''}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------ sensitivity ------------------------------ */

export function Sensitivity({ rows }: { rows: NonNullable<Evaluation['sensitivity']> }) {
  const data = [...rows].sort((a, b) => b.itemsChangedOf10 - a.itemsChangedOf10).map((r) => ({ name: r.label || titleCase(r.signal), changed: r.itemsChangedOf10 }));
  const genderRows = rows.filter((r) => typeof r.audienceShareBefore === 'number' || typeof r.audienceShareAfter === 'number');
  return (
    <Card title="What moves the page" subtitle="Of the 10 recommended items, how many change when one signal is set for an otherwise identical visitor" icon={<Scale className="h-4 w-4 text-brand-600" aria-hidden />}>
      <div style={{ height: Math.max(180, data.length * 34 + 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 36, top: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={AXIS} width={150} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} content={<ChartTooltip fmt={(v) => `${v} of 10 items changed`} />} />
            <Bar dataKey="changed" name="Items changed" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.changed >= 5 ? BRAND : '#fda4af'} />
              ))}
              <LabelList dataKey="changed" position="right" fontSize={10} fill="#374151" formatter={(v: number) => `${v}/10`} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {genderRows.length > 0 && (
        <ul className="mt-3 space-y-1 text-[11px] text-gray-600">
          {genderRows.map((r) => (
            <li key={r.signal}>
              <b className="text-gray-700">{r.label || titleCase(r.signal)}:</b> matching-audience share {rate(r.audienceShareBefore, 0)} → <b className="text-ink">{rate(r.audienceShareAfter, 0)}</b>
              {typeof r.womenDeptShareAfter === 'number' && <span className="text-gray-400"> · women’s department share after: {rate(r.womenDeptShareAfter, 0)}</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------ breakdowns ------------------------------ */

type Breakdown = { id: string; label: string; keyField: string; rows: AnyRow[] };

function LiftBars({ rows, keyField }: { rows: AnyRow[]; keyField: string }) {
  const data = rows.map((r) => ({ name: titleCase(String(r[keyField] ?? '')), Model: Number(r.ndcgModel) || 0, Popularity: Number(r.ndcgPopularity) || 0 }));
  return (
    <div style={{ height: Math.max(200, data.length * 44 + 40) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }} barGap={2}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={AXIS} width={110} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} content={<ChartTooltip fmt={(v) => v.toFixed(4)} />} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Model" fill={BRAND} radius={[0, 4, 4, 0]} maxBarSize={12} />
          <Bar dataKey="Popularity" fill={MUTED} radius={[0, 4, 4, 0]} maxBarSize={12} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Breakdowns({ ev }: { ev: Evaluation }) {
  const tabs: Breakdown[] = [
    has(ev.byChannel) ? { id: 'channel', label: 'By channel', keyField: 'channel', rows: ev.byChannel as unknown as AnyRow[] } : null,
    has(ev.byDevice) ? { id: 'device', label: 'By device', keyField: 'device', rows: ev.byDevice as unknown as AnyRow[] } : null,
    has(ev.byGeo) ? { id: 'geo', label: 'By geo', keyField: 'geo', rows: ev.byGeo as unknown as AnyRow[] } : null,
    has(ev.byGender) ? { id: 'gender', label: 'By gender', keyField: 'gender', rows: ev.byGender as unknown as AnyRow[] } : null,
  ].filter((t): t is Breakdown => !!t);
  const [tab, setTab] = useState(tabs[0]?.id);
  const cur = tabs.find((t) => t.id === tab) || tabs[0];
  if (!cur) return null;
  const lift = (v: unknown, r: AnyRow) => {
    const l = typeof v === 'number' ? v : Number(r.ndcgPopularity) ? ((Number(r.ndcgModel) - Number(r.ndcgPopularity)) / Number(r.ndcgPopularity)) * 100 : NaN;
    return <span className={cn('font-bold', l > 0 ? 'text-emerald-600' : 'text-gray-500')}>{signedPct(l)}</span>;
  };
  return (
    <Card title="Where the lift comes from" subtitle="Model vs. popularity NDCG for each segment of unseen test users">
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Breakdown">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={cur.id === t.id}
            onClick={() => setTab(t.id)}
            className={cn('rounded-full px-2.5 py-1 text-[11px] font-bold', cur.id === t.id ? 'bg-ink text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {cur.id === 'gender' ? (
        <DataTable
          rows={cur.rows}
          minWidth={560}
          columns={[
            { key: 'gender', label: 'Gender', fmt: (v) => titleCase(String(v)) },
            { key: 'users', label: 'Users', fmt: (v) => compactNumber(Number(v)), align: 'right' },
            { key: 'ndcgPopularity', label: 'Popularity', fmt: (v) => num(v), align: 'right' },
            { key: 'ndcgContextOnly', label: 'Context only', fmt: (v) => num(v), align: 'right' },
            { key: 'ndcgWithDemographics', label: '+ Demographics', fmt: (v) => num(v), align: 'right' },
            {
              key: 'ndcgAgentAudienceRule',
              label: 'Agent audience rule',
              fmt: (v) => num(v),
              align: 'right',
              highlight: (v, r) => typeof v === 'number' && v >= Math.max(Number(r.ndcgPopularity) || 0, Number(r.ndcgContextOnly) || 0, Number(r.ndcgWithDemographics) || 0),
            },
          ]}
        />
      ) : (
        <>
          <LiftBars rows={cur.rows} keyField={cur.keyField} />
          <div className="mt-3">
            <DataTable
              rows={cur.rows}
              columns={[
                { key: cur.keyField, label: cur.label.replace('By ', ''), fmt: (v) => titleCase(String(v)) },
                { key: 'users', label: 'Users', fmt: (v) => compactNumber(Number(v)), align: 'right' },
                { key: 'ndcgModel', label: 'Model NDCG', fmt: (v) => num(v), align: 'right' },
                { key: 'ndcgPopularity', label: 'Popularity NDCG', fmt: (v) => num(v), align: 'right' },
                { key: 'liftPct', label: 'Lift', fmt: lift, align: 'right' },
              ]}
            />
          </div>
        </>
      )}
    </Card>
  );
}

/* ------------------------------ robustness ------------------------------ */

export function Robustness({ ev }: { ev: Evaluation }) {
  const secondary = ev.secondaryFold || [];
  const primary = new Map((ev.coldStart || []).map((m) => [m.name, m]));
  const pop = (ev.coldStart || []).find((m) => /^popularity$/i.test(m.name) || /popularity/i.test(m.label))?.metrics?.ndcg;
  const rows: AnyRow[] = secondary.map((s) => {
    const p = primary.get(s.name);
    const pNdcg = p?.metrics?.ndcg;
    const pLift = typeof pNdcg === 'number' && typeof pop === 'number' && pop > 0 ? ((pNdcg - pop) / pop) * 100 : undefined;
    return { name: s.label || p?.label || titleCase(s.name), primaryNdcg: pNdcg, primaryLift: pLift, ndcg: s.ndcg, hitRate: s.hitRate, lift: s.liftVsPopularityPct };
  });
  const bestSecondary = Math.max(...secondary.map((s) => s.ndcg));
  return (
    <Card
      title="Robustness — second time fold"
      subtitle={`Same models re-trained and tested on a later month (Mar → Apr)${ev.protocol?.testStart ? `; primary fold tests ${ev.protocol.testStart} → ${ev.protocol.testEnd}` : ''}`}
      icon={<ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden />}
    >
      <DataTable
        rows={rows}
        minWidth={600}
        columns={[
          { key: 'name', label: 'Model' },
          { key: 'primaryNdcg', label: 'Primary NDCG', fmt: (v) => num(v), align: 'right' },
          { key: 'primaryLift', label: 'Primary lift', fmt: (v) => (typeof v === 'number' ? signedPct(v) : '—'), align: 'right' },
          { key: 'ndcg', label: 'Mar→Apr NDCG', fmt: (v) => num(v), align: 'right', highlight: (v) => v === bestSecondary },
          { key: 'hitRate', label: 'Mar→Apr HitRate', fmt: (v) => num(v), align: 'right' },
          {
            key: 'lift',
            label: 'Mar→Apr lift',
            fmt: (v) => <span className={cn('font-bold', typeof v === 'number' && v > 0 ? 'text-emerald-600' : 'text-gray-500')}>{signedPct(v)}</span>,
            align: 'right',
          },
        ]}
      />
    </Card>
  );
}

/* ------------------------------ reranker ------------------------------ */

export function Reranker({ ev }: { ev: Evaluation }) {
  const ltr = ev.ltr;
  const imp = [...(ltr?.importance || [])].sort((a, b) => b.gain - a.gain).slice(0, 15);
  const total = imp.reduce((s, f) => s + f.gain, 0) || 1;
  const data = imp.map((f) => ({ name: titleCase(f.feature), gain: (f.gain / total) * 100 }));
  return (
    <Card title="LTR reranker (evaluated, not served)" subtitle="LightGBM LambdaRank over the blended candidates — top-15 feature importances (share of total gain)" icon={<Sparkles className="h-4 w-4 text-brand-600" aria-hidden />}>
      {ltr && (
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <span className="chip">
            <span className="text-gray-500">Best iteration:</span> <b>{ltr.bestIteration}</b>
          </span>
          <span className="chip">
            <span className="text-gray-500">Train users:</span> <b>{compactNumber(ltr.trainUsers)}</b>
          </span>
        </div>
      )}
      {data.length > 0 && (
        <div style={{ height: Math.max(200, data.length * 26 + 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke={GRID} />
              <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={AXIS} width={170} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} content={<ChartTooltip fmt={(v) => `${v.toFixed(1)}% of gain`} />} />
              <Bar dataKey="gain" name="Gain share" radius={[0, 4, 4, 0]} maxBarSize={14}>
                {data.map((d, i) => (
                  <Cell key={d.name} fill={i === 0 ? BRAND : i < 5 ? '#fb7185' : '#fda4af'} />
                ))}
                <LabelList dataKey="gain" position="right" fontSize={10} fill="#374151" formatter={(v: number) => `${v.toFixed(1)}%`} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="mt-4 space-y-3">
        {ev.chainWeights && Object.keys(ev.chainWeights).length > 0 && <WeightChips weights={ev.chainWeights} label="Back-off chain weights" />}
        {ev.blendWeights && Object.keys(ev.blendWeights).length > 0 && <WeightChips weights={ev.blendWeights} label="Blend weights" />}
      </div>
    </Card>
  );
}

/* ------------------------------ model selection ------------------------------ */

const FOLD_LABEL: Record<string, string> = { primary: 'Apr → May-Jun', secondary: 'Mar → Apr' };

function ciText(ci: unknown) {
  if (!Array.isArray(ci) || ci.length < 2) return null;
  const [lo, hi] = ci;
  if (typeof lo !== 'number' || typeof hi !== 'number') return null;
  return `[${num(lo)}, ${num(hi)}]`;
}

function NdcgCell({ value, ci, winner }: { value: unknown; ci?: unknown; winner: boolean }) {
  const c = ciText(ci);
  return (
    <span className={cn(winner && 'font-black text-brand-700')}>
      {num(value)}
      {c && <span className="block text-[10px] font-normal text-gray-400">{c}</span>}
    </span>
  );
}

export function ModelSelection({ ms }: { ms: NonNullable<Evaluation['modelSelection']> }) {
  const served = ms.servedRanker;
  const isLean = served === 'lean_lambdarank';
  const folds = Object.entries(ms.folds || {}).filter(([, f]) => f && typeof f === 'object');
  const rows: AnyRow[] = folds.map(([id, f]) => {
    const leanWins = typeof f.leanLtrWins === 'boolean' ? f.leanLtrWins : Number(f.leanLtrNdcg) > Number(f.blendNdcg);
    return { fold: FOLD_LABEL[id] || titleCase(id), popularityNdcg: f.popularityNdcg, blendNdcg: f.blendNdcg, leanLtrNdcg: f.leanLtrNdcg, ciBlend: f.ci?.blend, ciLean: f.ci?.leanLtr, leanWins, testUsers: f.testUsers };
  });

  const grid = Object.entries(ms.audienceRule?.strengthGrid || {})
    .map(([k, v]) => ({ strength: Number(k), ndcg: Number(v) }))
    .filter((d) => Number.isFinite(d.strength) && Number.isFinite(d.ndcg))
    .sort((a, b) => a.strength - b.strength);
  const chosen = Number(ms.audienceRule?.chosenStrength);
  const gridMin = grid.length ? Math.min(...grid.map((d) => d.ndcg)) : 0;
  const gridMax = grid.length ? Math.max(...grid.map((d) => d.ndcg)) : 1;
  const pad = Math.max((gridMax - gridMin) * 0.5, 0.0005);

  const imp = [...(ms.leanLtr?.importance || [])].filter((f) => typeof f.gain === 'number').sort((a, b) => b.gain - a.gain).slice(0, 10);
  const impTotal = imp.reduce((s, f) => s + f.gain, 0) || 1;
  const impMax = imp[0]?.gain || 1;

  return (
    <Card
      title="What gets served — decided by held-out evidence"
      subtitle="The production ranker is chosen by comparing candidates on two time folds of unseen users, not by validation-set tuning"
      icon={<Gavel className="h-4 w-4 text-brand-600" aria-hidden />}
    >
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-brand-100 bg-brand-50/50 p-4 sm:flex-row sm:items-center">
        <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
          <Check className="h-3.5 w-3.5" aria-hidden /> Served: {SERVED_LABEL[served] || titleCase(String(served || 'unknown'))}
        </span>
        {ms.rule && <p className="text-sm text-gray-700">{ms.rule}</p>}
      </div>

      {rows.length > 0 && (
        <DataTable
          rows={rows}
          minWidth={640}
          columns={[
            { key: 'fold', label: 'Fold' },
            { key: 'popularityNdcg', label: 'Popularity NDCG', fmt: (v) => num(v), align: 'right' },
            { key: 'blendNdcg', label: 'Blend NDCG', fmt: (v, r) => <NdcgCell value={v} ci={r.ciBlend} winner={!r.leanWins} />, align: 'right' },
            { key: 'leanLtrNdcg', label: 'Lean LTR NDCG', fmt: (v, r) => <NdcgCell value={v} ci={r.ciLean} winner={!!r.leanWins} />, align: 'right' },
            {
              key: 'leanWins',
              label: 'Winner',
              fmt: (v) => (
                <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                  <Check className="h-3.5 w-3.5" aria-hidden /> {v ? 'Lean LTR' : 'Blend'}
                </span>
              ),
            },
            { key: 'testUsers', label: 'Test users', fmt: (v) => compactNumber(Number(v)), align: 'right' },
          ]}
        />
      )}

      {ms.fullLtrVerdict && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <Scale className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <b>Full LTR verdict:</b> {ms.fullLtrVerdict}
          </p>
        </div>
      )}

      <div className={cn('mt-5 grid gap-5', isLean && imp.length > 0 && 'lg:grid-cols-2')}>
        {grid.length > 0 && (
          <div>
            <p className="label-xs mb-1">Audience rule strength</p>
            <p className="mb-2 text-[11px] text-gray-500">
              NDCG on validation for each strength{ms.audienceRule?.tunedOn ? ` (tuned on ${ms.audienceRule.tunedOn})` : ''}; chosen value highlighted
            </p>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={grid} margin={{ left: -8, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="strength" tick={AXIS} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} domain={[Math.max(0, gridMin - pad), gridMax + pad]} tickFormatter={(v) => Number(v).toFixed(3)} width={56} />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} content={<ChartTooltip fmt={(v) => num(v, 4)} />} labelFormatter={(s) => `Strength ${s}`} />
                  <Bar dataKey="ndcg" name="Validation NDCG" radius={[4, 4, 0, 0]} maxBarSize={36}>
                    {grid.map((d) => (
                      <Cell key={d.strength} fill={d.strength === chosen ? BRAND : '#fda4af'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: BRAND }} /> chosen strength{Number.isFinite(chosen) ? `: ${chosen}` : ''}
            </p>
            {ms.audienceRule?.note && <p className="mt-2 text-[11px] leading-relaxed text-gray-600">{ms.audienceRule.note}</p>}
          </div>
        )}

        {isLean && imp.length > 0 && (
          <div>
            <p className="label-xs mb-1">Lean reranker — top-10 features</p>
            <p className="mb-2 text-[11px] text-gray-500">
              Share of total gain
              {typeof ms.leanLtr?.bestIteration === 'number' ? ` · best iteration ${ms.leanLtr.bestIteration}` : ''}
              {has(ms.leanLtr?.droppedFeatures) ? ` · dropped: ${ms.leanLtr.droppedFeatures.map(titleCase).join(', ')}` : ''}
            </p>
            <ul className="space-y-1.5">
              {imp.map((f, i) => (
                <li key={f.feature} className="flex items-center gap-2 text-xs">
                  <span className="w-36 truncate text-gray-700" title={f.feature}>
                    {titleCase(f.feature)}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full" style={{ width: `${(f.gain / impMax) * 100}%`, background: i === 0 ? BRAND : '#fb7185' }} />
                  </div>
                  <span className="w-12 text-right tabular-nums font-semibold text-ink">{((f.gain / impTotal) * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
