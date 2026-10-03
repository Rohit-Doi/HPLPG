# Storage & authentication design (recommendation)

## Why not Supabase
Supabase's free tier **pauses inactive projects after ~7 days** and the auth/session then fails until it is resumed —
bad for a demo that judges open weeks later. You want storage that never sleeps and that you own.

## Recommended stack (what the code now implements)

| Concern | Choice | Why |
|---|---|---|
| Database | **PostgreSQL** (SQLAlchemy 2, `HPLPGA_DATABASE_URL=postgresql+psycopg://…`). Local dev: **SQLite** file (zero setup). | Relational data (users, orders, reviews) + JSON columns for profiles; Postgres never "pauses"; one env var switches. |
| Hosting Postgres | Docker `db` service in `docker-compose.yml` (self-hosted, free), or a managed instance: **Neon** (free tier, scales to zero but never deletes, wakes in <1 s), **Railway**, **Render**, **Supabase-Postgres only** (DB without their auth). | No expiry; standard `psycopg` driver. |
| Authentication | **Clerk** (`@clerk/nextjs` in the storefront). Clerk stores the sign-in identity (email, phone, Google…) and issues short-lived RS256 session tokens; the API verifies them against Clerk's JWKS (`hplpga/store/clerk.py`) and links each Clerk user to our `users` row (`provider="clerk"`, `provider_sub=<Clerk user id>`). | Hosted login with email codes, Google, phone OTP, bot protection; no passwords stored by us; free tier; doesn't pause. Everything shopping-related stays in our database. |
| Behaviour store | `events` table (impressions, clicks, views, carts, wishlists, searches, filters, purchases, reviews) + `user_events` (item interactions) | Feeds analytics and the next training run. |
| Model feedback loop | `python -m hplpga.store.export` → `artifacts/feedback/{interactions,users,events}.parquet` in the training schema | The pipeline can concatenate these with the historical tables to retrain with live behaviour. |

### Schema (tables created by `init_db()`)
`users` (email, provider="clerk", provider_sub=Clerk user id, avatar, points, profile_json; a legacy `password_hash` column stays empty) · `addresses` · `orders` (data_json with lines, totals, address, payment, timeline) ·
`user_events` (view_item / add_to_cart / purchase per user or visitor) · `wishlist` · `cart` · `reviews` (rating, title, body, size_fit, verified, source user|demo, helpful) ·
`points_ledger` (delta, reason, ref) · `coupon_redemptions` · `events` (type, item_id, page_id, module_id, meta_json, device, channel, region, ts).

### Switching to Postgres
```bash
# docker (bundled)
docker compose up -d db
export HPLPGA_DATABASE_URL=postgresql+psycopg://aura:aura@localhost:5432/aura
uvicorn hplpga.api.main:app --port 8000        # tables are created on first start
# managed (e.g. Neon): paste the connection string into backend/.env as HPLPGA_DATABASE_URL
```

## Keys (full step-by-step guide: `docs/KEYS_SETUP.md`)
| Key | Where | Enables |
|---|---|---|
| Clerk `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | `project/.env.local` (written by `npx clerk init`; the backend reads them from there in dev, from `backend/.env` in production) | Sign-in (email codes, Google, phone OTP…). Dev keys already exist; claim the app with `npx clerk auth login` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | `backend/.env` | Real test-mode payments (UPI, cards, net banking, wallets) |
| `SMTP_*` | `backend/.env` | Order-confirmation emails |
| `HPLPGA_DATABASE_URL` | `backend/.env` | PostgreSQL instead of SQLite |
| `ANTHROPIC_API_KEY` | `backend/.env` | Claude-written hero copy |
