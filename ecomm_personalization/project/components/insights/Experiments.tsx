'use client';

import { useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { fetchExperiments } from '@/lib/api';
import type { Experiments as ExperimentsData } from '@/lib/types';
import { cn, compactNumber, titleCase } from '@/lib/utils';
import { BRAND, Card, DataTable, SectionTitle, rate, type AnyRow } from './shared';

const REFRESH_MS = 10_000;

/** Live A/B + bandit state. Polls every 10 s while mounted; renders nothing if the endpoint is unavailable. */
export default function Experiments() {
  const [data, setData] = useState<ExperimentsData | null>(null);
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    const load = () =>
      fetchExperiments(ctrl.signal)
        .then((d) => {
          if (!alive) return;
          setData(d);
          setFailed(false);
          setUpdatedAt(new Date());
        })
        .catch(() => alive && !data && setFailed(true));
    load();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);
    return () => {
      alive = false;
      ctrl.abort();
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  if (failed || !data) return null;

  const variants = (['agent', 'control'] as const).filter((v) => data.variants?.[v]).map((v) => ({ variant: v, ...data.variants[v]! }));
  const modules = Object.entries(data.modules || {})
    .map(([module, m]) => ({ module, ...m }))
    .sort((a, b) => (b.impressions || 0) - (a.impressions || 0));
  const agent = data.variants?.agent;
  const control = data.variants?.control;
  const ctrLift = agent?.ctr != null && control?.ctr != null && control.ctr > 0 ? ((agent.ctr - control.ctr) / control.ctr) * 100 : null;

  return (
    <>
      <SectionTitle eyebrow="Online learning" title="Live experiment" text={data.description || 'Every generated page is assigned to the agent or a popularity-only control group; module order is tuned by a Thompson-sampling bandit from real impressions and clicks.'} />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="chip">
          <span className="text-gray-500">Pages generated:</span> <b>{compactNumber(data.pagesGenerated)}</b>
        </span>
        <span className="chip">
          <span className="text-gray-500">Control share:</span> <b>{rate(data.controlShare, 0)}</b>
        </span>
        {data.avgLatencyMs != null && (
          <span className="chip">
            <span className="text-gray-500">Avg latency:</span> <b>{Math.round(data.avgLatencyMs)} ms</b>
          </span>
        )}
        {ctrLift != null && (
          <span className={cn('chip', ctrLift > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : '')}>
            <span className="text-gray-500">CTR lift agent vs control:</span> <b>{ctrLift > 0 ? '+' : ''}{ctrLift.toFixed(1)}%</b>
          </span>
        )}
        <button type="button" onClick={() => setTick((t) => t + 1)} className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-ink">
          <RefreshCw className="h-3 w-3" aria-hidden /> {updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : 'Refresh'} · auto every 10 s
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {variants.length > 0 && (
          <Card title="A/B variants" subtitle="Agent vs. popularity-only control" icon={<Activity className="h-4 w-4 text-brand-600" aria-hidden />}>
            <DataTable
              rows={variants as unknown as AnyRow[]}
              minWidth={560}
              columns={[
                { key: 'variant', label: 'Variant', fmt: (v) => titleCase(String(v)) },
                { key: 'pages', label: 'Pages', fmt: (v) => compactNumber(Number(v)), align: 'right' },
                { key: 'impressions', label: 'Impressions', fmt: (v) => compactNumber(Number(v)), align: 'right' },
                { key: 'clicks', label: 'Clicks', fmt: (v) => compactNumber(Number(v)), align: 'right' },
                { key: 'ctr', label: 'CTR', fmt: (v) => (v == null ? '—' : rate(v, 2)), align: 'right', highlight: (v) => typeof v === 'number' && v === Math.max(...variants.map((x) => x.ctr ?? -1)) },
                { key: 'view_item', label: 'View item', fmt: (v) => compactNumber(Number(v)), align: 'right' },
                { key: 'add_to_cart', label: 'Add to cart', fmt: (v) => compactNumber(Number(v)), align: 'right' },
              ]}
            />
          </Card>
        )}
        {modules.length > 0 && (
          <Card title="Module CTR" subtitle="Clicks per impression by module type / id (agent + control)">
            <DataTable
              rows={modules as unknown as AnyRow[]}
              minWidth={360}
              columns={[
                { key: 'module', label: 'Module', fmt: (v) => titleCase(String(v)) },
                { key: 'impressions', label: 'Impressions', fmt: (v) => compactNumber(Number(v)), align: 'right' },
                { key: 'clicks', label: 'Clicks', fmt: (v) => compactNumber(Number(v)), align: 'right' },
                { key: 'ctr', label: 'CTR', fmt: (v) => (v == null ? '—' : rate(v, 2)), align: 'right' },
              ]}
            />
          </Card>
        )}
        {Array.isArray(data.bandit) && data.bandit.length > 0 && (
          <Card title="Bandit arms" subtitle="Posterior mean click-rate per module for each intent stage × device (Beta(α, β)); bar width = mean, opacity = evidence" className="xl:col-span-2">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.bandit.map((b) => {
                const arms = [...(b.arms || [])].sort((x, y) => y.mean - x.mean);
                const max = Math.max(...arms.map((a) => a.mean), 0.0001);
                const maxEv = Math.max(...arms.map((a) => a.evidence), 1);
                return (
                  <div key={`${b.stage}-${b.device}`} className="rounded-lg border border-gray-100 p-3">
                    <p className="mb-2 text-xs font-bold text-ink">
                      {titleCase(b.stage)} <span className="font-normal text-gray-400">×</span> {titleCase(b.device)}
                    </p>
                    <ul className="space-y-1.5">
                      {arms.map((a) => (
                        <li key={a.module} className="flex items-center gap-2 text-[11px]">
                          <span className="w-28 truncate text-gray-700" title={a.module}>
                            {titleCase(a.module)}
                          </span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${(a.mean / max) * 100}%`, background: BRAND, opacity: 0.35 + 0.65 * Math.min(1, a.evidence / maxEv) }}
                              title={`α ${a.alpha.toFixed(1)} · β ${a.beta.toFixed(1)}`}
                            />
                          </div>
                          <span className="w-12 text-right tabular-nums font-semibold text-ink">{rate(a.mean, 1)}</span>
                          <span className="w-10 text-right tabular-nums text-gray-400">n={compactNumber(a.evidence)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
