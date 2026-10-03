'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Check, Copy, ExternalLink, FlaskConical, Heart, Loader2, Menu, RefreshCw, Search, ShoppingBag, WifiOff } from 'lucide-react';
import { API_URL, fetchLandingPage, fetchMetaOptions } from '@/lib/api';
import { buildFallbackPage } from '@/lib/fallback';
import type { LandingPage, LandingPageRequest, MetaOptions } from '@/lib/types';
import { cn } from '@/lib/utils';
import ModuleRenderer, { PageSkeleton } from '@/components/modules/ModuleRenderer';
import AgentReasoning from '@/components/agent/Reasoning';
import { Switch } from '@/components/agent/WhyDrawer';
import DeviceFrame from './DeviceFrame';
import LabControls from './LabControls';
import GenderGeoCheck from './GenderGeoCheck';
import { VisitorSummary } from './ComparePanel';
import { FALLBACK_META, type LabConfig, applyPreset, defaultConfig, normOpts, previewUrl, toRequest } from './labConfig';

type Slot = 'A' | 'B';
type Result = { page: LandingPage | null; request: LandingPageRequest | null; loading: boolean };

const TABS = [
  { id: 'preview', label: 'Preview' },
  { id: 'reasoning', label: 'Agent reasoning' },
  { id: 'json', label: 'Raw JSON' },
] as const;
type Tab = (typeof TABS)[number]['id'];

function FrameHeader() {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
      <Menu className="h-4 w-4 text-gray-600" aria-hidden />
      <span className="text-base font-black tracking-[0.28em]">
        AUR<span className="text-brand-600">A</span>
      </span>
      <div className="flex gap-3 text-gray-600">
        <Search className="h-4 w-4" aria-hidden />
        <Heart className="h-4 w-4" aria-hidden />
        <ShoppingBag className="h-4 w-4" aria-hidden />
      </div>
    </div>
  );
}

function Preview({ result, cfg, explain }: { result: Result; cfg: LabConfig; explain: boolean }) {
  const compact = cfg.device !== 'desktop';
  return (
    <DeviceFrame device={cfg.device || 'desktop'} url={previewUrl(cfg)}>
      <FrameHeader />
      <div className={cn('transition-opacity', result.loading && result.page && 'opacity-50')}>
        {result.page ? (
          <ModuleRenderer modules={result.page.modules} accent={result.page.theme?.accent} compact={compact} explain={explain} animate={false} />
        ) : (
          <PageSkeleton compact={compact} />
        )}
      </div>
    </DeviceFrame>
  );
}

export default function LabClient() {
  const [meta, setMeta] = useState<MetaOptions | null>(null);
  const [metaOffline, setMetaOffline] = useState(false);
  const [configs, setConfigs] = useState<Record<Slot, LabConfig>>(() => ({ A: defaultConfig(), B: { ...defaultConfig(), device: 'desktop' } }));
  const [active, setActive] = useState<Slot>('A');
  const [compare, setCompare] = useState(false);
  const [compareView, setCompareView] = useState<'summary' | 'preview'>('summary');
  const [tab, setTab] = useState<Tab>('preview');
  const [explain, setExplain] = useState(true);
  const [auto, setAuto] = useState(true);
  const [results, setResults] = useState<Record<Slot, Result>>({
    A: { page: null, request: null, loading: false },
    B: { page: null, request: null, loading: false },
  });
  const [apiOffline, setApiOffline] = useState(false);
  const [copied, setCopied] = useState(false);
  const aborts = useRef<Partial<Record<Slot, AbortController>>>({});

  useEffect(() => {
    fetchMetaOptions()
      .then((m) => {
        setMeta({
          ...FALLBACK_META,
          ...m,
          channels: m.channels?.length ? m.channels : FALLBACK_META.channels,
          departments: m.departments?.length ? m.departments : FALLBACK_META.departments,
          presets: m.presets || [],
        });
        // start from the first preset so the Lab never opens on an empty state
        if (m.presets?.length) {
          setConfigs((c) => ({
            A: applyPreset(c.A, m.presets[0], m.channels || []),
            B: m.presets[1] ? applyPreset(c.B, m.presets[1], m.channels || []) : c.B,
          }));
        }
      })
      .catch(() => {
        setMeta(FALLBACK_META);
        setMetaOffline(true);
      });
  }, []);

  const generate = useCallback(async (slot: Slot, cfg: LabConfig) => {
    aborts.current[slot]?.abort();
    const ctrl = new AbortController();
    aborts.current[slot] = ctrl;
    const request = toRequest(cfg, `lab-visitor-${slot}`);
    setResults((r) => ({ ...r, [slot]: { ...r[slot], request, loading: true } }));
    try {
      const page = await fetchLandingPage(request, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setApiOffline(false);
      setResults((r) => ({ ...r, [slot]: { page, request, loading: false } }));
    } catch {
      if (ctrl.signal.aborted) return;
      setApiOffline(true);
      setResults((r) => ({ ...r, [slot]: { page: buildFallbackPage(request.context, request.session || {}), request, loading: false } }));
    }
  }, []);

  // auto-regenerate (debounced) whenever a config changes
  const keyA = JSON.stringify(configs.A);
  const keyB = JSON.stringify(configs.B);
  useEffect(() => {
    if (!meta || !auto) return;
    const t = setTimeout(() => generate('A', configs.A), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyA, meta, auto]);
  useEffect(() => {
    if (!meta || !auto || !compare) return;
    const t = setTimeout(() => generate('B', configs.B), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyB, meta, auto, compare]);

  const setCfg = (slot: Slot) => (c: LabConfig) => setConfigs((prev) => ({ ...prev, [slot]: c }));
  const editing: Slot = compare ? active : 'A';
  const cfg = configs[editing];
  const res = results[editing];
  const anyLoading = results.A.loading || (compare && results.B.loading);

  const json = useMemo(() => JSON.stringify({ request: res.request, response: res.page }, null, 2), [res.request, res.page]);

  return (
    <div className="bg-gray-50/60">
      <div className="container py-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-xs flex items-center gap-1.5 text-brand-600">
              <FlaskConical className="h-3.5 w-3.5" aria-hidden /> Personalization Lab
            </p>
            <h1 className="text-2xl font-black tracking-tight text-ink md:text-3xl">Simulate any first-time visitor</h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-600">
              Change device, channel, geography, time and session behaviour — the Landing Page Agent regenerates the page and shows exactly why.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
              <Switch checked={compare} onChange={setCompare} label="Compare two visitors" />
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden /> Compare A vs B
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
              <Switch checked={auto} onChange={setAuto} label="Auto-regenerate" /> Auto
            </label>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                generate('A', configs.A);
                if (compare) generate('B', configs.B);
              }}
            >
              {anyLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />} Generate page
            </button>
          </div>
        </div>

        {(apiOffline || metaOffline) && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              The agent API at <code className="font-mono">{API_URL}</code> is not reachable. Presets are unavailable and previews use the local popularity
              fallback. Start the backend and reload to see live personalization.
            </p>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* ---------------- controls ---------------- */}
          <aside className="card h-fit p-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto" aria-label="Visitor controls">
            {compare && (
              <div className="mb-4">
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
                  {(['A', 'B'] as Slot[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={active === s}
                      onClick={() => setActive(s)}
                      className={cn('rounded-md py-1.5 text-xs font-bold', active === s ? 'bg-white text-ink shadow-sm' : 'text-gray-500')}
                    >
                      Edit visitor {s}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-2 text-[11px] font-semibold text-gray-500 underline"
                  onClick={() => setConfigs((c) => ({ ...c, [active === 'A' ? 'B' : 'A']: { ...c[active] } }))}
                >
                  Copy {active} → {active === 'A' ? 'B' : 'A'}
                </button>
              </div>
            )}
            {meta ? (
              <LabControls meta={meta} cfg={cfg} onChange={setCfg(editing)} />
            ) : (
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="skeleton h-9 w-full" />
                ))}
              </div>
            )}
          </aside>

          {/* ---------------- output ---------------- */}
          <section className="min-w-0">
            {compare ? (
              <div>
                <div className="mb-4 flex items-center gap-2">
                  {(['summary', 'preview'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setCompareView(v)}
                      className={cn('rounded-full px-3 py-1.5 text-xs font-bold', compareView === v ? 'bg-ink text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200')}
                    >
                      {v === 'summary' ? 'Side-by-side reasoning' : 'Side-by-side previews'}
                    </button>
                  ))}
                  <p className="ml-auto hidden text-[11px] text-gray-500 sm:block">Modules marked “differs” are unique to that visitor.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {(['A', 'B'] as Slot[]).map((s) =>
                    compareView === 'summary' ? (
                      <VisitorSummary key={s} label={s} page={results[s].page} other={results[s === 'A' ? 'B' : 'A'].page} />
                    ) : (
                      <div key={s}>
                        <p className="mb-2 text-xs font-black">
                          Visitor {s} · <span className="font-semibold text-gray-500">{results[s].page?.inference.persona.name || '…'}</span>
                        </p>
                        <Preview result={results[s]} cfg={configs[s]} explain={explain} />
                      </div>
                    ),
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-gray-200">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTab(t.id)}
                      className={cn(
                        '-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition',
                        tab === t.id ? 'border-brand-600 text-ink' : 'border-transparent text-gray-500 hover:text-ink',
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                  <div className="ml-auto flex items-center gap-3 pb-1.5 text-[11px] text-gray-500">
                    {res.loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Generating" />}
                    {res.page && !res.page.offline && <span>{Math.round(res.page.latencyMs)} ms</span>}
                    {res.page?.experiment && !res.page.offline && (
                      <span className={cn('rounded-full px-2 py-0.5 font-semibold', res.page.experiment.variant === 'control' ? 'bg-gray-100 text-gray-600' : 'bg-emerald-50 text-emerald-700')}>
                        {res.page.experiment.variant}
                        {res.page.experiment.banditReordered ? ' · bandit' : ''}
                      </span>
                    )}
                    {tab === 'preview' && (
                      <label className="flex items-center gap-1.5 font-semibold">
                        <Switch checked={explain} onChange={setExplain} label="Explain modules" /> Explain
                      </label>
                    )}
                    <Link href={previewUrl(cfg)} target="_blank" className="inline-flex items-center gap-1 font-semibold hover:text-ink" title="Open this visitor's page in the real storefront">
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open live
                    </Link>
                  </div>
                </div>

                {tab === 'preview' && (
                  <>
                    <Preview result={res} cfg={cfg} explain={explain} />
                    {meta && <GenderGeoCheck cfg={cfg} regions={normOpts(meta.regions).map((o) => o.value)} />}
                  </>
                )}
                {tab === 'reasoning' &&
                  (res.page ? (
                    <AgentReasoning page={res.page} layout="cards" />
                  ) : (
                    <div className="skeleton h-96 w-full" />
                  ))}
                {tab === 'json' && (
                  <div className="relative">
                    <button
                      type="button"
                      className="btn-outline absolute right-3 top-3 px-3 py-1.5 text-xs"
                      onClick={() => {
                        navigator.clipboard?.writeText(json).catch(() => undefined);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy
                    </button>
                    <pre className="max-h-[75vh] overflow-auto rounded-xl bg-gray-900 p-4 text-[11px] leading-relaxed text-emerald-200">{json}</pre>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
