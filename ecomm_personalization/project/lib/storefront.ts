import storefrontRaw from '@/data/storefront.json';
import bannersRaw from '@/data/banners.json';
import { CATALOG, fixImagePath, getProduct, getProducts } from './catalog';
import { formatPrice } from './utils';
import type { PointsRules } from './types';
import type { Banner, Brand, Collection, Coupon, HeroSlide, PaymentMethodOption, Product, Quote, QuoteLine, QuoteRequest, Storefront } from './types';

/** Merchandising data written by the pipeline (also served by GET /api/v1/storefront). */
export const STOREFRONT: Storefront = {
  ...(storefrontRaw as unknown as Storefront),
  categoryTiles: (storefrontRaw as unknown as Storefront).categoryTiles.map((t) => ({ ...t, image: fixImagePath(t.image) })),
  brands: (storefrontRaw as unknown as Storefront).brands.map((b) => ({ ...b, image: fixImagePath(b.image) })),
  collections: (storefrontRaw as unknown as Storefront).collections.map((c) => ({ ...c, image: fixImagePath(c.image) })),
};

export const BANNERS: Banner[] = bannersRaw as unknown as Banner[];

/** All amounts are INR (whole rupees) — v6 Indian store. */
export const FREE_SHIPPING_OVER = STOREFRONT.freeShippingOver ?? 1499;
export const SHIPPING = STOREFRONT.shipping;
export const POINTS: PointsRules = {
  perHundred: 5,
  block: 100,
  blockValue: 100,
  minOrder: 999,
  welcome: 250,
  text: 'Earn 5 points per ₹100 · 1 point = ₹1 · redeem 100 at a time on orders of ₹999+',
  ...((STOREFRONT.points || {}) as Partial<PointsRules>),
};
export const COD_FEE = STOREFRONT.codFee ?? 49;
export const BANK_OFFER = STOREFRONT.bankOffer;
export const COUPONS: Coupon[] = STOREFRONT.coupons;
/** Payment methods (same ids the backend returns in quote.paymentMethods), UPI first as in storefront.json. */
export const PAYMENT_METHODS: PaymentMethodOption[] = (STOREFRONT.paymentMethods as PaymentMethodOption[] | undefined)?.length
  ? (STOREFRONT.paymentMethods as PaymentMethodOption[])
  : [
      { id: 'upi', label: 'UPI', note: 'Google Pay, PhonePe, Paytm, BHIM', group: 'upi' },
      { id: 'credit_card', label: 'Credit card', note: 'Visa, Mastercard, RuPay, Amex · bank offer eligible', group: 'card' },
      { id: 'debit_card', label: 'Debit card', note: 'Visa, Mastercard, RuPay debit', group: 'card' },
      { id: 'netbanking', label: 'Net banking', note: 'All major Indian banks', group: 'bank' },
      { id: 'wallet', label: 'Wallet', note: 'Paytm, Amazon Pay, Mobikwik', group: 'wallet' },
      { id: 'cod', label: 'Cash on delivery', note: `${formatPrice(COD_FEE)} handling fee`, group: 'cash' },
    ];

/** Methods that pay by card (bank offer eligible only for credit cards). */
export const CARD_METHODS = new Set<string>(['credit_card', 'debit_card', 'card']);
export const BANK_OFFER_METHODS = new Set<string>(['credit_card', 'card']);

/* --------------------------------- brands --------------------------------- */

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function getBrand(id: string): Brand | undefined {
  return STOREFRONT.brands.find((b) => b.id === id) || STOREFRONT.brands.find((b) => slugify(b.name) === id);
}

export function brandIdFor(name: string): string {
  return STOREFRONT.brands.find((b) => b.name === name)?.id || slugify(name);
}

export function brandProducts(brand: Brand): Product[] {
  return CATALOG.filter((p) => p.brand === brand.name);
}

/** Brands sorted by popularity (catalog weight). */
export function topBrands(n = 6): Brand[] {
  return [...STOREFRONT.brands].sort((a, b) => b.popularity - a.popularity).slice(0, n);
}

/* ------------------------------- collections ------------------------------- */

export function getCollection(id: string): Collection | undefined {
  return STOREFRONT.collections.find((c) => c.id === id);
}

export function collectionProducts(c: Collection): Product[] {
  return getProducts(c.itemIds);
}

/* ---------------------------------- banners -------------------------------- */

/** banners.json -> hero_carousel slide shape (cta object, score, why). */
export function bannerToSlide(b: Banner, why = '', score = 0.5): HeroSlide {
  return {
    id: b.id,
    kind: b.kind,
    image: b.image,
    imageSquare: b.imageSquare,
    eyebrow: b.eyebrow,
    title: b.title,
    subtitle: b.subtitle,
    cta: { label: b.cta, href: b.href },
    badge: b.badge ?? null,
    department: b.department ?? null,
    score,
    why,
    copySource: 'designed creative',
  };
}

export function bannerById(id: string): Banner | undefined {
  return BANNERS.find((b) => b.id === id);
}

/* -------------------------------- coupons --------------------------------- */

/** Coupons that can apply to a product (shown on the product page "offers" block). */
export function couponsForProduct(p: Product): Coupon[] {
  return COUPONS.filter((c) => {
    if (c.code === 'WATCH15') return p.department === 'watches';
    if (c.code === 'STYLE25') return p.department === 'women';
    return true;
  });
}

/* ------------------------------ local quote -------------------------------- */

type CouponRule = { type: 'pct' | 'shipping'; value: number; cap: number; min: number; firstOrderOnly: boolean; department?: string; label: string };

/** Same rules as backend/hplpga/store/promotions.py (INR) — used only when POST /checkout/quote is unreachable. */
const COUPON_RULES: Record<string, CouponRule> = {
  WELCOME10: { type: 'pct', value: 10, cap: 750, min: 0, firstOrderOnly: true, label: '10% off your first order (up to ₹750)' },
  AURA20: { type: 'pct', value: 20, cap: 2500, min: 9999, firstOrderOnly: false, label: '20% off orders above ₹9,999 (up to ₹2,500)' },
  FREESHIP: { type: 'shipping', value: 0, cap: 0, min: 0, firstOrderOnly: false, label: 'Free standard delivery' },
  WATCH15: { type: 'pct', value: 15, cap: 5000, min: 0, firstOrderOnly: false, department: 'watches', label: '15% off watches (up to ₹5,000)' },
  STYLE25: { type: 'pct', value: 25, cap: 2000, min: 4999, firstOrderOnly: false, department: 'women', label: '25% off womenswear above ₹4,999 (up to ₹2,000)' },
};

const DEPT_LABEL: Record<string, string> = { women: 'Women', men: 'Men', footwear: 'Footwear', watches: 'Watches', jewellery: 'Jewellery', accessories: 'Accessories' };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function localQuote(req: QuoteRequest, opts: { firstOrder?: boolean; pointsBalance?: number; signedIn?: boolean } = {}): Quote {
  const firstOrder = opts.firstOrder ?? true;
  const pointsBalance = opts.pointsBalance ?? 0;
  const lines: QuoteLine[] = [];
  let subtotal = 0;
  let savings = 0;
  for (const it of req.items) {
    const p = getProduct(it.id);
    if (!p) continue;
    const qty = Math.max(1, Math.floor(it.qty || 1));
    const line = r2(p.price * qty);
    const was = r2((p.compareAt ?? p.price) * qty);
    lines.push({
      id: p.id,
      name: p.name,
      brand: p.brand,
      image: p.image,
      qty,
      size: it.size ?? null,
      unitPrice: p.price,
      compareAt: p.compareAt,
      lineTotal: line,
      department: p.department,
    });
    subtotal += line;
    savings += was - line;
  }
  subtotal = r2(subtotal);
  const errors: string[] = [];
  const shippingId = req.shipping === 'express' ? 'express' : 'standard';
  const ship = SHIPPING[shippingId] || SHIPPING.standard;
  let shippingCost = subtotal >= FREE_SHIPPING_OVER && shippingId === 'standard' ? 0 : ship.price;
  let couponDiscount = 0;
  let couponInfo: Quote['coupon'] = null;
  const code = (req.coupon || '').trim().toUpperCase();
  if (code) {
    const c = COUPON_RULES[code];
    if (!c) errors.push(`Coupon ${req.coupon} is not valid.`);
    else if (c.firstOrderOnly && !firstOrder) errors.push('WELCOME10 is only valid on your first order.');
    else if (subtotal < c.min) errors.push(`Coupon ${code} needs a subtotal of at least ${formatPrice(c.min)}.`);
    else {
      const elig = c.department ? lines.filter((l) => l.department === c.department).reduce((s, l) => s + l.lineTotal, 0) : subtotal;
      if (c.department && elig <= 0) errors.push(`Coupon ${code} only applies to ${DEPT_LABEL[c.department] || c.department} items.`);
      else if (c.type === 'pct') {
        couponDiscount = Math.floor(Math.min((elig * c.value) / 100, c.cap || 1e12));
        couponInfo = { code, label: c.label, discount: couponDiscount };
      } else {
        couponDiscount = shippingCost;
        shippingCost = 0;
        couponInfo = { code, label: c.label, discount: couponDiscount };
      }
    }
  }
  let bankDiscount = 0;
  if (req.bankCard && BANK_OFFER_METHODS.has(req.paymentMethod) && subtotal >= BANK_OFFER.min) {
    bankDiscount = Math.floor(Math.min((subtotal * BANK_OFFER.pct) / 100, BANK_OFFER.cap));
  }
  const codFee = req.paymentMethod === 'cod' ? COD_FEE : 0;
  const after = Math.max(subtotal - couponDiscount - bankDiscount, 0);
  let blocks = 0;
  const usePoints = Math.max(0, Math.floor(req.usePoints || 0));
  if (usePoints && subtotal >= POINTS.minOrder) {
    blocks = Math.min(Math.floor(usePoints / POINTS.block), Math.floor(pointsBalance / POINTS.block), Math.floor(after / POINTS.blockValue));
  }
  const pointsDiscount = r2(blocks * POINTS.blockValue);
  const total = r2(Math.max(after - pointsDiscount, 0) + shippingCost + codFee);
  const pointsEarned = Math.floor(((total - shippingCost - codFee) * POINTS.perHundred) / 100);
  return {
    lines,
    subtotal,
    itemSavings: r2(savings),
    coupon: couponInfo,
    couponDiscount,
    bankDiscount,
    bankOffer: BANK_OFFER_METHODS.has(req.paymentMethod) ? BANK_OFFER : null,
    pointsUsed: blocks * POINTS.block,
    pointsDiscount,
    shipping: { id: shippingId, label: ship.label, price: ship.price, cost: shippingCost, freeOver: FREE_SHIPPING_OVER },
    codFee,
    total,
    pointsEarned,
    errors,
    paymentMethods: PAYMENT_METHODS,
    availableCoupons: COUPONS.filter((c) => !c.firstOrderOnly || firstOrder).map((c) => ({ code: c.code, label: c.label })),
    pointsBalance,
    signedIn: !!opts.signedIn,
    offline: true,
  };
}

/* ------------------------------ India-first addresses ------------------------------ */

/** Static fallback for GET /meta/india-states (28 states + 8 union territories). */
export const INDIA_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand',
  'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

/** India first; other countries stay selectable. */
export const COUNTRIES = ['India', 'United Arab Emirates', 'United States', 'United Kingdom', 'Canada', 'Australia', 'Singapore', 'Germany', 'France', 'Other'];

export { PIN_RE, MOBILE_RE, normalizeMobile, formatMobile } from './address';

export const AGE_GROUPS = ['18-24', '25-34', '35-44', '45-54', '55+'];
export const STYLES = ['Minimal', 'Streetwear', 'Formal', 'Ethnic', 'Luxury', 'Athleisure', 'Party'];
export const BUDGETS: { id: string; label: string; hint: string }[] = [
  { id: 'value', label: 'Value', hint: 'Under ₹1,999' },
  { id: 'mid', label: 'Mid', hint: '₹2,000 – ₹9,999' },
  { id: 'premium', label: 'Premium', hint: '₹10,000 – ₹39,999' },
  { id: 'luxury', label: 'Luxury', hint: '₹40,000+' },
];
