# HPLPGA API contract (v1)

Base URL: `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`). All JSON uses camelCase.

## Product
```ts
type Product = {
  id: string;              // "ITEM22" – dataset item id
  name: string; detail: string; brand: string;
  department: "women" | "men" | "footwear" | "watches" | "jewellery" | "accessories"; departmentLabel: string;
  audience: "women" | "men" | "unisex";   // target audience (from image + real viewer gender mix)
  variants: number;                        // distinct SKUs sold (colour/size variants)
  femaleShare: number;                     // share of the item's viewers resolved as female (0..1)
  subcategory: string;     // "Dresses", "Watches", ...
  sourceCategory: string;  // anonymised dataset category, e.g. "CATEGORY_1"
  price: number; compareAt: number | null; discountPct: number; onSale: boolean;
  image: string;           // URL-encoded path under /public, e.g. "/women/Chino%20dress.png"
  isBestseller: boolean; isNew: boolean;
  stats: { views: number; carts: number; orders: number; cartRate: number };
  // present only inside recommendation modules:
  score?: number;          // 0..1 relative relevance
  why?: string;            // short per-item explanation, e.g. "Popular with Paid Social visitors in Texas"
};
```
`project/data/catalog.json` is `Product[]` (displayable items, sorted by popularity) and is written by the pipeline.

## POST /api/v1/landing-page
Request
```ts
type LandingPageRequest = {
  visitorId?: string;
  context: {
    device?: "mobile" | "desktop" | "tablet"; userAgent?: string;
    utmSource?: string; utmMedium?: string; utmCampaign?: string; referrer?: string;
    country?: string; region?: string; city?: string; timezone?: string;   // IANA tz, e.g. "America/Chicago"
    localHour?: number; dayOfWeek?: number;                                  // dayOfWeek 0=Mon
    landingPageType?: string;                                                // "homepage" default
    ageGroup?: string; gender?: string; incomeGroup?: string;                // optional, declared
    preferredDepartment?: "women"|"men"|"footwear"|"watches"|"jewellery"|"accessories"; // from the style quiz
  };
  session?: { viewedItems?: string[]; cartedItems?: string[] };
  options?: { useLlm?: boolean; maxModules?: number; variant?: "agent" | "control"; bandit?: boolean };
};
```
Response
```ts
type LandingPage = {
  pageId: string; generatedAt: string; latencyMs: number;
  experiment: { variant: "agent" | "control"; bucket: number; banditReordered: boolean; description: string };
  visitor: {
    coldStartLevel: 0 | 1 | 2 | 3;     // 0 anonymous, 1 contextual, 2 +demographics, 3 in-session (warm)
    levelLabel: string;
    resolvedContext: {
      device: string; channel: string; source: string; medium: string; country: string; region: string;
      city: string | null; geo: string; macroRegion: string; daypart: string; localHour: number; dayOfWeek: number;
      month: number; season: string | null;   // "Spring" | "Summer" | "Fall" | "Winter" | null
      landingPageType: string; ageGroup: string | null; gender: string | null; incomeGroup: string | null;
      preferredDepartment: string | null;
    };
    signalsUsed: string[];            // human readable, e.g. "Device: mobile", "Channel: Paid Social"
  };
  inference: {
    persona: { id: string; name: string; tagline: string; description: string; confidence: number;
               alternatives: { id: string; name: string; probability: number }[] };
    intent: { stage: "discover" | "explore" | "buy_now"; stageLabel: string;
              cartPropensity: number; purchasePropensity: number;
              baselineCart: number; baselinePurchase: number; lift: number };
    departmentAffinity: { department: string; label: string; probability: number; lift: number }[];
    subcategoryAffinity: { subcategory: string; department: string; score: number }[];
    similarVisitors: { count: number; description: string };
    backoffPath: { level: string; key: string; support: number; weight: number }[];
    ranking: { reranker: "lambdarank" | "blend" | "popularity"; audienceRule: boolean; candidates: number };
  };
  theme: { accent: string; department: string };
  modules: Module[];
  trace: { step: string; detail: string; durationMs: number }[];
};

type Base = { id: string; reason: string; strategy: string; signals?: string[] };
type Module = Base & (
  | { type: "announcement"; text: string; tone: "info" | "promo" | "urgency" }
  | { type: "hero"; eyebrow: string; title: string; subtitle: string; image: string; department: string;
      cta: { label: string; href: string }; secondaryCta?: { label: string; href: string }; products: Product[] }
  | { type: "category_tiles"; title: string; tiles: { label: string; href: string; image: string; subtitle: string; score: number }[] }
  | { type: "product_carousel"; title: string; subtitle: string; products: Product[]; viewAllHref?: string }
  | { type: "cta_banner"; variant: "newsletter" | "offer" | "urgency" | "explore"; title: string; subtitle: string;
      cta: { label: string; href: string }; image?: string; code?: string }
  | { type: "bundle"; title: string; subtitle: string; anchor: Product; items: Product[]; totalPrice: number }
  | { type: "trust_bar"; items: { icon: string; label: string }[] }   // icon: "truck" | "refresh" | "shield" | "sparkles"
);
```

## Other endpoints
| Method | Path | Returns |
|---|---|---|
| GET | `/api/v1/products?department=&subcategory=&q=&onSale=&sort=popular\|price_asc\|price_desc\|new\|discount&limit=&offset=` | `{ total, items: Product[] }` |
| GET | `/api/v1/products/{id}` | `{ product, alsoViewed: Product[], viewedNext: Product[], boughtTogether: Product[], similar: Product[] }` |
| GET | `/api/v1/experiments` | live A/B + bandit state (see `experiments` below) |
| GET | `/api/v1/meta/options` | `{ devices, channels:[{id,label,utmSource,utmMedium}], regions, countries, ageGroups, genders, incomeGroups, landingTypes, departments:[{id,label}], presets:[{id,label,description,context,session?}] }` |
| GET | `/api/v1/insights` | pipeline + segmentation analytics (see `insights` below) |
| GET | `/api/v1/evaluation` | offline evaluation report (see below) |
| POST | `/api/v1/events` | `{ ok: true }` – body `{ visitorId, type: "impression"\|"click"\|"view_item"\|"add_to_cart", pageId?, moduleId?, itemId? }` |
| GET | `/health` | `{ status, artifactsLoaded, version }` |

### insights
```ts
{
  overview: { events, users, sessions, transactions, revenue, items, dateRange: [string, string] },
  dataQuality: Record<string, any>,
  funnel: { stage: string; sessions: number; rate: number }[],
  channels: { channel; users; sessions; cartRate; conversionRate; revenue }[],
  devices:  { device;  users; sessions; cartRate; conversionRate; revenue }[],
  geo:      { geo; users; conversionRate }[],
  hourly:   { hour; sessions; conversionRate }[],
  segments: { id; label; description; users; share; conversionRate; avgRevenue }[],
  personas: { id; name; tagline; description; users; share; conversionRate; topDepartments: {department; share}[];
              topChannels: {channel; share}[]; topProducts: Product[] }[],
  departments: { department; label; views; carts; orders; revenue }[],
  catalog: Record<string, any>
}
```
### experiments
```ts
{
  controlShare: number; pagesGenerated: number; avgLatencyMs: number | null; description: string;
  variants: Record<"agent"|"control", { pages; impressions; clicks; view_item; add_to_cart; ctr: number|null; clicksPerPage: number|null }>;
  modules: Record<string, { impressions; clicks; ctr: number|null }>;
  bandit: { stage: string; device: string; arms: { module: string; alpha: number; beta: number; mean: number; evidence: number }[] }[];
}
```

### evaluation
```ts
{
  protocol: { trainEnd: string; testStart: string; testEnd: string; testUsers: number; k: number; description: string },
  coldStart: { name: string; label: string; description: string;
               metrics: { hitRate: number; precision: number; recall: number; ndcg: number; mrr: number;
                          coverage: number; diversity: number };
               ci?: { ndcg: [number, number] } }[],
  warmStart: same shape as coldStart,          // after observing the first item of the session
  classifiers: { name: string; label: string; metric: string; value: number; baseline: number }[],
  ablations: { name; label; description; ndcg: number; deltaPct: number }[],          // removing one signal group from the blend
  sensitivity: { signal; label; itemsChangedOf10: number; audienceShareBefore?; audienceShareAfter?; womenDeptShareAfter? }[],
  byChannel: { channel; users; ndcgModel; ndcgPopularity; liftPct }[],
  byDevice:  { device;  users; ndcgModel; ndcgPopularity; liftPct }[],
  byGeo:     { geo;     users; ndcgModel; ndcgPopularity; liftPct }[],
  byGender:  { gender; users; ndcgPopularity; ndcgContextOnly; ndcgWithDemographics; ndcgAgentAudienceRule }[],
  secondaryFold: { name; label; ndcg; hitRate; liftVsPopularityPct }[],               // robustness fold (Mar->Apr)
  blendWeights: Record<string, number>, chainWeights: Record<string, number>,
  ltr: { bestIteration: number; trainUsers: number; importance: { feature: string; gain: number }[] },
  hybridLiftVsPopularity: { model: string; pct: number; ci95: [number, number] },
  validationNdcg: number
}
// coldStart model names now also include "hybrid_ltr", "hybrid_ltr_l2", "hybrid_l2_audience".
```

---

## v3 additions: accounts, checkout, storefront data, new modules

### Cold-start levels
`visitor.coldStartLevel` is now `0 | 1 | 2 | 3 | 4`. Level 4 = **returning customer**: the visitor is signed in (Bearer token) or has a
known `visitorId` with persisted history; the agent uses their own past views/bags/orders. The response then also carries
`user: { name?: string; points?: number; returning: boolean } | null`.

Send the session token as `Authorization: Bearer <token>` on **every** API call (landing page included). When signed in, the backend
merges the onboarding profile (gender, ageGroup, country, region, city, preferredDepartments[0]) into the context automatically.

### New module types (in addition to the v1 list)
```ts
| { type: "hero_carousel"; slides: { id: string; kind: "welcome_offer"|"bank_offer"|"sale"|"new_arrivals"|"value"|"shipping"|"department"|"brand"|"season";
      image: string; imageSquare: string; eyebrow: string; title: string; subtitle: string; cta: {label; href}; badge: string|null;
      department: string|null; score: number; why: string; copySource?: string }[] }      // image 1600x600 (desktop), imageSquare 900x900 (mobile)
| { type: "offer_strip"; offers: { icon: "credit-card"|"tag"|"sparkles"|"truck"|"gift"; title: string; text: string; code: string|null }[] }
| { type: "category_grid"; title: string; tiles: { label; departmentLabel; department; subcategory; image; href; offer: string; items: number }[] }  // Myntra-style grid, offer e.g. "UP TO 40% OFF" / "NEW IN" / "BESTSELLERS"
| { type: "brand_spotlight"; title: string; brands: { id; name; image; items: number; href; offer: string; why: string }[] }
```
Existing carousels may now also have ids `history` ("Recently viewed", level 4) and `because_bought`.

### Auth
| Method | Path | Body → Returns |
|---|---|---|
| GET | `/api/v1/auth/providers` | `{ password: true, google: bool, apple: bool, googleClientId, appleClientId }` |
| POST | `/api/v1/auth/signup` | `{ email, password (>=8), name? }` → `{ token, user }` (409 if exists) |
| POST | `/api/v1/auth/login` | `{ email, password }` → `{ token, user }` (401 on failure) |
| POST | `/api/v1/auth/google` | `{ credential }` (Google Identity Services ID token) → `{ token, user }` |
| POST | `/api/v1/auth/apple` | `{ idToken, name? }` (Sign in with Apple JS) → `{ token, user }` |
| GET | `/api/v1/auth/me` | → `user` |
```ts
type User = { id: number; email: string; name: string; provider: "password"|"google"|"apple"; avatar: string; points: number;
              onboarded: boolean; memberSince: string; profile: Profile };
type Profile = { gender?: "female"|"male"; ageGroup?: string; country?: string; region?: string; city?: string;
                 preferredDepartments?: string[]; styles?: string[]; sizes?: Record<string,string>; budget?: string; newsletter?: boolean; onboarded?: boolean };
```
Google/Apple buttons: render only when the provider flag is true. Google: load `https://accounts.google.com/gsi/client`, `google.accounts.id.initialize({client_id, callback})`
→ POST the `credential`. Apple: load `https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js`, `AppleID.auth.init({clientId, scope:'name email', redirectURI: location.origin+'/login', usePopup:true})`, `AppleID.auth.signIn()` → POST `authorization.id_token`. New accounts start with 100 points.

### Profile, addresses, history
| Method | Path | Notes |
|---|---|---|
| PUT | `/api/v1/me/profile` | body = `Profile` (+ `onboarded`), returns `user` |
| GET/POST | `/api/v1/me/addresses` | POST body `{ name, line1, line2?, city, region, postalCode, country, phone?, isDefault? }` |
| DELETE | `/api/v1/me/addresses/{id}` | |
| POST | `/api/v1/me/history` | `{ visitorId?, type: "view_item"|"add_to_cart"|"purchase", itemId }` — call on product view / add to bag (works signed-out too, keyed by visitorId) |
| GET | `/api/v1/me/history?visitorId=` | `{ viewed: Product[], carted: Product[], purchased: Product[] }` |

### Checkout & orders
| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/checkout/quote` | `{ items:[{id, qty, size?}], coupon?, usePoints?: number, shipping: "standard"|"express", paymentMethod: "card"|"upi"|"paypal"|"cod", bankCard?: boolean, visitorId? }` → `Quote` |
| POST | `/api/v1/checkout/order` | same + `{ address: Address, email? }` → `{ orderId, status, eta, ...Quote, address, paymentMethod, pointsBalance }` (400 with message on invalid coupon / empty bag) |
| GET | `/api/v1/me/orders` | signed-in order history |
| GET | `/api/v1/orders/{id}?visitorId=` | one order (guest orders retrievable by visitorId) |
```ts
type Quote = { lines: { id; name; brand; image; qty; size; unitPrice; compareAt; lineTotal; department }[]; subtotal; itemSavings;
  coupon: { code; label; discount } | null; couponDiscount; bankDiscount; bankOffer: { code; bank; pct; cap; min; label } | null;
  pointsUsed; pointsDiscount; shipping: { id; label; price; cost; freeOver }; codFee; total; pointsEarned; errors: string[];
  paymentMethods: { id; label; note }[]; availableCoupons: { code; label }[]; pointsBalance: number; signedIn: boolean };
```
Rules: free standard shipping over $75; COD adds $2.99; bank offer = 10% (max $40) on card payments over $99 when `bankCard` is ticked;
points: 100 points = $5, redeemable in blocks on subtotals over $30; earn 1 point per $1 paid. Coupons: WELCOME10 (first order, 10%, max $30),
AURA20 (20% over $150, max $60), FREESHIP, WATCH15 (watches), STYLE25 (womenswear over $120).

### Storefront data
`GET /api/v1/storefront` → `{ departmentCampaigns, categoryTiles, brands, collections, coupons, bankOffer, shipping, freeShippingOver, points, paymentMethods, promoSummary, banners }`.
The same data is also in `project/data/storefront.json` and `project/data/banners.json` (static import for SSR pages).
```ts
departmentCampaigns: { department; label; items; onSale; minPct; maxPct; text }[]        // e.g. text "15-50% OFF"
categoryTiles: { department; subcategory; label; departmentLabel; items; image; href; offer; popularity }[]
brands: { id; name; items; onSale; maxDiscount; departments: string[]; image; popularity; priceFrom }[]
collections: { id; title; subtitle; items; itemIds: string[]; image; href }[]          // /collections/{id}
promoSummary: { markdown; clearance; onSale; items; how: string[] }                    // how discounts are generated
banners: Banner[]  // same shape as hero_carousel slides + target metadata
```

---

## v4 additions: dynamic catalog, search & filters, reviews, delivery, sync, ledger, events

### Product (new fields)
```ts
colour: string; colourHex: string | null; material: string | null; pattern: string; styles: string[]; sizes: string[];
colourOptions: { id: string; colour: string; hex: string | null }[];   // sibling products = other colours of the same model
description: string; catalogOnly: boolean;                              // catalogOnly = brand-new item without behavioural data
```
Departments unchanged (6). New image folders are used as-is: `/Shoes/Men/...`, `/Shoes/Women/...`, `/Watches/...`, `/Jewelry/...`, `/Bags/...`, `/Accessories/...`.

### Search & filters (server-side, dynamic)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/catalog/search` | params: `q, department, subcategory, brand, colour, material, pattern, style, size, audience` (comma-separated multi-values), `minPrice, maxPrice, minDiscount, onSale, minRating, isNew, collection, ids, sort (relevance|popular|price_asc|price_desc|discount|new|rating), limit, offset, visitorId` → `{ total, items: Product[], facets: Record<"department"|"subcategory"|"brand"|"colour"|"material"|"pattern"|"audience"|"style"|"size", {value,count}[]>, priceRange: {min,max}, query }` |
| GET | `/api/v1/catalog/suggest?q=` | `{ products:[{id,name,brand,image,price}], brands:string[], categories:[{department,subcategory,href}] }` |
Use `/catalog/search` for every listing page (shop, brand, collection, sale, new, search) — `catalog.json` is only the SSR/offline fallback.

### Product page
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/products/{id}/reviews?sort=recent|helpful&limit&offset` | `{ summary: { average, count, distribution: {"1".."5": n} }, reviews: [{ id, author, rating, title, body, sizeFit, verified, source: "user"|"demo", helpful, ts }] }` — `source:"demo"` reviews are seeded placeholders and must be labelled "Demo review" in the UI |
| POST | `/api/v1/products/{id}/reviews` | `{ rating 1-5, title?, body?, sizeFit?: "small"|"true"|"large", author? }` (signed in → author = account name, verified if purchased) → same shape as GET |
| POST | `/api/v1/reviews/{rid}/helpful` | `{ helpful }` |
| GET | `/api/v1/delivery/estimate?country&region&postalCode&shipping` | `{ zone, minDays, maxDays, earliest, latest (unix s), text, cutoff, freeOver }` |
| GET | `/api/v1/products/{id}/similar?visitorId&limit` | `{ items: (Product & {why, score})[], personalised: boolean }` — item graph + content similarity + the visitor's own likes |

### Wishlist / cart sync (signed in)
`GET /me/wishlist` → `(Product & {size, addedAt})[]` · `POST /me/wishlist {itemId,size?}` · `DELETE /me/wishlist/{id}`
`GET /me/cart` → `[{id,size,qty}]` · `PUT /me/cart {items:[{itemId,size,qty}], merge:boolean}` (call on login to merge the guest bag) · `DELETE /me/cart/{id}?size=`

### Points, offers, settings, personalization reset
`GET /me/points` → `{ balance, rules, ledger:[{delta,reason,ref,ts}] }` · `GET /me/offers?visitorId` → `{ coupons:[{code,label,min,firstOrderOnly,available,used}], bankOffer, freeShippingOver, points }`
`GET/PUT /me/settings` → `{ newsletter, smsAlerts, personalization, currency, language, theme }` · `DELETE /me/personalization` (clears history + declared prefs)

### Payment methods (quote.paymentMethods)
`credit_card` (bank offer eligible) · `debit_card` · `upi` · `netbanking` · `wallet` · `cod` (+$2.99). Legacy `card` still accepted.

### Behavioural events (feed analytics + retraining)
`POST /api/v1/events/rich` `{ visitorId?, type: "impression"|"click"|"view_item"|"add_to_cart"|"wishlist"|"search"|"filter"|"purchase"|"review"|"page", itemId?, pageId?, moduleId?, meta?, device?, channel?, region? }`
`GET /api/v1/events/stats` → counts. Export for retraining: `python -m hplpga.store.export`.

### Home page extras (module ids)
`new_arrivals` (product_carousel: catalog-only + new items ranked by affinity). Deal-of-the-day / top offers may be built client-side from `/catalog/search?onSale=true&sort=discount`.

---

## v5 additions: operations
| Method | Path | Returns |
|---|---|---|
| GET | `/api/v1/products/{id}/stock` | `{ sizes: Record<size, qty>, total, status: "in_stock"|"low"|"sold_out", lowStockSizes: string[], soldOutSizes: string[] }` |
| POST | `/api/v1/checkout/order` | now returns **409** `{detail}` when a size has insufficient stock; pass `size` on each line |
| GET | `/api/v1/me/orders`, `/api/v1/orders/{id}` | order now has computed `status` (`confirmed|packed|shipped|out_for_delivery|delivered|cancelled|return_requested`), `timeline: [{status, ts, done}]`, `canCancel`, `canReturn` |
| POST | `/api/v1/orders/{id}/cancel` `{reason?}` · `/api/v1/orders/{id}/return` `{reason?}` | `{ status }` (400 when not allowed) |
| GET | `/api/v1/trending/live?window_h=24&limit=12` | `{ windowHours, events, items: (Product & {liveScore, why})[] }` |
| POST | `/api/v1/auth/forgot-password` `{email}` → `{ok, message}` · `/api/v1/auth/reset-password` `{token, password}` → `{ok, token}` | reset link format `/reset-password?token=…` |
| GET | `/api/v1/me/export` | full JSON export of the account's data |
| DELETE | `/api/v1/me` | `{ok, message}` — account deleted |
| GET | `/api/v1/meta/currency` | `{ base: "USD", rates: {USD, INR, EUR, GBP, AED}, symbols }` |

---

## v6: Indian store (INR), Razorpay, email, integrations health

### Currency
**All amounts are INR (whole rupees)**: product `price`/`compareAt`, quote fields, thresholds, fees, points. `catalog.json` is regenerated in rupees.
`GET /api/v1/meta/currency` → `{ base: "INR", default: "INR", rates: { INR: 1, USD, EUR, GBP, AED }, symbols, locale: "en-IN" }`.
Format with Indian digit grouping: `new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })` → `₹1,23,456`.
Other currencies are optional display conversions from INR (multiply by `rates[cur]`).
Rules (also in `storefront.json` / `quote`): free standard delivery over ₹1,499 · standard ₹99 · express ₹249 · COD fee ₹49 ·
bank offer 10% up to ₹1,500 on credit cards, min ₹4,999 · WELCOME10 (first order, max ₹750) · AURA20 (20% above ₹9,999, max ₹2,500) ·
FREESHIP · WATCH15 (max ₹5,000) · STYLE25 (women, above ₹4,999, max ₹2,000) · points: earn 5 per ₹100, 1 point = ₹1, redeem in blocks of 100 on orders ≥ ₹999; welcome bonus 250.
`storefront.json.points` = `{ perHundred, block, blockValue, minOrder, welcome, text }` (replaces the old perDollar fields). Collection `under-49` is now `under-1999`.

### India addresses & delivery
Default country **India**; state list from `GET /api/v1/meta/india-states` (36 states/UTs); PIN code = 6 digits `^[1-9][0-9]{5}$`.
`GET /api/v1/delivery/estimate?country=India&region=<state>&postalCode=<PIN>&shipping=standard|express` → `{ zone: "metro"|"india"|"remote"|"intl", minDays, maxDays, earliest, latest, text, cutoff, freeOver, codAvailable }` (400 on an invalid PIN).
Phone: 10-digit Indian mobile `^[6-9][0-9]{9}$` (display with +91).

### Payments (Razorpay)
`GET /api/v1/payments/config` → `{ provider: "razorpay"|"simulated", mode: "test"|"live"|"simulated", keyId, currency: "INR", merchantName, note }`.
When `provider === "razorpay"` and method ≠ `cod`:
1. `POST /api/v1/payments/razorpay/order` (same body as `/checkout/quote`) → `{ razorpayOrderId, amount (paise), currency, keyId, merchantName, description, prefill:{name,email}, total }`.
2. Load `https://checkout.razorpay.com/v1/checkout.js`; `new Razorpay({ key: keyId, amount, currency, order_id: razorpayOrderId, name: merchantName, description, prefill: {...prefill, contact: phone}, method-specific: for UPI use `config.display.preferences`? keep default, theme: { color: '#e11d48' }, handler(resp) {...}, modal: { ondismiss } }).open()`.
3. In `handler`, POST `/api/v1/checkout/order` with the usual body **plus** `payment: { provider: "razorpay", razorpayOrderId: resp.razorpay_order_id, razorpayPaymentId: resp.razorpay_payment_id, razorpaySignature: resp.razorpay_signature }`.
Errors: 402 payment required · 400 bad signature · 409 amount changed / payment reused.
When `provider === "simulated"`: keep the current flow (no card data leaves the browser) and label it "Test mode — no real payment".
Never collect card numbers in our own form when Razorpay is active (Razorpay's window handles cards/UPI/net banking/wallets).
Orders now carry `payment: { provider: "razorpay"|"simulated"|"cod", mode, razorpayPaymentId?, status }`.

### Email
Order confirmations and password-reset links are emailed when SMTP is configured; otherwise written to `backend/artifacts/outbox.log`. `forgot-password` message text reflects which.

### Health
`GET /health` → adds `currency: "INR"` and `integrations: { database: "sqlite"|"postgresql", googleSignIn, appleSignIn, payments: "simulated"|"test"|"live", email: "smtp"|"outbox-log", llmCopy }`.

---

## v7: Clerk authentication (replaces our own login)

Sign-in/sign-up are handled entirely by **Clerk** (`@clerk/nextjs` v7, already installed; `ClerkProvider` in `app/layout.tsx`, `middleware.ts`, `app/sign-in/[[...sign-in]]`, `app/sign-up/[[...sign-up]]` scaffolded by `clerk init`; dev keys in `project/.env.local`).

- **Every API call** sends Clerk's session token: `Authorization: Bearer ${await getToken()}` (`useAuth().getToken()`; Clerk refreshes it — never cache it yourself). Guests send nothing.
- `GET /api/v1/auth/me` → our account record `User` (created automatically on the first authenticated call, with 250 welcome points). Call it after Clerk reports `isSignedIn` to load points/profile; `onboarded: false` → send new users to `/welcome`.
- `GET /api/v1/auth/providers` → `{ provider: "clerk", enabled: boolean, frontendApi: string|null, backendLookup: boolean }`.
- **Removed** (404/405 now): `POST /auth/signup`, `/auth/login`, `/auth/google`, `/auth/apple`, `/auth/forgot-password`, `/auth/reset-password`. Passwords, password resets, Google/Apple/phone sign-in and email verification are Clerk's job (configured in the Clerk dashboard).
- `DELETE /api/v1/me` deletes our record **and** the Clerk user; the frontend must then call Clerk `signOut()`.
- `User.provider` is `"clerk"`. Everything else in the contract (profile, addresses, wishlist/cart sync, orders, points, offers, settings, history, events) is unchanged.
- `/health.integrations` now has `auth: "clerk"|"not-configured"` and `clerkUserLookup: boolean` instead of `googleSignIn/appleSignIn`.
