'use client';

import { useRef, useState } from 'react';
import { Loader2, MapPin, Users, X } from 'lucide-react';
import { fetchLandingPage } from '@/lib/api';
import { audienceShare } from '@/lib/catalog';
import type { LandingPage, LandingPageRequest, Product, ProductCarouselModule } from '@/lib/types';
import { cn, pct, titleCase } from '@/lib/utils';
import { type LabConfig, toRequest } from './labConfig';

const STATES = ['California', 'Texas', 'New York', 'Florida'];

type Row = {
  id: string;
  label: string;
  kind: 'base' | 'gender' | 'geo';
  page: LandingPage | null;
  error?: string;
};

/** The "Picked for you" style rail: the first product carousel with a personal reason, else the first carousel. */
function pickedRail(page: LandingPage | null): Product[] {
  if (!page) return [];
  const rails = page.modules.filter((m): m is ProductCarouselModule => m.type === 'product_carousel' && (m.products?.length || 0) > 0);
  const personal = rails.find((m) => /picked|for you|for her|for him|recommended/i.test(m.title || '')) || rails[0];
  return (personal?.products || []).slice(0, 10);
}

function heroTitle(page: LandingPage | null) {
  const h = page?.modules.find((m) => m.type === 'hero');
  return h && h.type === 'hero' ? h.title : '—';
}

function topDepartment(page: LandingPage | null) {
  const d = page?.inference?.departmentAffinity?.[0];
  return d ? d.label || titleCase(d.department) : page?.theme?.department ? titleCase(page.theme.department) : '—';
}

function changedVsBase(base: Product[], other: Product[]) {
  const ids = new Set(base.map((p) => p.id));
  return other.filter((p) => !ids.has(p.id)).length;
}

export default function GenderGeoCheck({ cfg, regions }: { cfg: LabConfig; regions: string[] }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const states = (regions.length >= 4 ? regions : STATES).slice(0, 4);

  const run = async () => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setOpen(true);
    setRunning(true);
    const base: LabConfig = { ...cfg, gender: '', region: '' };
    const variants: { id: string; label: string; kind: Row['kind']; cfg: LabConfig }[] = [
      { id: 'base', label: 'Base visitor', kind: 'base', cfg: base },
      { id: 'female', label: 'Gender: female', kind: 'gender', cfg: { ...base, gender: 'female' } },
      { id: 'male', label: 'Gender: male', kind: 'gender', cfg: { ...base, gender: 'male' } },
      ...states.map((st) => ({ id: `geo-${st}`, label: `State: ${st}`, kind: 'geo' as const, cfg: { ...base, country: base.country || 'United States', region: st } })),
    ];
    setRows(variants.map((v) => ({ id: v.id, label: v.label, kind: v.kind, page: null })));
    const results = await Promise.all(
      variants.map(async (v) => {
        const req: LandingPageRequest = { ...toRequest(v.cfg, `lab-check-${v.id}`), options: { maxModules: 10, variant: 'agent', bandit: false } };
        try {
          const page = await fetchLandingPage(req, ctrl.signal);
          return { id: v.id, label: v.label, kind: v.kind, page } as Row;
        } catch (e) {
          return { id: v.id, label: v.label, kind: v.kind, page: null, error: e instanceof Error ? e.message : 'failed' } as Row;
        }
      }),
    );
    if (ctrl.signal.aborted) return;
    setRows(results);
    setRunning(false);
  };

  const basePicks = pickedRail(rows?.find((r) => r.id === 'base')?.page || null);
  const anyFailed = rows?.some((r) => r.error);

  return (
    <div className="mt-3 rounded-lg border border-dashed border-gray-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-ink">Gender &amp; location check</p>
          <p className="text-[10px] text-gray-400">Same visitor, gender female vs male, and 4 US states — does the page actually move?</p>
        </div>
        <button type="button" onClick={run} disabled={running} className="btn-outline px-3 py-1.5 text-xs">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Users className="h-3.5 w-3.5" aria-hidden />} Run 7 variants
        </button>
      </div>

      {open && rows && (
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] text-gray-500">
              {running ? 'Calling the agent 7 times…' : `Compared against the base visitor's “picked for you” rail (${basePicks.length} items).`}
            </p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close comparison" className="rounded p-1 text-gray-400 hover:bg-gray-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {anyFailed && !running && <p className="mb-2 text-[11px] text-amber-700">Some calls failed — is the agent API running?</p>}
          <div className="-mx-3 overflow-x-auto px-3">
            <table className="w-full min-w-[640px] text-left text-[11px]">
              <thead>
                <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wide text-gray-500">
                  <th className="py-1.5 pr-2 font-semibold">Variant</th>
                  <th className="py-1.5 pr-2 font-semibold">Hero title</th>
                  <th className="py-1.5 pr-2 font-semibold">Top department</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">Women / men audience</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">Changed vs base</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const picks = pickedRail(r.page);
                  const women = audienceShare(picks, 'women');
                  const men = audienceShare(picks, 'men');
                  const changed = r.id === 'base' ? null : changedVsBase(basePicks, picks);
                  return (
                    <tr key={r.id} className={cn('border-b border-gray-50 last:border-0', r.kind === 'base' && 'bg-gray-50/60')}>
                      <td className="py-1.5 pr-2 font-semibold text-ink">
                        <span className="inline-flex items-center gap-1">
                          {r.kind === 'gender' ? <Users className="h-3 w-3 text-brand-600" aria-hidden /> : r.kind === 'geo' ? <MapPin className="h-3 w-3 text-brand-600" aria-hidden /> : null}
                          {r.label}
                        </span>
                      </td>
                      {!r.page ? (
                        <td colSpan={4} className="py-1.5 text-gray-400">
                          {r.error ? `failed (${r.error})` : <span className="skeleton inline-block h-3 w-40 align-middle" />}
                        </td>
                      ) : (
                        <>
                          <td className="max-w-[220px] truncate py-1.5 pr-2 text-gray-700" title={heroTitle(r.page)}>
                            {heroTitle(r.page)}
                          </td>
                          <td className="py-1.5 pr-2 text-gray-700">{topDepartment(r.page)}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-gray-700">
                            <span className="text-brand-700">{pct(women, 0)}</span> / <span className="text-sky-700">{pct(men, 0)}</span>
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">
                            {changed == null ? (
                              <span className="text-gray-400">—</span>
                            ) : (
                              <span className={cn('font-bold', changed >= 5 ? 'text-brand-700' : changed > 0 ? 'text-ink' : 'text-gray-400')}>
                                {changed} / {Math.max(basePicks.length, picks.length) || 10}
                              </span>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
