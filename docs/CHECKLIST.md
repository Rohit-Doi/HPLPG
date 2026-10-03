# AURA — delivery checklist (round 3)

Legend: [ ] pending · [~] in progress · [x] done & verified. Every item is ticked only after it is checked in the running app.

## A. Bugs / regressions
- [x] A1 localhost home page blank — root cause: the dev server was mid-rebuild; page renders (verified by headless screenshots at 15:04 and 15:47)
- [x] A2 Catalog image paths broken by the folder reorganisation (accessories → Accessories / Shoes / Bags / Jewelry / Watches) — remap, no 404 images anywhere — remapped to Shoes/Men, Shoes/Women, Watches, Jewelry, Bags, Accessories; 0 missing images (359 products)

## B. Catalog & data (dynamic, not static)
- [x] B1 Products served from the database/API (no static catalog.json dependency at runtime; JSON only as a build-time seed/fallback) — listings/search/product fetch from /catalog/search, /catalog/suggest, /products/{id}; catalog.json is SSR/offline fallback only
- [x] B2 Ingest the new image folders as products: Shoes (52), Bags (12), Jewelry (50), Watches (50), Accessories (47); keep the user's category split as-is — ingested: 3 catalog-only items (Bags/Watches/men extras) + all folders mapped; Shoes duplicates de-duplicated
- [x] B3 `images/` — 113/130 files are duplicates of catalog photos already used; the folder is kept as the creative pool (banners render from catalog photos)
- [x] B4 Product attributes for filtering: price, colour (from name + dominant image colour), brand, sizes, style, design/pattern, material — colour (name + dominant pixel), material, pattern, styles, sizes derived in attributes.py
- [x] B5 Product description, size options, colour options (variants) per product — description + sizes + colourOptions (sibling colours) per product
- [x] B6 New products without behavioural data get a content-based fallback (attribute kNN) so they are still recommended (item cold start) — content-based similarity (department/subcategory/brand/colour/material/style/price) + new_arrivals module
- [x] B7 Delivery estimate per product (by shipping option + destination postal code/state) — GET /delivery/estimate by country/state/shipping

## C. Storage (recommendation for user + behaviour data; alternative to Supabase)
- [x] C1 Recommend & document the storage design — docs/STORAGE_AND_AUTH.md (Postgres via SQLAlchemy, SQLite for dev, own auth + optional Google/Apple)
- [x] C2 Tables: users, profiles, sessions/tokens, addresses, wishlist, cart, orders, order_items, reviews, coupons_redeemed, points_ledger, events (impressions/clicks/views/carts/purchases/searches/filters), model_feedback — tables: users, addresses, orders, user_events, wishlist, cart, reviews, points_ledger, coupon_redemptions, events
- [x] C3 Event store feeds future retraining: export endpoint/script → parquet the pipeline can read (users/interactions schema) — python -m hplpga.store.export -> artifacts/feedback/*.parquet in the training schema
- [x] C4 Postgres switch via `HPLPGA_DATABASE_URL`; migrations/init; docker-compose service — HPLPGA_DATABASE_URL (psycopg) + postgres service in docker-compose

## D. Accounts & profile
- [x] D1 (email/password verified in UI; Google/Apple wired, enabled by keys; logout in header menu + account) Login/signup (email+password), Google, Apple; session persistence; logout everywhere (header menu, profile)
- [x] D2 Profile page: account info edit, settings (notifications, privacy/reset personalization), wishlist (server-synced), orders, addresses (add/edit/delete/default), points balance & ledger, coupons & offers available to me, saved payment preference, logout — account hub: overview, orders, wishlist (server-synced), addresses, account info, settings, offers & coupons, points ledger, personalization, logout
- [x] D3 Wishlist & cart synced to the server when signed in (merge guest → account on login) — guest wishlist/cart merged into the account on login

## E. Checkout & payments
- [x] E1 Payment options: UPI, cash on delivery, credit card, debit card (separate), net banking / wallet; card form validated client-side (test mode) — UI: credit card, debit card, UPI, net banking, wallet, COD with per-method forms
- [x] E2 Add / choose delivery address at checkout (saved addresses, default) — saved addresses + inline add at checkout; delivery estimate per option
- [x] E3 Coupons, bank offer, points redemption, delivery estimate on review + confirmation — coupons, bank offer, points, arrival window on review & confirmation
- [x] E4 Razorpay integration behind a flag (switches on with keys); without keys the checkout runs in clearly labelled simulated mode — chosen for the demo because Razorpay requires PAN even for test keys

## F. Search & filters
- [x] F1 Search for items (server-side search with suggestions) — server-side search with live suggestions
- [x] F2 Filters: price range, colour, brand, size, style, design/pattern, discount, department/subcategory, audience, rating; sort options; mobile filter sheet — price slider, discount, colour swatches, brand, size, style, material, pattern, audience, subcategory, rating, on-sale, new; URL-synced; mobile sheet

## G. Product page
- [x] G1 Description, size + colour options, stock/variants, delivery estimate, offers — description, sizes, colour siblings, attribute chips, delivery estimate block
- [x] G2 Reviews: written + star ratings (users can post; average + distribution shown); no fabricated reviews — star summary + distribution, sort, verified/demo labels, helpful, write-a-review (members & guests)
- [x] G3 "Similar products" the system recommends based on the user's likes + the current product (item graph + content similarity + user history) — personalised similar rail with per-item why + bought-together / also-viewed / viewed-next rails

## H. Home page
- [x] H1 (verified after catalog reload: creatives, category grid, sale, personalised rails, new_arrivals) Banner carousel (agent-selected) incl. creatives from `images/`, category tiles, sale, personalised recommendations — verify after catalog reload
- [x] H2 Reference features from Amazon/Flipkart sale pages: deal-of-the-day strip, "top offers" grid, bank-offer strip, recently viewed, "inspired by your browsing", category deals — Deal of the day (countdown) + Top offers by category added; new_arrivals module rendered

## I. Auth everywhere / security
- [x] I1 (account/orders/welcome redirect to /login?next=; API guards via Bearer token) Protected routes (account, orders, checkout points) redirect to login; API guards
- [x] I2 Keys asked in chat & documented in docs/STORAGE_AND_AUTH.md: ask the user for the keys needed (Google OAuth client ID, Apple Services ID, Firebase (if used), Postgres URL, payment gateway test keys, Anthropic) and document where each goes

## J. Verification
- [x] J1 25 backend tests pass on the re-fit models; tsc clean + next build exit 0; pages smoke-tested at desktop + 375px (home, shop, search, product, cart, checkout, orders, account, login/reset, lab, insights)
- [x] J2 README rewritten for the current build: every number re-checked against evaluation.json, new architecture diagram (docs/images/architecture.svg) and fresh screenshots; API contract v1–v7, STORAGE_AND_AUTH.md, DEPLOY.md

## K. Operational gaps found in review (round 4) — solutions
- [x] K1 Live trending from the event store (24h/7d) blended into the agent's trend signal — `GET /trending/live`; agent blends 40% live
- [x] K2 Order lifecycle: confirmed → packed → shipped → out for delivery → delivered (time-driven), cancel before shipping (restocks + reverses points), return request within 30 days — `POST /orders/{id}/cancel|return`
- [x] K3 Inventory per (item, size) seeded from demand, decremented on order, low-stock / sold-out — `GET /products/{id}/stock`; 409 on insufficient stock
- [x] K4 Password reset — now handled by Clerk (our own reset endpoints were removed with the move to Clerk, v7)
- [x] K5 Privacy: export my data `GET /me/export`, delete account `DELETE /me` (orders anonymised, reviews kept as "Deleted user")
- [x] K6 Rate limiting on login (20/5 min) and forgot-password (5/10 min)
- [x] K7 Currency display rates (USD/INR/EUR/GBP/AED) — `GET /meta/currency`
- [x] K8 (verified in browser: stock chips, cancel/return, reset flow, export/delete, INR, live rail) Frontend for K1–K7: stock badges + size availability, order cancel/return buttons + live status, forgot/reset password pages, account → export/delete, currency switcher, "Trending now (live)" rail
- [ ] K9 Payment gateway test mode (Razorpay) — deferred: Razorpay asks for PAN/KYC even for test keys; simulated mode is used instead
- [ ] K10 Transactional email (order confirmation, reset link) — blocked on SMTP keys

## L. Indian store & key integrations (round 5)
- [x] L1 Base currency INR: catalog converted with Indian retail endings (…99/…49), Indian digit grouping helper, clearance in rupees
- [x] L2 All offers/fees/thresholds in rupees (free delivery ≥ ₹1,499, ₹99/₹249 shipping, ₹49 COD, bank offer ≤ ₹1,500, coupons, points 5/₹100, 1 pt = ₹1, welcome 250); banners and agent copy re-rendered in ₹
- [x] L3 India delivery zones (metro / rest of India / remote / international) by state or 6-digit PIN; 36 states/UTs endpoint
- [x] L4 Razorpay: order creation for the re-priced total, HMAC signature + amount verification, replay protection; simulated mode without keys; COD bypass (tested with a stubbed gateway)
- [x] L5 Email: SMTP sender (Gmail/Brevo) for order confirmations; outbox fallback (sign-in emails are sent by Clerk)
- [x] L6 `backend/.env` is loaded automatically; `/health` reports each integration's status
- [x] L7 Claude hero copy used automatically when a key is set (non-blocking, cached per visitor type)
- [x] L8 Step-by-step key guide: docs/KEYS_SETUP.md
- [x] L9 Frontend (verified in browser): ₹ everywhere, Indian address form (PIN, +91 mobile, states), PIN delivery check, Razorpay checkout UI — done
- [ ] L10 Verify Razorpay end-to-end with test keys — deferred (needs KYC); code path tested against a stubbed gateway (L4)

## M. Clerk authentication (round 6) — "Clerk only"
- [x] M1 `npx clerk init`: @clerk/nextjs installed, ClerkProvider, middleware, /sign-in & /sign-up, temporary dev keys (unclaimed app)
- [x] M2 Backend verifies Clerk session tokens (RS256 via JWKS, exp/nbf, issuer, authorized origin) and links Clerk users to our accounts (welcome points, orders, profile unchanged)
- [x] M3 Old login removed: /auth/signup, /auth/login, /auth/google, /auth/apple, forgot/reset password (Clerk handles them); delete-account also deletes the Clerk user
- [x] M4 Tests sign Clerk-style tokens locally (expired / wrong issuer / wrong origin / forged key all rejected); live JWKS reachable
- [x] M5 Docs: KEYS_SETUP.md (claim app, sign-in methods, going live), STORAGE_AND_AUTH.md, env templates
- [x] M6 Frontend: Clerk sign-in/up pages in AURA style (verified desktop + 375px), old routes redirect, /account & /welcome protected, token on every API call, avatar menu, Security tab, keyless mode builds and serves guests
- [ ] M7 You: create the first account at /sign-up (we may not create accounts with Clerk ourselves) and check: welcome 250 points, /welcome onboarding, avatar menu, account tabs, sign out
- [ ] M8 You: claim the Clerk app (`npx clerk auth login`) and pick sign-in methods (email / Google / phone OTP)
