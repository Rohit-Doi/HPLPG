// Types mirror docs/API_CONTRACT.md (v1 + v2 + v3 + v4). Keep in sync with the backend.

export type Department = 'women' | 'men' | 'footwear' | 'watches' | 'jewellery' | 'accessories';
export type Audience = 'women' | 'men' | 'unisex';

export type Product = {
  id: string;
  name: string;
  detail: string;
  brand: string;
  department: Department;
  departmentLabel: string;
  /** target audience (from image + real viewer gender mix) */
  audience: Audience;
  /** distinct SKUs sold (colour/size variants) */
  variants: number;
  /** share of the item's viewers resolved as female (0..1) */
  femaleShare: number;
  subcategory: string;
  sourceCategory: string;
  price: number;
  compareAt: number | null;
  discountPct: number;
  onSale: boolean;
  image: string;
  isBestseller: boolean;
  isNew: boolean;
  stats: { views: number; carts: number; orders: number; cartRate: number };
  score?: number;
  why?: string;
  /* ------------------------------- v4 fields ------------------------------- */
  colour?: string;
  colourHex?: string | null;
  material?: string | null;
  pattern?: string;
  styles?: string[];
  /** size options for this item (e.g. XS..XL, EU 36..45, "One size") */
  sizes?: string[];
  /** sibling products = other colours of the same model */
  colourOptions?: ColourOption[];
  description?: string;
  /** brand-new item without behavioural data */
  catalogOnly?: boolean;
  /** present when the search API attaches review stats */
  rating?: number | null;
  reviewCount?: number;
  /** v5: optional inventory status when a listing already knows it (never fetched per card) */
  stockStatus?: StockStatus;
};

/* ------------------------------- v5: operations ------------------------------- */

export type StockStatus = 'in_stock' | 'low' | 'sold_out';
export type StockInfo = {
  sizes: Record<string, number>;
  total: number;
  status: StockStatus;
  lowStockSizes: string[];
  soldOutSizes: string[];
};

export type TimelineStep = { status: string; ts: number; done?: boolean; reason?: string };

export type TrendingLiveResponse = { windowHours: number; events: number; items: (Product & { liveScore: number; why: string })[] };

export type CurrencyCode = 'USD' | 'INR' | 'EUR' | 'GBP' | 'AED';
/** GET /meta/currency (v6): prices are INR; `rates` are INR -> X multipliers (USD etc. are < 1). */
export type CurrencyMeta = { base: 'INR' | string; default?: string; rates: Record<string, number>; symbols: Record<string, string>; locale?: string };

export type ColourOption = { id: string; colour: string; hex: string | null };

export type RequestContext = {
  device?: 'mobile' | 'desktop' | 'tablet';
  userAgent?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
  country?: string;
  region?: string;
  city?: string;
  timezone?: string;
  localHour?: number;
  dayOfWeek?: number;
  landingPageType?: string;
  ageGroup?: string;
  gender?: string;
  incomeGroup?: string;
  /** from the style quiz (Level-2 elicitation) */
  preferredDepartment?: Department;
};

export type ExperimentVariant = 'agent' | 'control';

export type LandingPageRequest = {
  visitorId?: string;
  context: RequestContext;
  session?: { viewedItems?: string[]; cartedItems?: string[] };
  options?: { useLlm?: boolean; maxModules?: number; variant?: ExperimentVariant; bandit?: boolean };
};

export type ResolvedContext = {
  device: string;
  channel: string;
  source: string;
  medium: string;
  country: string;
  region: string;
  city?: string | null;
  geo: string;
  macroRegion: string;
  daypart: string;
  localHour: number;
  dayOfWeek: number;
  month?: number;
  season?: 'Spring' | 'Summer' | 'Fall' | 'Winter' | string | null;
  landingPageType: string;
  ageGroup: string | null;
  gender: string | null;
  incomeGroup: string | null;
  preferredDepartment?: string | null;
};

/** 0 anonymous, 1 contextual, 2 +demographics, 3 in-session, 4 returning customer (signed in / persisted history) */
export type ColdStartLevel = 0 | 1 | 2 | 3 | 4;

export type Persona = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  confidence: number;
  alternatives: { id: string; name: string; probability: number }[];
};

export type Intent = {
  stage: 'discover' | 'explore' | 'buy_now';
  stageLabel: string;
  cartPropensity: number;
  purchasePropensity: number;
  baselineCart: number;
  baselinePurchase: number;
  lift: number;
};

export type Inference = {
  persona: Persona;
  intent: Intent;
  departmentAffinity: { department: string; label: string; probability: number; lift: number }[];
  subcategoryAffinity: { subcategory: string; department: string; score: number }[];
  similarVisitors: { count: number; description: string };
  backoffPath: { level: string; key: string; support: number; weight: number }[];
  ranking?: { reranker: 'lambdarank' | 'lean_lambdarank' | 'blend' | 'hybrid_blend' | 'popularity' | string; audienceRule: boolean; candidates: number };
};

export type Experiment = {
  variant: ExperimentVariant;
  bucket: number;
  banditReordered: boolean;
  description: string;
};

export type Link = { label: string; href: string };

type ModuleBase = { id: string; reason: string; strategy: string; signals?: string[] };

export type AnnouncementModule = ModuleBase & { type: 'announcement'; text: string; tone: 'info' | 'promo' | 'urgency' };
export type HeroModule = ModuleBase & {
  type: 'hero';
  eyebrow: string;
  title: string;
  subtitle: string;
  image: string;
  department: string;
  cta: Link;
  secondaryCta?: Link;
  products: Product[];
};
export type CategoryTilesModule = ModuleBase & {
  type: 'category_tiles';
  title: string;
  tiles: { label: string; href: string; image: string; subtitle: string; score: number }[];
};
export type ProductCarouselModule = ModuleBase & {
  type: 'product_carousel';
  title: string;
  subtitle: string;
  products: Product[];
  viewAllHref?: string;
};
export type CtaBannerModule = ModuleBase & {
  type: 'cta_banner';
  variant: 'newsletter' | 'offer' | 'urgency' | 'explore';
  title: string;
  subtitle: string;
  cta: Link;
  image?: string;
  code?: string;
};
export type BundleModule = ModuleBase & {
  type: 'bundle';
  title: string;
  subtitle: string;
  anchor: Product;
  items: Product[];
  totalPrice: number;
};
export type TrustBarModule = ModuleBase & { type: 'trust_bar'; items: { icon: string; label: string }[] };

/* ----------------------------- v3 module types ----------------------------- */

export type SlideKind = 'welcome_offer' | 'bank_offer' | 'sale' | 'new_arrivals' | 'value' | 'shipping' | 'department' | 'brand' | 'season';

export type HeroSlide = {
  id: string;
  kind: SlideKind | string;
  /** 1600x600 creative (desktop) */
  image: string;
  /** 900x900 creative (mobile) */
  imageSquare: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: Link;
  badge: string | null;
  department: string | null;
  score: number;
  why: string;
  copySource?: string;
};
export type HeroCarouselModule = ModuleBase & { type: 'hero_carousel'; slides: HeroSlide[] };

export type OfferIcon = 'credit-card' | 'tag' | 'sparkles' | 'truck' | 'gift';
export type OfferStripModule = ModuleBase & {
  type: 'offer_strip';
  offers: { icon: OfferIcon | string; title: string; text: string; code: string | null }[];
};

export type CategoryGridTile = {
  label: string;
  departmentLabel: string;
  department: string;
  subcategory: string;
  image: string;
  href: string;
  /** e.g. "UP TO 40% OFF" / "NEW IN" / "BESTSELLERS" */
  offer: string;
  items: number;
};
export type CategoryGridModule = ModuleBase & { type: 'category_grid'; title: string; tiles: CategoryGridTile[] };

export type BrandSpotlightModule = ModuleBase & {
  type: 'brand_spotlight';
  title: string;
  brands: { id: string; name: string; image: string; items: number; href: string; offer: string; why: string }[];
};

export type Module =
  | AnnouncementModule
  | HeroModule
  | CategoryTilesModule
  | ProductCarouselModule
  | CtaBannerModule
  | BundleModule
  | TrustBarModule
  | HeroCarouselModule
  | OfferStripModule
  | CategoryGridModule
  | BrandSpotlightModule;

export type LandingPage = {
  pageId: string;
  generatedAt: string;
  latencyMs: number;
  experiment?: Experiment;
  visitor: {
    coldStartLevel: ColdStartLevel;
    levelLabel: string;
    resolvedContext: ResolvedContext;
    signalsUsed: string[];
  };
  inference: Inference;
  theme: { accent: string; department: string };
  modules: Module[];
  trace: { step: string; detail: string; durationMs: number }[];
  /** v3: present for signed-in / returning visitors (Level 4) */
  user?: { name?: string; points?: number; returning: boolean } | null;
  /** client-only: true when the page was built locally because the agent API was unreachable */
  offline?: boolean;
};

export type ProductDetailResponse = {
  product: Product;
  alsoViewed: Product[];
  viewedNext?: Product[];
  boughtTogether: Product[];
  similar: Product[];
};

export type OptionValue = string | { id?: string; value?: string; label?: string; name?: string };

export type ChannelOption = { id: string; label: string; utmSource: string; utmMedium: string };

export type Preset = {
  id: string;
  label: string;
  description: string;
  context: RequestContext & Record<string, unknown>;
  session?: { viewedItems?: string[]; cartedItems?: string[] };
};

export type MetaOptions = {
  devices: OptionValue[];
  channels: ChannelOption[];
  regions: OptionValue[];
  countries: OptionValue[];
  ageGroups: OptionValue[];
  genders: OptionValue[];
  incomeGroups: OptionValue[];
  landingTypes: OptionValue[];
  departments?: { id: string; label: string }[];
  presets: Preset[];
};

export type ExperimentVariantStats = {
  pages: number;
  impressions: number;
  clicks: number;
  view_item: number;
  add_to_cart: number;
  ctr: number | null;
  clicksPerPage: number | null;
};

export type Experiments = {
  controlShare: number;
  pagesGenerated: number;
  avgLatencyMs: number | null;
  description: string;
  variants: Partial<Record<ExperimentVariant, ExperimentVariantStats>>;
  modules: Record<string, { impressions: number; clicks: number; ctr: number | null }>;
  bandit: { stage: string; device: string; arms: { module: string; alpha: number; beta: number; mean: number; evidence: number }[] }[];
};

export type EventType = 'impression' | 'click' | 'view_item' | 'add_to_cart';

/** v4: behavioural events that feed analytics + retraining (POST /events/rich) */
export type RichEventType = 'impression' | 'click' | 'view_item' | 'add_to_cart' | 'wishlist' | 'search' | 'filter' | 'purchase' | 'review' | 'page';
export type RichEvent = {
  visitorId?: string;
  type: RichEventType;
  itemId?: string;
  pageId?: string;
  moduleId?: string;
  meta?: Record<string, unknown>;
  device?: string;
  channel?: string;
  region?: string;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export type Insights = {
  overview?: {
    events?: number;
    users?: number;
    sessions?: number;
    transactions?: number;
    revenue?: number;
    items?: number;
    dateRange?: [string, string];
  };
  dataQuality?: Record<string, any>;
  funnel?: { stage: string; sessions: number; rate: number }[];
  channels?: Row[];
  devices?: Row[];
  geo?: Row[];
  hourly?: Row[];
  segments?: { id: string; label: string; description: string; users: number; share: number; conversionRate: number; avgRevenue: number }[];
  personas?: {
    id: string;
    name: string;
    tagline: string;
    description: string;
    users: number;
    share: number;
    conversionRate: number;
    topDepartments?: { department: string; share: number }[];
    topChannels?: { channel: string; share: number }[];
    topProducts?: Product[];
  }[];
  departments?: { department: string; label: string; views: number; carts: number; orders: number; revenue: number }[];
  catalog?: Record<string, any>;
};

export type ModelMetrics = {
  hitRate?: number;
  precision?: number;
  recall?: number;
  ndcg?: number;
  mrr?: number;
  coverage?: number;
  diversity?: number;
};

export type ModelResult = {
  name: string;
  label: string;
  description?: string;
  metrics: ModelMetrics;
  ci?: { ndcg?: [number, number] };
};

export type Evaluation = {
  protocol?: { trainEnd: string; testStart: string; testEnd: string; testUsers: number; k: number; description: string };
  coldStart?: ModelResult[];
  warmStart?: ModelResult[];
  classifiers?: { name: string; label: string; metric: string; value: number; baseline: number }[];
  /** removing one signal group from the blend */
  ablations?: { name: string; label: string; description?: string; ndcg: number; deltaPct: number }[];
  sensitivity?: {
    signal: string;
    label: string;
    itemsChangedOf10: number;
    audienceShareBefore?: number;
    audienceShareAfter?: number;
    womenDeptShareAfter?: number;
  }[];
  byChannel?: { channel: string; users: number; ndcgModel: number; ndcgPopularity: number; liftPct?: number }[];
  byDevice?: { device: string; users: number; ndcgModel: number; ndcgPopularity: number; liftPct?: number }[];
  byGeo?: { geo: string; users: number; ndcgModel: number; ndcgPopularity: number; liftPct?: number }[];
  byGender?: { gender: string; users: number; ndcgPopularity: number; ndcgContextOnly: number; ndcgWithDemographics: number; ndcgAgentAudienceRule: number }[];
  /** robustness fold (Mar -> Apr) */
  secondaryFold?: { name: string; label: string; ndcg: number; hitRate: number; liftVsPopularityPct: number }[];
  blendWeights?: Record<string, number>;
  chainWeights?: Record<string, number>;
  ltr?: { bestIteration: number; trainUsers: number; importance: { feature: string; gain: number }[] };
  hybridLiftVsPopularity?: { model: ServedRanker | string; pct: number; ci95: [number, number] };
  validationNdcg?: number;
  /** which ranker is served in production, decided on held-out folds */
  modelSelection?: ModelSelection;
};

export type ServedRanker = 'hybrid_blend' | 'lean_lambdarank';

export type ModelSelectionFold = {
  blendNdcg: number;
  leanLtrNdcg: number;
  popularityNdcg: number;
  leanLtrWins: boolean;
  testUsers: number;
  ci: { blend: [number, number]; leanLtr: [number, number] };
};

export type ModelSelection = {
  servedRanker: ServedRanker;
  rule: string;
  folds: Record<'primary' | 'secondary', ModelSelectionFold>;
  leanLtr: { droppedFeatures: string[]; bestIteration: number; importance: { feature: string; gain: number }[] };
  fullLtrVerdict: string;
  audienceRule: { strengthGrid: Record<string, number>; chosenStrength: number; tunedOn: string; note: string };
};

/* ------------------------------ v3: accounts ------------------------------ */

export type Profile = {
  gender?: 'female' | 'male' | string;
  ageGroup?: string;
  country?: string;
  region?: string;
  city?: string;
  preferredDepartments?: string[];
  styles?: string[];
  sizes?: Record<string, string>;
  budget?: string;
  newsletter?: boolean;
  onboarded?: boolean;
};

export type User = {
  id: number;
  email: string;
  name: string;
  /** v7: always "clerk" (older records may still say "password") */
  provider: 'clerk' | string;
  avatar: string;
  points: number;
  onboarded: boolean;
  memberSince: string;
  profile: Profile;
};

export type Address = {
  id?: number | string;
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  /** 10-digit Indian mobile (shown with +91) */
  phone?: string;
  isDefault?: boolean;
  /** v6 form-only fields, packed into line2 on the wire (see lib/address.ts) */
  landmark?: string;
  addressType?: AddressType;
};

/** v6 India-first address form (landmark / address type are packed into line2 because the API has no columns for them). */
export type AddressType = 'Home' | 'Work';

export type HistoryType = 'view_item' | 'add_to_cart' | 'purchase';
export type HistoryResponse = { viewed: Product[]; carted: Product[]; purchased: Product[] };

/* ------------------------------ v3: checkout ------------------------------ */

export type ShippingMethod = 'standard' | 'express';
/** v4 ids (legacy `card` / `paypal` still accepted by the backend) */
export type PaymentMethodId = 'credit_card' | 'debit_card' | 'upi' | 'netbanking' | 'wallet' | 'cod' | 'card' | 'paypal';
export type PaymentGroup = 'card' | 'upi' | 'bank' | 'wallet' | 'cash' | string;

export type QuoteItem = { id: string; qty: number; size?: string | null };

export type QuoteRequest = {
  items: QuoteItem[];
  coupon?: string;
  usePoints?: number;
  shipping: ShippingMethod;
  paymentMethod: PaymentMethodId;
  bankCard?: boolean;
  visitorId?: string;
};

export type QuoteLine = {
  id: string;
  name: string;
  brand: string;
  image: string;
  qty: number;
  size: string | null;
  unitPrice: number;
  compareAt: number | null;
  lineTotal: number;
  department: string;
};

export type Quote = {
  lines: QuoteLine[];
  subtotal: number;
  itemSavings: number;
  coupon: { code: string; label: string; discount: number } | null;
  couponDiscount: number;
  bankDiscount: number;
  bankOffer: { code: string; bank: string; pct: number; cap: number; min: number; label: string } | null;
  pointsUsed: number;
  pointsDiscount: number;
  shipping: { id: string; label: string; price: number; cost: number; freeOver: number };
  codFee: number;
  total: number;
  pointsEarned: number;
  errors: string[];
  paymentMethods: PaymentMethodOption[];
  availableCoupons: { code: string; label: string }[];
  pointsBalance: number;
  signedIn: boolean;
  /** client-only: computed locally because the API was unreachable */
  offline?: boolean;
};

export type PaymentMethodOption = { id: PaymentMethodId | string; label: string; note: string; group?: PaymentGroup };

export type OrderRequest = QuoteRequest & { address: Address; email?: string; payment?: RazorpayPaymentProof };

export type OrderStatus = 'confirmed' | 'packed' | 'shipped' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'return_requested' | 'returned' | string;

export type Order = Quote & {
  orderId: string;
  status: OrderStatus;
  /** unix seconds */
  eta: number;
  /** unix seconds */
  placedAt?: number;
  createdAt?: number;
  address: Address;
  paymentMethod: PaymentMethodId | string;
  email?: string | null;
  /** v6: how the order was paid */
  payment?: OrderPayment | null;
  /** v5: 5 steps (confirmed, packed, shipped, out_for_delivery, delivered) + cancel / return events */
  timeline?: TimelineStep[];
  /** v5: computed by the API */
  canCancel?: boolean;
  canReturn?: boolean;
  pointsBalance?: number;
  total: number;
};

/* ---------------------------- v3: storefront data --------------------------- */

export type DepartmentCampaign = { department: string; label: string; items: number; onSale: number; minPct: number; maxPct: number; text: string };
export type CategoryTile = CategoryGridTile & { popularity: number };
export type Brand = {
  id: string;
  name: string;
  items: number;
  onSale: number;
  maxDiscount: number;
  departments: string[];
  image: string;
  popularity: number;
  priceFrom: number;
};
export type Collection = { id: string; title: string; subtitle: string; items: number; itemIds: string[]; image: string; href: string };
export type Coupon = { code: string; label: string; min: number; firstOrderOnly: boolean };
export type BankOffer = { code: string; bank: string; pct: number; cap: number; min: number; label: string };
export type Banner = Omit<HeroSlide, 'cta' | 'score' | 'why' | 'department'> & {
  /** banners.json stores the CTA label as a string and the link as href */
  cta: string;
  href: string;
  palette?: string;
  target?: Record<string, (string | number)[]>;
  department?: string;
  brand?: string;
};

/** v6 loyalty rules: earn `perHundred` points per ₹100, redeem `block` points for ₹`blockValue` on orders ≥ ₹`minOrder`. */
export type PointsRules = { perHundred: number; block: number; blockValue: number; minOrder: number; welcome?: number; text?: string };

export type Storefront = {
  departmentCampaigns: DepartmentCampaign[];
  categoryTiles: CategoryTile[];
  brands: Brand[];
  collections: Collection[];
  coupons: Coupon[];
  bankOffer: BankOffer;
  shipping: Record<string, { label: string; price: number }>;
  freeShippingOver: number;
  codFee?: number;
  currency?: string;
  points: PointsRules;
  paymentMethods: { id: string; label: string; note: string }[];
  promoSummary: { markdown: number; clearance: number; onSale: number; items: number; how: string[] };
  banners?: Banner[];
};

/* ------------------------------ v4: search & filters ------------------------------ */

export type SearchSort = 'relevance' | 'popular' | 'price_asc' | 'price_desc' | 'discount' | 'new' | 'rating';

/** Query params of GET /catalog/search (multi-values are comma separated). */
export type SearchParams = {
  q?: string;
  department?: string;
  subcategory?: string;
  brand?: string;
  colour?: string;
  material?: string;
  pattern?: string;
  style?: string;
  size?: string;
  audience?: string;
  minPrice?: number;
  maxPrice?: number;
  minDiscount?: number;
  onSale?: boolean;
  minRating?: number;
  isNew?: boolean;
  collection?: string;
  ids?: string;
  sort?: SearchSort;
  limit?: number;
  offset?: number;
  visitorId?: string;
};

export type FacetKey = 'department' | 'subcategory' | 'brand' | 'colour' | 'material' | 'pattern' | 'audience' | 'style' | 'size';
export type FacetValue = { value: string; count: number; hex?: string | null };
export type Facets = Partial<Record<FacetKey, FacetValue[]>>;

export type SearchResponse = {
  total: number;
  items: Product[];
  facets: Facets;
  priceRange: { min: number; max: number };
  query?: string | null;
  /** client-only: computed from catalog.json because the API was unreachable */
  offline?: boolean;
};

export type SuggestResponse = {
  products: { id: string; name: string; brand: string; image: string; price: number }[];
  brands: string[];
  categories: { department: string; subcategory: string; href: string }[];
};

/* ------------------------------- v4: product page ------------------------------- */

export type SizeFit = 'small' | 'true' | 'large';
export type Review = {
  id: number | string;
  author: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  sizeFit?: SizeFit | string | null;
  verified: boolean;
  /** "demo" reviews are seeded placeholders and must be labelled in the UI */
  source: 'user' | 'demo' | string;
  helpful: number;
  /** unix seconds */
  ts: number;
};
export type ReviewSummary = { average: number; count: number; distribution: Record<string, number> };
export type ReviewsResponse = { summary: ReviewSummary; reviews: Review[] };
export type ReviewInput = { rating: number; title?: string; body?: string; sizeFit?: SizeFit; author?: string };

export type DeliveryEstimate = {
  zone: string;
  minDays: number;
  maxDays: number;
  /** unix seconds */
  earliest: number;
  /** unix seconds */
  latest: number;
  text: string;
  cutoff?: string | null;
  freeOver: number;
  /** v6: cash on delivery serviceable at this PIN */
  codAvailable?: boolean;
  currency?: string;
};

/* ------------------------------ v6: payments (Razorpay) ------------------------------ */

export type PaymentProvider = 'razorpay' | 'simulated';
/** GET /payments/config */
export type PaymentConfig = { provider: PaymentProvider; mode: 'test' | 'live' | 'simulated' | string; keyId: string | null; currency: string; merchantName: string; note?: string };
/** POST /payments/razorpay/order (amount is in paise) */
export type RazorpayOrder = {
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
  merchantName: string;
  description: string;
  prefill: { name?: string; email?: string };
  total: number;
};
/** Sent with POST /checkout/order after Razorpay's handler fires. */
export type RazorpayPaymentProof = { provider: 'razorpay'; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string };
/** Stored on orders (v6). */
export type OrderPayment = { provider: 'razorpay' | 'simulated' | 'cod' | string; mode?: string; razorpayOrderId?: string; razorpayPaymentId?: string; status?: string };

/** Minimal typing of Razorpay Checkout (checkout.js). */
export type RazorpaySuccess = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
export type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  image?: string;
  prefill?: { name?: string; email?: string; contact?: string; method?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (resp: RazorpaySuccess) => void;
  modal?: { ondismiss?: () => void; escape?: boolean; confirm_close?: boolean };
};
export type RazorpayInstance = { open: () => void; on: (event: string, cb: (resp: { error?: { description?: string; reason?: string } }) => void) => void };

export type SimilarResponse = { items: (Product & { why?: string; score?: number })[]; personalised: boolean };

/* ------------------------------ v4: account sync ------------------------------ */

export type WishlistEntry = Product & { size?: string | null; addedAt?: number };
export type CartSyncLine = { id: string; size: string | null; qty: number };

export type PointsLedgerEntry = { delta: number; reason: string; ref?: string | null; ts: number };
export type PointsResponse = { balance: number; rules: PointsRules; ledger: PointsLedgerEntry[] };

export type OfferCoupon = { code: string; label: string; min: number; firstOrderOnly: boolean; available: boolean; used: boolean };
export type OffersResponse = { coupons: OfferCoupon[]; bankOffer: BankOffer | null; freeShippingOver: number; points: PointsRules };

export type UserSettings = {
  newsletter: boolean;
  smsAlerts: boolean;
  personalization: boolean;
  currency: string;
  language: string;
  theme: 'light' | 'dark' | string;
};
