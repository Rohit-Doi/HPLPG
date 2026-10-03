'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import {
  Calendar,
  Clock,
  Compass,
  FlaskConical,
  Globe2,
  Heart,
  Layers,
  Leaf,
  Link2,
  ListOrdered,
  MapPin,
  Monitor,
  Shuffle,
  Smartphone,
  Sparkles,
  Tablet,
  User,
  Users,
  WifiOff,
} from 'lucide-react';
import type { ColdStartLevel, Inference, LandingPage, ResolvedContext } from '@/lib/types';
import { DAY_SHORT, cn, compactNumber, hourLabel, pct, titleCase } from '@/lib/utils';

/* ------------------------------------------------------------------ */

export const LEVELS = [
  { level: 0, label: 'Anonymous', hint: 'Only global popularity' },
  { level: 1, label: 'Contextual', hint: 'Device, channel, geo, time' },
  { level: 2, label: '+ Declared', hint: 'Declared age group / gender / interest' },
  { level: 3, label: 'In-session', hint: 'Items viewed or added to bag' },
  { level: 4, label: 'Returning', hint: 'Signed in or persisted history' },
] as const;

export function ColdStartLadder({ level, label, compact }: { level: ColdStartLevel; label?: string; compact?: boolean }) {
  return (
    <div>
      <div className="flex items-end gap-1.5" role="img" aria-label={`Cold-start level ${level} of 4: ${label || LEVELS[level]?.label}`}>
        {LEVELS.map((l) => {
          const active = l.level === level;
          const reached = l.level <= level;
          return (
            <div key={l.level} className="flex flex-1 flex-col items-center">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 14 + l.level * (compact ? 8 : 12) }}
                transition={{ duration: 0.5, delay: l.level * 0.08 }}
                className={cn(
                  'w-full rounded-t-md',
                  active ? 'bg-brand-600 shadow-[0_0_0_3px_rgba(225,29,72,0.18)]' : reached ? 'bg-brand-200' : 'bg-gray-100',
                )}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {LEVELS.map((l) => (
          <div key={l.level} className="text-center">
            <p className={cn('text-[10px] font-bold leading-tight sm:text-[11px]', l.level === level ? 'text-brand-700' : 'text-gray-400')}>
              {compact ? `L${l.level}` : `L${l.level} · ${l.label}`}
            </p>
            {!compact && <p className="mt-0.5 hidden text-[10px] leading-tight text-gray-400 sm:block">{l.hint}</p>}
          </div>
        ))}
      </div>
      {compact && <p className="mt-1 text-center text-[11px] font-bold text-brand-700">{label || LEVELS[level]?.label}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const DEVICE_ICON: Record<string, typeof Monitor> = { mobile: Smartphone, tablet: Tablet, desktop: Monitor };

export function ContextChips({ ctx, signals }: { ctx: ResolvedContext; signals?: string[] }) {
  const DevIcon = DEVICE_ICON[ctx.device?.toLowerCase()] || Monitor;
  const chips: { icon: typeof Monitor; label: string; value: string | null | undefined }[] = [
    { icon: DevIcon, label: 'Device', value: ctx.device },
    { icon: Link2, label: 'Channel', value: ctx.channel },
    { icon: Compass, label: 'Source / medium', value: ctx.source || ctx.medium ? `${ctx.source || '—'} / ${ctx.medium || '—'}` : null },
    { icon: MapPin, label: 'Geo', value: ctx.geo || [ctx.city, ctx.region, ctx.country].filter(Boolean).join(', ') },
    { icon: Globe2, label: 'Macro region', value: ctx.macroRegion },
    { icon: Clock, label: 'Time', value: ctx.localHour != null ? `${hourLabel(ctx.localHour)} · ${ctx.daypart || ''}` : ctx.daypart },
    { icon: Calendar, label: 'Day', value: ctx.dayOfWeek != null ? DAY_SHORT[ctx.dayOfWeek] : null },
    { icon: Leaf, label: 'Season', value: ctx.season },
    { icon: Layers, label: 'Landing', value: ctx.landingPageType },
    { icon: User, label: 'Age', value: ctx.ageGroup },
    { icon: User, label: 'Gender', value: ctx.gender },
    { icon: User, label: 'Income', value: ctx.incomeGroup },
    { icon: Heart, label: 'Interest', value: ctx.preferredDepartment },
  ];
  const known = (v: string | null | undefined) => !!v && !/^(unknown|none|\(none\)|\(not set\)|null)$/i.test(v);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => {
          const on = known(c.value);
          const Icon = c.icon;
          return (
            <span
              key={c.label}
              title={c.label}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]',
                on ? 'border-gray-200 bg-white text-ink' : 'border-dashed border-gray-200 bg-gray-50 text-gray-400',
              )}
            >
              <Icon className="h-3 w-3 shrink-0" aria-hidden />
              <span className="font-medium text-gray-500">{c.label}:</span>
              <span className="font-semibold">{on ? titleCase(String(c.value)) : 'unknown'}</span>
            </span>
          );
        })}
      </div>
      {signals && signals.length > 0 && (
        <div className="mt-3">
          <p className="label-xs mb-1.5">Signals the agent used</p>
          <ul className="space-y-1">
            {signals.map((s) => (
              <li key={s} className="flex items-start gap-2 text-xs text-gray-700">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function PersonaCard({ persona, similar }: { persona: Inference['persona']; similar?: Inference['similarVisitors'] }) {
  const conf = Math.max(0, Math.min(1, persona.confidence || 0));
  return (
    <div className="overflow-hidden rounded-xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-white">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-lg font-black text-white">
            {persona.name?.[0] || '?'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-extrabold leading-tight text-ink">{persona.name}</p>
            <p className="text-xs font-medium text-brand-700">{persona.tagline}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-black leading-none text-ink">{Math.round(conf * 100)}%</p>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">confidence</p>
          </div>
        </div>
        {persona.description && <p className="mt-3 text-xs leading-relaxed text-gray-600">{persona.description}</p>}
        {persona.alternatives?.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="label-xs">Persona distribution</p>
            {[{ id: persona.id, name: persona.name, probability: conf }, ...persona.alternatives].map((a, i) => (
              <div key={a.id + i} className="flex items-center gap-2 text-xs">
                <span className={cn('w-28 truncate', i === 0 ? 'font-bold text-ink' : 'text-gray-600')}>{a.name}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(2, a.probability * 100)}%` }}
                    transition={{ duration: 0.6, delay: i * 0.05 }}
                    className={cn('h-full rounded-full', i === 0 ? 'bg-brand-600' : 'bg-gray-300')}
                  />
                </div>
                <span className="w-9 text-right tabular-nums text-gray-500">{pct(a.probability, 0)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {similar && similar.count > 0 && (
        <div className="flex items-center gap-2 border-t border-brand-100 bg-white/70 px-4 py-2 text-[11px] text-gray-600">
          <Users className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />
          <span>
            <b className="text-ink">{compactNumber(similar.count)}</b> similar past visitors{similar.description ? ` — ${similar.description}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const STAGES = [
  { id: 'discover', label: 'Discover' },
  { id: 'explore', label: 'Explore' },
  { id: 'buy_now', label: 'Buy now' },
] as const;

function PropBar({ label, value, baseline }: { label: string; value: number; baseline: number }) {
  const max = Math.max(value, baseline, 0.0001) * 1.25;
  const lift = baseline > 0 ? value / baseline : null;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-gray-700">{label}</span>
        <span className="tabular-nums">
          <b className="text-ink">{pct(value, 1)}</b>
          {lift != null && (
            <span className={cn('ml-1.5 font-semibold', lift >= 1 ? 'text-emerald-600' : 'text-gray-400')}>
              {lift >= 1 ? '▲' : '▼'} {lift.toFixed(2)}×
            </span>
          )}
        </span>
      </div>
      <div className="relative mt-1 h-2.5 overflow-visible rounded-full bg-gray-100">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${(value / max) * 100}%` }}
          transition={{ duration: 0.7 }}
          className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
        />
        <div
          className="absolute -top-1 h-[18px] w-0.5 rounded bg-ink"
          style={{ left: `${(baseline / max) * 100}%` }}
          title={`Baseline ${pct(baseline, 1)}`}
        />
      </div>
      <p className="mt-0.5 text-[10px] text-gray-400">Baseline (avg. new visitor): {pct(baseline, 1)}</p>
    </div>
  );
}

export function IntentGauge({ intent }: { intent: Inference['intent'] }) {
  const idx = Math.max(0, STAGES.findIndex((s) => s.id === intent.stage));
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);
  const angle = -90 + (idx + 0.5) * 60; // 3 equal sectors over 180deg
  const hasProps = intent.baselineCart > 0 || intent.cartPropensity > 0;
  const arc = (i: number) => {
    const a0 = Math.PI * (1 - i / 3);
    const a1 = Math.PI * (1 - (i + 1) / 3);
    const r = 70;
    const cx = 90;
    const cy = 86;
    const p = (a: number) => `${cx + r * Math.cos(a)} ${cy - r * Math.sin(a)}`;
    return `M ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)}`;
  };
  const colors = ['#fecdd3', '#fb7185', '#e11d48'];
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="mx-auto w-44 shrink-0">
        <svg viewBox="0 0 180 100" className="w-full" role="img" aria-label={`Intent stage: ${intent.stageLabel}`}>
          {STAGES.map((s, i) => (
            <path key={s.id} d={arc(i)} stroke={i === idx ? colors[i] : '#f1f1f4'} strokeWidth={16} fill="none" strokeLinecap="butt" />
          ))}
          <g
            style={{
              transform: `rotate(${mounted ? angle : -90}deg)`,
              transformOrigin: '90px 86px',
              transformBox: 'view-box',
              transition: 'transform 900ms cubic-bezier(.34,1.56,.64,1)',
            }}
          >
            <line x1="90" y1="86" x2="90" y2="30" stroke="#282c3f" strokeWidth="3" strokeLinecap="round" />
          </g>
          <circle cx="90" cy="86" r="6" fill="#282c3f" />
        </svg>
        <div className="-mt-1 flex justify-between px-1 text-[10px] font-semibold text-gray-400">
          {STAGES.map((s, i) => (
            <span key={s.id} className={cn(i === idx && 'text-brand-700')}>
              {s.label}
            </span>
          ))}
        </div>
        <p className="mt-1 text-center text-sm font-extrabold text-ink">{intent.stageLabel || STAGES[idx].label}</p>
      </div>
      {hasProps && (
        <div className="flex-1 space-y-3">
          <PropBar label="Add-to-bag propensity" value={intent.cartPropensity} baseline={intent.baselineCart} />
          <PropBar label="Purchase propensity" value={intent.purchasePropensity} baseline={intent.baselinePurchase} />
          {intent.lift ? (
            <p className="text-xs text-gray-600">
              Overall lift vs. baseline: <b className={cn(intent.lift >= 1 ? 'text-emerald-600' : 'text-gray-500')}>{intent.lift.toFixed(2)}×</b>
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function AffinityBars({ items }: { items: Inference['departmentAffinity'] }) {
  if (!items?.length) return <p className="text-xs text-gray-400">No department affinity available.</p>;
  const max = Math.max(...items.map((d) => d.probability), 0.0001);
  return (
    <div className="space-y-2.5">
      {items.map((d, i) => (
        <div key={d.department}>
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-semibold text-ink">{d.label || titleCase(d.department)}</span>
            <span className="tabular-nums text-gray-600">
              {pct(d.probability, 0)}
              {d.lift != null && (
                <span
                  className={cn(
                    'ml-2 rounded px-1 py-0.5 text-[10px] font-bold',
                    d.lift >= 1.05 ? 'bg-emerald-50 text-emerald-700' : d.lift <= 0.95 ? 'bg-gray-100 text-gray-500' : 'bg-gray-50 text-gray-500',
                  )}
                >
                  {d.lift >= 1 ? '+' : ''}
                  {Math.round((d.lift - 1) * 100)}% vs avg
                </span>
              )}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(d.probability / max) * 100}%` }}
              transition={{ duration: 0.6, delay: i * 0.06 }}
              className={cn('h-full rounded-full', i === 0 ? 'bg-brand-600' : 'bg-brand-300')}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SubcategoryChips({ items }: { items: Inference['subcategoryAffinity'] }) {
  if (!items?.length) return null;
  const max = Math.max(...items.map((s) => s.score), 0.0001);
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.slice(0, 10).map((s) => (
        <span
          key={s.department + s.subcategory}
          className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
          style={{
            borderColor: `rgba(225,29,72,${0.15 + 0.5 * (s.score / max)})`,
            background: `rgba(225,29,72,${0.03 + 0.12 * (s.score / max)})`,
          }}
          title={`score ${s.score.toFixed(3)}`}
        >
          {s.subcategory} <span className="font-normal text-gray-400">· {titleCase(s.department)}</span>
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function BackoffPath({ path }: { path: Inference['backoffPath'] }) {
  if (!path?.length) return <p className="text-xs text-gray-400">No back-off path reported.</p>;
  const maxW = Math.max(...path.map((p) => p.weight), 0.0001);
  return (
    <ol className="relative space-y-2 border-l-2 border-dashed border-gray-200 pl-4">
      {path.map((p, i) => (
        <li key={p.level + p.key + i} className="relative">
          <span className="absolute -left-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-500 ring-1 ring-brand-200" />
          <div className="rounded-lg border border-gray-100 bg-white p-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <p className="text-xs font-bold text-ink">{titleCase(p.level)}</p>
              <p className="text-[10px] tabular-nums text-gray-500">
                support {compactNumber(p.support)} · weight {p.weight.toFixed(2)}
              </p>
            </div>
            <p className="mt-0.5 break-words font-mono text-[11px] text-gray-600">{p.key}</p>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-ink/70" style={{ width: `${(p.weight / maxW) * 100}%` }} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ */

export function DecisionTrace({ trace }: { trace: LandingPage['trace'] }) {
  if (!trace?.length) return null;
  const total = trace.reduce((s, t) => s + (t.durationMs || 0), 0);
  const max = Math.max(...trace.map((t) => t.durationMs || 0), 0.0001);
  return (
    <ol className="space-y-2">
      {trace.map((t, i) => (
        <motion.li
          key={t.step + i}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className="flex gap-3"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-bold text-ink">{t.step}</p>
              <span className="shrink-0 font-mono text-[10px] text-gray-500">{(t.durationMs ?? 0).toFixed(1)} ms</span>
            </div>
            <p className="text-[11px] leading-relaxed text-gray-600">{t.detail}</p>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-brand-400" style={{ width: `${((t.durationMs || 0) / max) * 100}%` }} />
            </div>
          </div>
        </motion.li>
      ))}
      {total > 0 && <li className="pl-9 text-[11px] text-gray-500">Total agent time: {total.toFixed(1)} ms</li>}
    </ol>
  );
}

/* ------------------------------------------------------------------ */

const RERANKER_LABEL: Record<string, string> = {
  lambdarank: 'Ranking: LambdaRank reranker (top-50)',
  lean_lambdarank: 'Ranking: LambdaRank reranker (top-50)',
  blend: 'Ranking: hybrid blend',
  hybrid_blend: 'Ranking: hybrid blend',
  popularity: 'Ranking: popularity control',
};

/** Live experiment assignment (A/B + bandit) and the ranking recipe used for this page. */
export function ExperimentPanel({ page }: { page: LandingPage }) {
  const ex = page.experiment;
  const rk = page.inference?.ranking;
  if (!ex && !rk) return null;
  const control = ex?.variant === 'control';
  return (
    <div className="space-y-2">
      {ex && (
        <div className={cn('rounded-lg border p-3', control ? 'border-gray-200 bg-gray-50' : 'border-emerald-200 bg-emerald-50/60')}>
          <div className="flex items-start gap-2">
            <FlaskConical className={cn('mt-0.5 h-4 w-4 shrink-0', control ? 'text-gray-500' : 'text-emerald-600')} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-ink">
                {control ? "You're in the control group" : "You're in the agent group"}
                <span className="ml-1.5 rounded bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-gray-500">bucket {ex.bucket}</span>
              </p>
              <p className="text-[11px] leading-relaxed text-gray-600">
                {control ? "Popularity-only page — 10% holdout used to measure the agent's lift." : 'Personalized page built by the Landing Page Agent.'}
                {ex.description ? ` ${ex.description}` : ''}
              </p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px]">
            <Shuffle className={cn('h-3.5 w-3.5 shrink-0', ex.banditReordered ? 'text-brand-600' : 'text-gray-400')} aria-hidden />
            <span className={cn('font-semibold', ex.banditReordered ? 'text-brand-700' : 'text-gray-500')}>
              {ex.banditReordered ? 'Module order learned from live clicks (Thompson-sampling bandit)' : 'Offline module order (bandit not applied)'}
            </span>
          </div>
        </div>
      )}
      {rk && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 font-semibold text-ink">
            <ListOrdered className="h-3 w-3 text-brand-600" aria-hidden /> {RERANKER_LABEL[String(rk.reranker || '').toLowerCase()] || `Ranking: ${titleCase(String(rk.reranker || 'unknown'))}`}
          </span>
          <span className={cn('rounded-full border px-2.5 py-1 font-semibold', rk.audienceRule ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-dashed border-gray-200 bg-gray-50 text-gray-400')}>
            Audience nudge: {rk.audienceRule ? 'on' : 'off'}
          </span>
          {rk.candidates > 0 && <span className="text-gray-500">{compactNumber(rk.candidates)} candidates</span>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Section({ title, children, className, icon }: { title: string; children: React.ReactNode; className?: string; icon?: React.ReactNode }) {
  return (
    <section className={className}>
      <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

export function OfflineNote() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>
        The personalization agent API is offline, so this page was assembled locally from catalog popularity. Start the backend to see
        persona, intent and back-off reasoning.
      </p>
    </div>
  );
}

/** Full reasoning view. layout="drawer" stacks sections; layout="cards" arranges them in a responsive card grid. */
export default function AgentReasoning({ page, layout = 'drawer' }: { page: LandingPage; layout?: 'drawer' | 'cards' }) {
  const { visitor, inference } = page;
  const cards = layout === 'cards';
  const box = cards ? 'card p-5' : 'border-b border-gray-100 pb-6';
  return (
    <div className={cn(cards ? 'grid gap-4 lg:grid-cols-2' : 'space-y-6')}>
      {page.offline && (
        <div className={cn(cards && 'lg:col-span-2')}>
          <OfflineNote />
        </div>
      )}
      <Section title={`Cold-start level · ${visitor.levelLabel}`} className={cn(box, cards && 'lg:col-span-2')} icon={<Layers className="h-3.5 w-3.5" />}>
        <ColdStartLadder level={visitor.coldStartLevel} label={visitor.levelLabel} />
      </Section>
      <Section title="What the agent knows" className={cn(box, cards && 'lg:col-span-2')} icon={<Globe2 className="h-3.5 w-3.5" />}>
        <ContextChips ctx={visitor.resolvedContext} signals={visitor.signalsUsed} />
      </Section>
      {!page.offline && (page.experiment || inference.ranking) && (
        <Section title="Experiment & ranking" className={cn(box, cards && 'lg:col-span-2')} icon={<FlaskConical className="h-3.5 w-3.5" />}>
          <ExperimentPanel page={page} />
        </Section>
      )}
      {!page.offline && (
        <>
          <Section title="Predicted persona" className={box} icon={<User className="h-3.5 w-3.5" />}>
            <PersonaCard persona={inference.persona} similar={inference.similarVisitors} />
          </Section>
          <Section title="Shopping intent" className={box} icon={<Sparkles className="h-3.5 w-3.5" />}>
            <IntentGauge intent={inference.intent} />
          </Section>
          <Section title="Department affinity" className={box}>
            <AffinityBars items={inference.departmentAffinity} />
            {inference.subcategoryAffinity?.length > 0 && (
              <div className="mt-4">
                <p className="label-xs mb-2">Top subcategories</p>
                <SubcategoryChips items={inference.subcategoryAffinity} />
              </div>
            )}
          </Section>
          <Section title="Context back-off path" className={box}>
            <p className="mb-3 text-[11px] leading-relaxed text-gray-500">
              The agent blends priors from the most specific context segment with enough history, backing off to broader segments.
            </p>
            <BackoffPath path={inference.backoffPath} />
          </Section>
        </>
      )}
      <Section title={`Decision trace · ${page.latencyMs ? `${Math.round(page.latencyMs)} ms` : 'local'}`} className={cn(box, cards && 'lg:col-span-2', !cards && 'border-b-0')}>
        <DecisionTrace trace={page.trace} />
      </Section>
    </div>
  );
}
