'use client';

import type { LandingPage, Module } from '@/lib/types';
import { cn, pct, titleCase } from '@/lib/utils';
import { ColdStartLadder } from '@/components/agent/Reasoning';

export function moduleTitle(m: Module): string {
  switch (m.type) {
    case 'announcement':
      return m.text;
    case 'trust_bar':
      return (m.items || []).map((i) => i.label).join(' · ');
    default:
      return (m as { title?: string }).title || titleCase(m.type);
  }
}

export function moduleImages(m: Module): string[] {
  switch (m.type) {
    case 'hero':
      return [m.image, ...(m.products || []).map((p) => p.image)].filter(Boolean).slice(0, 4);
    case 'product_carousel':
      return (m.products || []).slice(0, 4).map((p) => p.image);
    case 'bundle':
      return [m.anchor, ...(m.items || [])].filter(Boolean).slice(0, 4).map((p) => p.image);
    case 'category_tiles':
      return (m.tiles || []).slice(0, 4).map((t) => t.image);
    case 'cta_banner':
      return m.image ? [m.image] : [];
    default:
      return [];
  }
}

const TYPE_COLORS: Record<string, string> = {
  announcement: 'bg-gray-800 text-white',
  hero: 'bg-brand-600 text-white',
  category_tiles: 'bg-violet-100 text-violet-800',
  product_carousel: 'bg-sky-100 text-sky-800',
  cta_banner: 'bg-amber-100 text-amber-800',
  bundle: 'bg-emerald-100 text-emerald-800',
  trust_bar: 'bg-gray-100 text-gray-600',
};

function sig(m: Module) {
  return `${m.type}::${moduleTitle(m)}`;
}

export function ModuleStack({ page, other }: { page: LandingPage; other?: LandingPage | null }) {
  const otherSigs = new Set((other?.modules || []).map(sig));
  return (
    <ol className="space-y-2">
      {page.modules.map((m, i) => {
        const unique = other && !otherSigs.has(sig(m));
        const imgs = moduleImages(m);
        return (
          <li key={m.id} className={cn('rounded-lg border p-2.5', unique ? 'border-brand-300 bg-brand-50/40' : 'border-gray-100 bg-white')}>
            <div className="flex items-center gap-2">
              <span className="w-4 text-[11px] font-bold text-gray-400">{i + 1}</span>
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold uppercase', TYPE_COLORS[m.type] || 'bg-gray-100')}>{titleCase(m.type)}</span>
              {unique && <span className="ml-auto rounded-full bg-brand-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">differs</span>}
            </div>
            <p className="mt-1 line-clamp-2 pl-6 text-xs font-semibold text-ink">{moduleTitle(m)}</p>
            {imgs.length > 0 && (
              <div className="mt-1.5 flex gap-1 pl-6">
                {imgs.map((src, j) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src + j} src={src} alt="" className="h-12 w-9 rounded object-cover" />
                ))}
              </div>
            )}
            <p className="mt-1 pl-6 font-mono text-[10px] text-gray-400">{m.strategy}</p>
          </li>
        );
      })}
    </ol>
  );
}

export function VisitorSummary({ label, page, other }: { label: string; page: LandingPage | null; other?: LandingPage | null }) {
  if (!page) {
    return (
      <div className="card space-y-3 p-4">
        <div className="skeleton h-5 w-24" />
        <div className="skeleton h-16 w-full" />
        <div className="skeleton h-40 w-full" />
      </div>
    );
  }
  const { visitor, inference } = page;
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-2.5">
        <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-black text-white">Visitor {label}</span>
        <span className="text-[11px] text-gray-500">{page.offline ? 'local fallback' : `${Math.round(page.latencyMs)} ms`}</span>
      </div>
      <div className="space-y-4 p-4">
        <ColdStartLadder level={visitor.coldStartLevel} label={visitor.levelLabel} compact />
        <div className="flex flex-wrap gap-1">
          {visitor.signalsUsed.slice(0, 6).map((s) => (
            <span key={s} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
              {s}
            </span>
          ))}
        </div>
        <div className="rounded-lg border border-brand-100 bg-brand-50/50 p-3">
          <p className="label-xs text-brand-600">Persona</p>
          <p className="text-base font-extrabold text-ink">{inference.persona.name}</p>
          <p className="text-[11px] text-gray-600">{inference.persona.tagline}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
            <span>
              Confidence <b>{pct(inference.persona.confidence, 0)}</b>
            </span>
            <span>
              Intent <b>{inference.intent.stageLabel}</b>
            </span>
            {inference.intent.lift ? (
              <span>
                Lift <b>{inference.intent.lift.toFixed(2)}×</b>
              </span>
            ) : null}
          </div>
        </div>
        {inference.departmentAffinity?.length > 0 && (
          <div className="space-y-1">
            {inference.departmentAffinity.slice(0, 3).map((d, i) => (
              <div key={d.department} className="flex items-center gap-2 text-[11px]">
                <span className="w-20 truncate font-semibold">{d.label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div className={cn('h-full rounded-full', i === 0 ? 'bg-brand-600' : 'bg-brand-300')} style={{ width: `${d.probability * 100}%` }} />
                </div>
                <span className="w-8 text-right tabular-nums text-gray-500">{pct(d.probability, 0)}</span>
              </div>
            ))}
          </div>
        )}
        <div>
          <p className="label-xs mb-2">Module stack</p>
          <ModuleStack page={page} other={other} />
        </div>
      </div>
    </div>
  );
}
