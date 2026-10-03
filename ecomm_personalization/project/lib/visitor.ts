import { isDepartment } from './catalog';
import type { RequestContext } from './types';

export function detectDevice(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobi/i.test(ua))) return 'tablet';
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)) return 'mobile';
  const w = window.innerWidth;
  if (w < 640) return 'mobile';
  if (w < 1024 && 'ontouchstart' in window) return 'tablet';
  return 'desktop';
}

const num = (v: string | null) => {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Build the landing-page request context from the real browser environment, then apply
 * optional demo overrides from the URL (?device=&region=&country=&hour=&dow=&age=&gender=&income=&dept=&utm_*=).
 */
export function buildBrowserContext(params: URLSearchParams): { context: RequestContext; overrides: string[] } {
  const now = new Date();
  const jsDay = now.getDay(); // 0=Sun
  let tz: string | undefined;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    tz = undefined;
  }
  const ctx: RequestContext = {
    device: detectDevice(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    utmSource: params.get('utm_source') || undefined,
    utmMedium: params.get('utm_medium') || undefined,
    utmCampaign: params.get('utm_campaign') || undefined,
    referrer: typeof document !== 'undefined' && document.referrer ? document.referrer : undefined,
    timezone: tz,
    localHour: now.getHours(),
    dayOfWeek: (jsDay + 6) % 7,
    landingPageType: 'homepage',
  };

  const overrides: string[] = [];
  const dev = params.get('device');
  if (dev === 'mobile' || dev === 'desktop' || dev === 'tablet') {
    ctx.device = dev;
    overrides.push('device');
  }
  const map: [string, keyof RequestContext][] = [
    ['region', 'region'],
    ['country', 'country'],
    ['city', 'city'],
    ['age', 'ageGroup'],
    ['gender', 'gender'],
    ['income', 'incomeGroup'],
    ['landing', 'landingPageType'],
  ];
  for (const [q, k] of map) {
    const v = params.get(q);
    if (v) {
      (ctx as Record<string, unknown>)[k] = v;
      overrides.push(k);
    }
  }
  const dept = params.get('dept') || params.get('department');
  if (dept && isDepartment(dept)) {
    ctx.preferredDepartment = dept;
    overrides.push('preferredDepartment');
  }
  const hour = num(params.get('hour'));
  if (hour !== undefined) {
    ctx.localHour = Math.max(0, Math.min(23, Math.round(hour)));
    overrides.push('localHour');
  }
  const dow = num(params.get('dow'));
  if (dow !== undefined) {
    ctx.dayOfWeek = Math.max(0, Math.min(6, Math.round(dow)));
    overrides.push('dayOfWeek');
  }
  if (ctx.utmSource) overrides.push('utmSource');
  if (ctx.utmMedium) overrides.push('utmMedium');
  return { context: ctx, overrides };
}

/** Remove empty values so the backend sees "unknown" rather than "". */
export function cleanContext(ctx: RequestContext): RequestContext {
  const out: Record<string, unknown> = {};
  Object.entries(ctx).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  });
  return out as RequestContext;
}
