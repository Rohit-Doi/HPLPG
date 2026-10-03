'use client';

import { useMemo, useState } from 'react';
import { Eye, Monitor, Plus, Search, ShoppingBag, Smartphone, Tablet, X } from 'lucide-react';
import { CATALOG, DEPARTMENTS, getProducts, searchCatalog } from '@/lib/catalog';
import { Switch } from '@/components/agent/WhyDrawer';
import type { MetaOptions } from '@/lib/types';
import { DAY_SHORT, cn, hourLabel, titleCase } from '@/lib/utils';
import { type LabConfig, type Opt, applyPreset, defaultConfig, normOpts } from './labConfig';

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-semibold text-gray-600">{label}</span>
        {hint && <span className="text-[10px] text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Select({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: Opt[]; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="input py-1.5">
      <option value="">Unknown</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {titleCase(o.label)}
        </option>
      ))}
    </select>
  );
}

const QUICK = [
  { label: "Browsed women's dresses", build: () => ({ viewed: CATALOG.filter((p) => p.subcategory === 'Dresses').slice(0, 3).map((p) => p.id), carted: [] as string[] }) },
  { label: "Browsed men's jackets", build: () => ({ viewed: CATALOG.filter((p) => p.department === 'men' && p.subcategory === 'Jackets & Coats').slice(0, 3).map((p) => p.id), carted: [] as string[] }) },
  {
    label: 'Watch in bag',
    build: () => {
      const w = CATALOG.filter((p) => p.department === 'watches');
      return { viewed: w.slice(0, 2).map((p) => p.id), carted: w.slice(0, 1).map((p) => p.id) };
    },
  },
  { label: 'Browsed sneakers', build: () => ({ viewed: CATALOG.filter((p) => p.subcategory === 'Sneakers').slice(0, 3).map((p) => p.id), carted: [] as string[] }) },
  { label: 'Ring in bag', build: () => ({ viewed: [] as string[], carted: CATALOG.filter((p) => p.subcategory === 'Rings').slice(0, 1).map((p) => p.id) }) },
];

function SessionPicker({ cfg, set }: { cfg: LabConfig; set: (patch: Partial<LabConfig>) => void }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => (q.trim() ? searchCatalog(q).slice(0, 8) : []), [q]);
  const viewed = getProducts(cfg.viewed);
  const carted = getProducts(cfg.carted);

  const Chip = ({ id, name, image, kind }: { id: string; name: string; image: string; kind: 'viewed' | 'carted' }) => (
    <span className={cn('inline-flex max-w-full items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-1.5 text-[11px]', kind === 'carted' ? 'border-brand-200 bg-brand-50' : 'border-gray-200 bg-white')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="" className="h-5 w-5 rounded-full object-cover" />
      <span className="max-w-[140px] truncate">{name}</span>
      <button
        type="button"
        aria-label={`Remove ${name}`}
        onClick={() => set(kind === 'viewed' ? { viewed: cfg.viewed.filter((x) => x !== id) } : { carted: cfg.carted.filter((x) => x !== id) })}
        className="rounded-full p-0.5 hover:bg-gray-200"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((qk) => (
          <button key={qk.label} type="button" onClick={() => set(qk.build())} className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:border-brand-400 hover:text-brand-700">
            {qk.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search catalog to simulate browsing…" aria-label="Search catalog items" className="input py-1.5 pl-8" />
      </div>
      {results.length > 0 && (
        <ul className="max-h-60 divide-y divide-gray-50 overflow-y-auto rounded-md border border-gray-200">
          {results.map((p) => (
            <li key={p.id} className="flex items-center gap-2 p-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image} alt="" className="h-9 w-7 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold">{p.name}</p>
                <p className="truncate text-[10px] text-gray-400">
                  {p.departmentLabel} · {p.subcategory}
                </p>
              </div>
              <button
                type="button"
                title="Add as viewed"
                aria-label={`Add ${p.name} as viewed`}
                disabled={cfg.viewed.includes(p.id)}
                onClick={() => set({ viewed: [p.id, ...cfg.viewed.filter((x) => x !== p.id)].slice(0, 20) })}
                className="inline-flex items-center gap-0.5 rounded border px-1.5 py-1 text-[10px] font-semibold hover:border-ink disabled:opacity-40"
              >
                <Eye className="h-3 w-3" /> View
              </button>
              <button
                type="button"
                title="Add to bag"
                aria-label={`Add ${p.name} to bag`}
                disabled={cfg.carted.includes(p.id)}
                onClick={() => set({ carted: [p.id, ...cfg.carted.filter((x) => x !== p.id)].slice(0, 20) })}
                className="inline-flex items-center gap-0.5 rounded border border-brand-200 px-1.5 py-1 text-[10px] font-semibold text-brand-700 hover:border-brand-500 disabled:opacity-40"
              >
                <ShoppingBag className="h-3 w-3" /> Bag
              </button>
            </li>
          ))}
        </ul>
      )}
      {(viewed.length > 0 || carted.length > 0) && (
        <div className="space-y-1.5 rounded-md bg-gray-50 p-2">
          {viewed.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-[10px] font-bold uppercase text-gray-500">Viewed</span>
              {viewed.map((p) => (
                <Chip key={p.id} id={p.id} name={p.name} image={p.image} kind="viewed" />
              ))}
            </div>
          )}
          {carted.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-[10px] font-bold uppercase text-brand-600">In bag</span>
              {carted.map((p) => (
                <Chip key={p.id} id={p.id} name={p.name} image={p.image} kind="carted" />
              ))}
            </div>
          )}
          <button type="button" onClick={() => set({ viewed: [], carted: [] })} className="text-[11px] font-semibold text-gray-500 underline">
            Clear session
          </button>
        </div>
      )}
    </div>
  );
}

const DEVICE_ICONS: Record<string, typeof Monitor> = { mobile: Smartphone, desktop: Monitor, tablet: Tablet };

export default function LabControls({ meta, cfg, onChange }: { meta: MetaOptions; cfg: LabConfig; onChange: (c: LabConfig) => void }) {
  // any manual edit detaches the config from its preset
  const set = (patch: Partial<LabConfig>) => onChange({ ...cfg, ...patch, presetId: null });
  const devices = normOpts(meta.devices);
  const channels = meta.channels || [];
  const hasSessionItems = cfg.viewed.length + cfg.carted.length > 0;
  const hasDemo = !!(cfg.ageGroup || cfg.gender || cfg.preferredDepartment);
  const departments = meta.departments?.length ? meta.departments : DEPARTMENTS.map((d) => ({ id: d.id, label: d.label }));
  const hasCtx = !!(cfg.channelId || cfg.country || cfg.region);
  const level = hasSessionItems ? 3 : hasDemo ? 2 : hasCtx ? 1 : 0;

  return (
    <div className="space-y-5">
      {meta.presets?.length > 0 && (
        <section>
          <p className="label-xs mb-2">Visitor presets</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {meta.presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange(applyPreset(cfg, p, channels))}
                title={p.description}
                className={cn(
                  'rounded-lg border p-2 text-left transition',
                  cfg.presetId === p.id ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-gray-200 bg-white hover:border-gray-400',
                )}
              >
                <p className="text-xs font-bold text-ink">{p.label}</p>
                <p className="line-clamp-2 text-[10px] leading-snug text-gray-500">{p.description}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="label-xs">Context</p>
          <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold text-white">expected level ≈ L{level}</span>
        </div>
        <Field label="Device">
          <div className="grid grid-cols-3 gap-1.5">
            {(devices.length ? devices : [{ value: 'mobile', label: 'mobile' }, { value: 'desktop', label: 'desktop' }, { value: 'tablet', label: 'tablet' }]).map((d) => {
              const Icon = DEVICE_ICONS[d.value] || Monitor;
              return (
                <button
                  key={d.value}
                  type="button"
                  aria-pressed={cfg.device === d.value}
                  onClick={() => set({ device: d.value })}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-md border py-1.5 text-xs font-semibold',
                    cfg.device === d.value ? 'border-ink bg-ink text-white' : 'border-gray-200 hover:border-gray-400',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden /> {titleCase(d.label)}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Traffic channel" hint={cfg.utmSource ? `utm ${cfg.utmSource} / ${cfg.utmMedium}` : undefined}>
          <select
            aria-label="Traffic channel"
            className="input py-1.5"
            value={cfg.channelId}
            onChange={(e) => {
              const ch = channels.find((c) => c.id === e.target.value);
              set({ channelId: e.target.value, utmSource: ch?.utmSource || '', utmMedium: ch?.utmMedium || '' });
            }}
          >
            <option value="">Unknown</option>
            {cfg.channelId === 'custom' && <option value="custom">Custom ({cfg.utmSource}/{cfg.utmMedium})</option>}
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Country">
            <Select label="Country" value={cfg.country} onChange={(v) => set({ country: v })} options={normOpts(meta.countries)} />
          </Field>
          <Field label="US region">
            <Select label="US region" value={cfg.region} onChange={(v) => set({ region: v })} options={normOpts(meta.regions)} />
          </Field>
        </div>
        <Field label="Local hour" hint={hourLabel(cfg.hour)}>
          <input
            type="range"
            min={0}
            max={23}
            value={cfg.hour}
            onChange={(e) => set({ hour: Number(e.target.value) })}
            className="w-full accent-brand-600"
            aria-label="Local hour"
          />
          <div className="flex justify-between text-[10px] text-gray-400">
            <span>12am</span>
            <span>6am</span>
            <span>12pm</span>
            <span>6pm</span>
            <span>11pm</span>
          </div>
        </Field>
        <Field label="Day of week">
          <div className="grid grid-cols-7 gap-1">
            {DAY_SHORT.map((d, i) => (
              <button
                key={d}
                type="button"
                aria-pressed={cfg.dow === i}
                onClick={() => set({ dow: i })}
                className={cn('rounded py-1 text-[11px] font-semibold', cfg.dow === i ? 'bg-ink text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
              >
                {d}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Landing page type">
          <select aria-label="Landing page type" className="input py-1.5" value={cfg.landingPageType} onChange={(e) => set({ landingPageType: e.target.value })}>
            {(normOpts(meta.landingTypes).length ? normOpts(meta.landingTypes) : [{ value: 'homepage', label: 'homepage' }]).map((o) => (
              <option key={o.value} value={o.value}>
                {titleCase(o.label)}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section className="space-y-3">
        <p className="label-xs">Declared preferences (style quiz, optional)</p>
        <Field label="Preferred department (style quiz)" hint="Level 2 elicitation">
          <select aria-label="Preferred department" className="input py-1.5" value={cfg.preferredDepartment} onChange={(e) => set({ preferredDepartment: e.target.value })}>
            <option value="">Not asked / skipped</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Age">
            <Select label="Age group" value={cfg.ageGroup} onChange={(v) => set({ ageGroup: v })} options={normOpts(meta.ageGroups)} />
          </Field>
          <Field label="Gender">
            <Select label="Gender" value={cfg.gender} onChange={(v) => set({ gender: v })} options={normOpts(meta.genders)} />
          </Field>
          <Field label="Income (ignored: leaky in training data)">
            <Select label="Income group" value={cfg.incomeGroup} onChange={(v) => set({ incomeGroup: v })} options={normOpts(meta.incomeGroups)} />
          </Field>
        </div>
      </section>

      <section className="space-y-2">
        <p className="label-xs flex items-center gap-1">
          <Plus className="h-3 w-3" aria-hidden /> Simulate browsing (in-session)
        </p>
        <SessionPicker cfg={cfg} set={set} />
      </section>

      <section className="space-y-3">
        <p className="label-xs">Online experiment</p>
        <Field label="Variant" hint="options.variant">
          <div className="grid grid-cols-2 gap-1.5">
            {(['agent', 'control'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={cfg.variant === v}
                onClick={() => set({ variant: v })}
                className={cn(
                  'rounded-md border py-1.5 text-xs font-semibold',
                  cfg.variant === v ? 'border-ink bg-ink text-white' : 'border-gray-200 hover:border-gray-400',
                )}
              >
                {v === 'agent' ? 'Agent (personalized)' : 'Control (popularity)'}
              </button>
            ))}
          </div>
        </Field>
        <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
          <div>
            <p className="text-xs font-semibold text-gray-700">Bandit module ordering</p>
            <p className="text-[10px] text-gray-400">options.bandit — learn module order from live clicks</p>
          </div>
          <Switch checked={cfg.bandit} onChange={(v) => set({ bandit: v })} label="Bandit module ordering" />
        </div>
      </section>

      <button type="button" onClick={() => onChange(defaultConfig())} className="text-xs font-semibold text-gray-500 underline">
        Reset to anonymous visitor
      </button>
    </div>
  );
}
