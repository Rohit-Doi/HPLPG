import { DEPARTMENTS, isDepartment } from '@/lib/catalog';
import type { ChannelOption, ExperimentVariant, LandingPageRequest, MetaOptions, OptionValue, Preset } from '@/lib/types';
import { cleanContext } from '@/lib/visitor';

export type LabConfig = {
  presetId: string | null;
  device: string;
  channelId: string; // '' = unknown / none, 'custom' = from preset
  utmSource: string;
  utmMedium: string;
  country: string;
  region: string;
  hour: number;
  dow: number;
  landingPageType: string;
  ageGroup: string;
  gender: string;
  incomeGroup: string;
  /** style-quiz answer ('' = none) */
  preferredDepartment: string;
  variant: ExperimentVariant;
  bandit: boolean;
  viewed: string[];
  carted: string[];
};

export type Opt = { value: string; label: string };

export function normOpts(list: OptionValue[] | undefined): Opt[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((o) => {
      if (typeof o === 'string') return { value: o, label: o };
      if (o && typeof o === 'object') {
        const value = String(o.value ?? o.id ?? o.label ?? o.name ?? '');
        return { value, label: String(o.label ?? o.name ?? value) };
      }
      return null;
    })
    .filter((x): x is Opt => !!x && x.value !== '');
}

/** Used when /api/v1/meta/options is unreachable so the Lab still works (with the local fallback page). */
export const FALLBACK_META: MetaOptions = {
  devices: ['mobile', 'desktop', 'tablet'],
  channels: [
    { id: 'direct', label: 'Direct', utmSource: '(direct)', utmMedium: '(none)' },
    { id: 'organic_search', label: 'Organic Search', utmSource: 'google', utmMedium: 'organic' },
    { id: 'paid_search', label: 'Paid Search', utmSource: 'google', utmMedium: 'cpc' },
    { id: 'paid_social', label: 'Paid Social', utmSource: 'facebook', utmMedium: 'paid_social' },
    { id: 'email', label: 'Email', utmSource: 'newsletter', utmMedium: 'email' },
    { id: 'referral', label: 'Referral', utmSource: 'blog', utmMedium: 'referral' },
  ],
  regions: ['California', 'Texas', 'New York', 'Florida', 'Illinois', 'Washington'],
  countries: ['United States', 'Canada', 'United Kingdom', 'India', 'Germany'],
  ageGroups: ['18-24', '25-34', '35-44', '45-54', '55+'],
  genders: ['female', 'male'],
  incomeGroups: ['low', 'medium', 'high'],
  landingTypes: ['homepage', 'category', 'product', 'search'],
  departments: DEPARTMENTS.map((d) => ({ id: d.id, label: d.label })),
  presets: [],
};

export function defaultConfig(): LabConfig {
  const now = new Date();
  return {
    presetId: null,
    device: 'mobile',
    channelId: '',
    utmSource: '',
    utmMedium: '',
    country: '',
    region: '',
    hour: now.getHours(),
    dow: (now.getDay() + 6) % 7,
    landingPageType: 'homepage',
    ageGroup: '',
    gender: '',
    incomeGroup: '',
    preferredDepartment: '',
    variant: 'agent',
    bandit: true,
    viewed: [],
    carted: [],
  };
}

export function applyPreset(base: LabConfig, preset: Preset, channels: ChannelOption[]): LabConfig {
  const c = (preset.context || {}) as Record<string, unknown>;
  const s = (preset.session || (c.session as Preset['session']) || {}) as NonNullable<Preset['session']>;
  const str = (k: string) => (typeof c[k] === 'string' ? (c[k] as string) : '');
  const utmSource = str('utmSource');
  const utmMedium = str('utmMedium');
  const ch = channels.find((x) => x.utmSource === utmSource && x.utmMedium === utmMedium) || (typeof c.channel === 'string' ? channels.find((x) => x.id === c.channel || x.label === c.channel) : undefined);
  const fresh = defaultConfig();
  return {
    ...fresh,
    presetId: preset.id,
    device: str('device') || base.device,
    channelId: ch ? ch.id : utmSource || utmMedium ? 'custom' : '',
    utmSource: ch ? ch.utmSource : utmSource,
    utmMedium: ch ? ch.utmMedium : utmMedium,
    country: str('country'),
    region: str('region'),
    hour: typeof c.localHour === 'number' ? (c.localHour as number) : fresh.hour,
    dow: typeof c.dayOfWeek === 'number' ? (c.dayOfWeek as number) : fresh.dow,
    landingPageType: str('landingPageType') || 'homepage',
    ageGroup: str('ageGroup'),
    gender: str('gender'),
    incomeGroup: str('incomeGroup'),
    preferredDepartment: isDepartment(str('preferredDepartment')) ? str('preferredDepartment') : '',
    variant: base.variant,
    bandit: base.bandit,
    viewed: Array.isArray(s.viewedItems) ? s.viewedItems : Array.isArray(c.viewedItems) ? (c.viewedItems as string[]) : [],
    carted: Array.isArray(s.cartedItems) ? s.cartedItems : Array.isArray(c.cartedItems) ? (c.cartedItems as string[]) : [],
  };
}

export function toRequest(cfg: LabConfig, visitorId: string): LandingPageRequest {
  return {
    visitorId,
    context: cleanContext({
      device: (cfg.device || undefined) as 'mobile' | 'desktop' | 'tablet' | undefined,
      utmSource: cfg.utmSource,
      utmMedium: cfg.utmMedium,
      country: cfg.country,
      region: cfg.region,
      localHour: cfg.hour,
      dayOfWeek: cfg.dow,
      landingPageType: cfg.landingPageType,
      ageGroup: cfg.ageGroup,
      gender: cfg.gender,
      incomeGroup: cfg.incomeGroup,
      preferredDepartment: isDepartment(cfg.preferredDepartment) ? cfg.preferredDepartment : undefined,
    }),
    session: { viewedItems: cfg.viewed, cartedItems: cfg.carted },
    options: { maxModules: 10, variant: cfg.variant, bandit: cfg.bandit },
  };
}

export function previewUrl(cfg: LabConfig) {
  const q = new URLSearchParams();
  if (cfg.utmSource) q.set('utm_source', cfg.utmSource);
  if (cfg.utmMedium) q.set('utm_medium', cfg.utmMedium);
  if (cfg.device) q.set('device', cfg.device);
  if (cfg.country) q.set('country', cfg.country);
  if (cfg.region) q.set('region', cfg.region);
  q.set('hour', String(cfg.hour));
  q.set('dow', String(cfg.dow));
  if (cfg.ageGroup) q.set('age', cfg.ageGroup);
  if (cfg.gender) q.set('gender', cfg.gender);
  if (cfg.incomeGroup) q.set('income', cfg.incomeGroup);
  if (cfg.preferredDepartment) q.set('dept', cfg.preferredDepartment);
  return `/?${q.toString()}`;
}
