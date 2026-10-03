import { CATALOG, DEPARTMENTS, byDepartment, countBy, getProducts, isDepartment, newProducts, relatedFromCatalog, saleProducts } from './catalog';
import { BANK_OFFER, BANNERS, COUPONS, FREE_SHIPPING_OVER, POINTS, STOREFRONT, bannerToSlide, topBrands } from './storefront';
import type { ColdStartLevel, HeroSlide, LandingPage, Module, RequestContext } from './types';
import { DAY_NAMES, formatPrice } from './utils';

function daypart(h: number) {
  if (h < 5) return 'Late night';
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  if (h < 21) return 'Evening';
  return 'Night';
}

export type FallbackUser = { name?: string; points?: number; signedIn: boolean; preferredDepartments?: string[]; gender?: string; ageGroup?: string };

/**
 * Local page used when the agent API is unreachable. It is built from the same designed creatives
 * (banners.json), merchandising data (storefront.json) and catalog popularity, and is clearly labelled
 * as a fallback in the UI.
 */
export function buildFallbackPage(
  ctx: RequestContext,
  session: { viewedItems?: string[]; cartedItems?: string[] },
  user?: FallbackUser | null,
): LandingPage {
  const viewed = getProducts(session.viewedItems || []);
  const carted = getProducts(session.cartedItems || []);
  const hasSession = viewed.length + carted.length > 0;
  const hasDemo = !!(ctx.ageGroup || ctx.gender || ctx.incomeGroup);
  const hasCtx = !!(ctx.utmSource || ctx.country || ctx.region || ctx.referrer);
  const hasDeclared = hasDemo || !!ctx.preferredDepartment;
  const signedIn = !!user?.signedIn;
  const level: ColdStartLevel = signedIn ? 4 : hasSession ? 3 : hasDeclared ? 2 : hasCtx ? 1 : 0;
  const labels = ['Anonymous', 'Contextual', 'Contextual + demographics', 'In-session', 'Returning customer'];

  // department preference: declared (style quiz / onboarding) > session > global popularity
  const seed = [...carted, ...viewed];
  const depCounts = countBy(seed, (p) => p.department);
  const profileDep = user?.preferredDepartments?.find((d) => isDepartment(d));
  const declaredDep = ctx.preferredDepartment && isDepartment(ctx.preferredDepartment) ? ctx.preferredDepartment : profileDep && isDepartment(profileDep) ? profileDep : null;
  const topDep = declaredDep || (depCounts[0]?.name as string) || CATALOG[0].department;
  const depLabel = DEPARTMENTS.find((d) => d.id === topDep)?.label || 'Women';
  const hour = ctx.localHour ?? new Date().getHours();
  const month = new Date().getMonth() + 1;
  const season = month <= 2 || month === 12 ? 'Winter' : month <= 5 ? 'Spring' : month <= 8 ? 'Summer' : 'Fall';
  const genderAudience = /^f/i.test(ctx.gender || user?.gender || '') ? 'women' : /^m/i.test(ctx.gender || user?.gender || '') ? 'men' : null;
  const stage: 'discover' | 'explore' | 'buy_now' = carted.length ? 'buy_now' : hasSession ? 'explore' : 'discover';

  /* ------------------------------ hero carousel ------------------------------ */
  const slides: HeroSlide[] = [];
  const pushBanner = (id: string, why: string, score: number) => {
    const b = BANNERS.find((x) => x.id === id);
    if (b && !slides.some((s) => s.id === id)) slides.push(bannerToSlide(b, why, score));
  };
  if (signedIn) pushBanner('bank', `Welcome back${user?.name ? `, ${user.name}` : ''} — card offers for returning customers.`, 0.9);
  else pushBanner('welcome', 'First-order offer for new visitors (Level 0-2).', 0.92);
  pushBanner(`dept-${topDep}`, declaredDep ? `You told us you are shopping for ${depLabel}.` : hasSession ? `Your session leans towards ${depLabel}.` : `Most popular department overall.`, 0.85);
  if (stage !== 'discover' || hour >= 17) pushBanner('sale', stage === 'buy_now' ? 'Ready-to-buy visitors respond best to price cuts.' : 'Evening / exploring visitors respond well to the sale.', 0.8);
  pushBanner(`season-${season.toLowerCase()}`, `It is ${season} in your timezone.`, 0.7);
  if (stage === 'buy_now') pushBanner('free-shipping', 'Items in bag — shipping threshold nudge.', 0.66);
  else pushBanner('new', 'Fresh arrivals for exploring visitors.', 0.6);
  if (slides.length < 5) pushBanner('value', 'Everyday value picks.', 0.5);

  const modules: Module[] = [
    {
      id: 'fb-announcement',
      type: 'announcement',
      tone: signedIn ? 'promo' : 'info',
      text: signedIn
        ? `Welcome back${user?.name ? `, ${user.name}` : ''} · ${user?.points ?? 0} points to spend · Free delivery over ${formatPrice(FREE_SHIPPING_OVER)}`
        : `Free delivery on orders over ${formatPrice(FREE_SHIPPING_OVER)} · Easy 30-day returns · Use WELCOME10 for 10% off your first order`,
      reason: 'Default announcement (agent offline).',
      strategy: 'static',
    },
    {
      id: 'fb-hero-carousel',
      type: 'hero_carousel',
      slides: slides.slice(0, 6),
      reason: 'Designed campaign creatives ranked by a simple stage / department / season rule (agent offline).',
      strategy: 'rules (local fallback)',
      signals: [`Stage: ${stage}`, `Department: ${depLabel}`, `Season: ${season}`],
    },
    {
      id: 'fb-offers',
      type: 'offer_strip',
      offers: [
        { icon: 'credit-card', title: `${BANK_OFFER.pct}% instant discount`, text: `${BANK_OFFER.bank} credit cards · up to ${formatPrice(BANK_OFFER.cap)} on orders of ${formatPrice(BANK_OFFER.min)}+`, code: null },
        ...(signedIn
          ? [{ icon: 'gift', title: `${user?.points ?? 0} points`, text: `1 point = ₹1 · redeem ${POINTS.block} at a time`, code: null }]
          : [{ icon: 'tag', title: 'Flat 10% off', text: COUPONS.find((c) => c.code === 'WELCOME10')?.label || 'First order', code: 'WELCOME10' }]),
        { icon: 'sparkles', title: `20% off above ${formatPrice(COUPONS.find((c) => c.code === 'AURA20')?.min ?? 9999)}`, text: COUPONS.find((c) => c.code === 'AURA20')?.label || '', code: 'AURA20' },
        { icon: 'truck', title: 'Free delivery', text: `Standard delivery is free over ${formatPrice(FREE_SHIPPING_OVER)}`, code: 'FREESHIP' },
      ],
      reason: 'Store-wide offers from the promotions engine.',
      strategy: 'static (storefront.json)',
    },
  ];

  /* ---------------------------------- rails ---------------------------------- */
  if (signedIn || hasSession) {
    const history = [...viewed, ...carted.filter((c) => !viewed.some((v) => v.id === c.id))];
    if (history.length) {
      modules.push({
        id: 'history',
        type: 'product_carousel',
        title: 'Recently viewed',
        subtitle: 'Pick up where you left off',
        products: history.slice(0, 12),
        viewAllHref: '/account?tab=personalization',
        reason: 'Your own browsing history in this browser.',
        strategy: 'history (local fallback)',
      });
    }
  }

  if (hasSession) {
    const anchor = seed[0];
    const recs = relatedFromCatalog(anchor, 12).filter((p) => !seed.some((s) => s.id === p.id));
    modules.push({
      id: 'fb-session',
      type: 'product_carousel',
      title: `Because you looked at ${anchor.subcategory}`,
      subtitle: `Similar picks to ${anchor.name}`,
      products: recs,
      viewAllHref: `/shop/${anchor.department}?sub=${encodeURIComponent(anchor.subcategory)}`,
      reason: 'Same subcategory as your most recent item.',
      strategy: 'catalog similarity (local fallback)',
    });
  }

  if (declaredDep || genderAudience) {
    const pool = declaredDep ? byDepartment(declaredDep) : CATALOG;
    const picks = genderAudience ? [...pool.filter((p) => p.audience === genderAudience), ...pool.filter((p) => p.audience === 'unisex')] : pool;
    const title = genderAudience ? `For ${genderAudience === 'women' ? 'her' : 'him'}${declaredDep ? ` · ${depLabel}` : ''}` : `The ${depLabel} edit`;
    modules.push({
      id: 'fb-declared',
      type: 'product_carousel',
      title,
      subtitle: 'Picked from what you told us you are shopping for',
      products: picks.slice(0, 12),
      viewAllHref: declaredDep ? `/shop/${declaredDep}` : '/new',
      reason: signedIn ? 'Declared preference from your onboarding profile.' : 'Declared preference from the style quiz (Level 2).',
      strategy: 'declared preference + popularity (local fallback)',
    });
  }

  /* ------------------------------ category grid ------------------------------ */
  const tiles = [...STOREFRONT.categoryTiles].sort((a, b) => Number(b.department === topDep) - Number(a.department === topDep) || b.popularity - a.popularity);
  modules.push({
    id: 'fb-category-grid',
    type: 'category_grid',
    title: 'Shop by category',
    tiles: tiles.slice(0, 12),
    reason: `Most popular subcategories, ${depLabel} first.`,
    strategy: 'popularity (storefront.json)',
  });

  modules.push({
    id: 'fb-best-all',
    type: 'product_carousel',
    title: 'Trending now',
    subtitle: 'The most-loved pieces across the store',
    products: CATALOG.slice(0, 12),
    viewAllHref: '/collections/bestsellers',
    reason: 'Global popularity across all departments.',
    strategy: 'popularity (local fallback)',
  });

  /* ------------------------------- brand spotlight ------------------------------ */
  modules.push({
    id: 'fb-brands',
    type: 'brand_spotlight',
    title: 'Brand spotlight',
    brands: topBrands(6).map((b) => ({
      id: b.id,
      name: b.name,
      image: b.image,
      items: b.items,
      href: `/brands/${b.id}`,
      offer: b.maxDiscount > 0 ? `UP TO ${b.maxDiscount}% OFF` : 'NEW SEASON',
      why: `${b.items} styles · popular in ${b.departments.slice(0, 2).join(' & ')}`,
    })),
    reason: 'Brands with the most views and orders.',
    strategy: 'popularity (storefront.json)',
  });

  const railDeps = declaredDep ? [DEPARTMENTS.find((d) => d.id === declaredDep)!, ...DEPARTMENTS.filter((d) => d.id !== declaredDep)] : DEPARTMENTS;
  railDeps.slice(0, 3).forEach((d, i) => {
    modules.push({
      id: `fb-best-${d.id}`,
      type: 'product_carousel',
      title: `Bestsellers in ${d.label}`,
      subtitle: d.tagline,
      products: byDepartment(d.id).slice(0, 12),
      viewAllHref: `/shop/${d.id}`,
      reason: `Global popularity in ${d.label}.`,
      strategy: 'popularity (local fallback)',
    });
    if (i === 0) {
      const sale = saleProducts();
      if (sale.length) {
        modules.push({
          id: 'fb-sale',
          type: 'cta_banner',
          variant: 'offer',
          title: `Up to ${Math.max(...sale.map((p) => p.discountPct))}% off`,
          subtitle: `${sale.length} styles on sale right now — discounts come from observed markdowns and clearance rules.`,
          cta: { label: 'Shop the sale', href: '/sale' },
          image: sale[0].image,
          code: 'AURA20',
          reason: 'Sale inventory available.',
          strategy: 'static',
        });
      }
    }
  });

  modules.push({
    id: 'fb-new',
    type: 'product_carousel',
    title: 'New in',
    subtitle: 'Just landed',
    products: newProducts().slice(0, 12),
    viewAllHref: '/new',
    reason: 'Newest catalog additions.',
    strategy: 'recency (local fallback)',
  });

  modules.push({
    id: 'fb-trust',
    type: 'trust_bar',
    items: [
      { icon: 'truck', label: `Free delivery over ${formatPrice(FREE_SHIPPING_OVER)}` },
      { icon: 'refresh', label: '30-day easy returns' },
      { icon: 'shield', label: 'Secure checkout' },
      { icon: 'sparkles', label: 'Curated by our style agent' },
    ],
    reason: 'Reassurance for first-time visitors.',
    strategy: 'static',
  });

  const signals = [
    `Device: ${ctx.device || 'unknown'}`,
    `Local time: ${hour}:00 (${daypart(hour)})`,
    ctx.dayOfWeek != null ? `Day: ${DAY_NAMES[ctx.dayOfWeek]}` : '',
    ctx.utmSource ? `UTM source: ${ctx.utmSource}` : '',
    declaredDep ? `Declared interest: ${depLabel}` : '',
    ctx.gender ? `Declared gender: ${ctx.gender}` : '',
    ctx.ageGroup ? `Declared age group: ${ctx.ageGroup}` : '',
    ctx.timezone ? `Timezone: ${ctx.timezone}` : '',
    hasSession ? `Session: ${viewed.length} viewed, ${carted.length} in bag` : '',
    signedIn ? `Signed in${user?.name ? ` as ${user.name}` : ''}` : '',
  ].filter(Boolean);

  return {
    pageId: `offline-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    latencyMs: 0,
    offline: true,
    user: signedIn ? { name: user?.name, points: user?.points, returning: true } : null,
    experiment: { variant: 'agent', bucket: 0, banditReordered: false, description: 'Agent offline — no experiment assignment.' },
    visitor: {
      coldStartLevel: level,
      levelLabel: labels[level],
      resolvedContext: {
        device: ctx.device || 'unknown',
        channel: ctx.utmSource ? `${ctx.utmSource}${ctx.utmMedium ? ' / ' + ctx.utmMedium : ''}` : ctx.referrer ? 'Referral' : 'Direct',
        source: ctx.utmSource || '(direct)',
        medium: ctx.utmMedium || '(none)',
        country: ctx.country || 'Unknown',
        region: ctx.region || 'Unknown',
        city: ctx.city || null,
        geo: ctx.region || ctx.country || ctx.timezone || 'Unknown',
        macroRegion: 'Unknown',
        daypart: daypart(hour),
        localHour: hour,
        dayOfWeek: ctx.dayOfWeek ?? 0,
        month,
        season,
        landingPageType: ctx.landingPageType || 'homepage',
        ageGroup: ctx.ageGroup || user?.ageGroup || null,
        gender: ctx.gender || user?.gender || null,
        incomeGroup: ctx.incomeGroup || null,
        preferredDepartment: declaredDep,
      },
      signalsUsed: signals,
    },
    inference: {
      persona: {
        id: 'fallback',
        name: 'Unclassified visitor',
        tagline: 'Agent offline — showing popular picks',
        description: 'The personalization agent could not be reached, so this page is built from designed creatives and global popularity in the local catalog.',
        confidence: 0,
        alternatives: [],
      },
      intent: {
        stage,
        stageLabel: stage === 'buy_now' ? 'Ready to buy' : stage === 'explore' ? 'Exploring' : 'Discovering',
        cartPropensity: 0,
        purchasePropensity: 0,
        baselineCart: 0,
        baselinePurchase: 0,
        lift: 1,
      },
      departmentAffinity: [],
      subcategoryAffinity: [],
      similarVisitors: { count: 0, description: '' },
      backoffPath: [],
      ranking: { reranker: 'popularity', audienceRule: !!genderAudience, candidates: CATALOG.length },
    },
    theme: { accent: '#e11d48', department: topDep },
    modules,
    trace: [
      { step: 'Agent unreachable', detail: 'POST /api/v1/landing-page failed; using local catalog fallback.', durationMs: 0 },
      { step: 'Creative selection', detail: 'Ranked banners.json creatives by stage, department and season.', durationMs: 0 },
      { step: 'Popularity ranking', detail: 'Ranked catalog items by views, carts and orders.', durationMs: 0 },
    ],
  };
}
