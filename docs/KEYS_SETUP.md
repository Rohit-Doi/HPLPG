# Getting and installing the keys

Every key except Clerk's is **optional** (payments are simulated, emails go to a log file). Sign-in uses **Clerk**; development keys were already created for you by `npx clerk init`.
Add them one at a time, restart the backend, and check `/health` after each.

## 0. Where the keys go (do this once)

1. Copy `ecomm_personalization/backend/.env.example` to `ecomm_personalization/backend/.env`.
2. Paste each key on its line as you get it (no quotes needed, no spaces around `=`).
3. Restart the backend (stop and start `uvicorn hplpga.api.main:app --port 8000`).
4. Open http://localhost:8000/health and check the `integrations` block:
   ```json
   "integrations": {"database": "sqlite", "auth": "clerk", "clerkUserLookup": true,
                    "payments": "simulated", "email": "smtp", "llmCopy": true}
   ```

**Keys live in `backend/.env`**, except Clerk's, which the Clerk CLI keeps in `project/.env.local` (the backend reads the two Clerk keys from there in development). Secrets never reach the browser.
`backend/.env` is excluded from git (`.gitignore` has `.env`), so never paste keys into any other file, chat or commit.

| Priority | Key | Unlocks | Cost |
|---|---|---|---|
| 1 | Razorpay test keys | Real test-mode UPI / card / net banking / wallet checkout | Free, but Razorpay may ask for PAN even before test keys |
| 2 | Clerk (claim the dev app) | Sign-in with email codes, Google, phone OTP… | Free tier |
| 3 | SMTP (Gmail app password) | Order-confirmation emails | Free |
| 4 | PostgreSQL URL | Durable production database | Free tier (Neon) |
| 5 | Anthropic API key | Claude-written hero banner copy | Pay-as-you-go |

---

## 1. Razorpay (payments) — optional

**Without keys the store runs in simulated payment mode**: the full checkout works (UPI/card/net banking/wallet/COD choices, coupons, points, orders, cancel/return), it is labelled "Test mode — payments are simulated", and no money moves. That is the recommended setup for the demo.

Razorpay's signup may require PAN (KYC) before it shows even test keys. Every Indian gateway needs KYC for live payments (an RBI rule), so only do this when you are ready to share those details.

1. Go to https://dashboard.razorpay.com/signup and sign up with your email or phone.
   If it lets you skip business activation, test mode is available immediately; if it insists on PAN, stop here and keep simulated mode.
2. In the dashboard, make sure the **Test Mode** toggle (top of the page) is on.
3. Open **Account & Settings → API Keys** (under *Website and app settings*) and click **Generate Test Key**.
4. Copy both values right away (the secret is shown only once; you can regenerate it later):
   - **Key Id**: starts with `rzp_test_`
   - **Key Secret**
5. In `backend/.env`:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
   ```
6. Restart the backend. `/health` should show `"payments": "test"`.
7. Test it: add something to the bag and check out with UPI/card. The Razorpay window opens.
   - UPI: enter `success@razorpay` (use `failure@razorpay` to test a failed payment).
   - Cards: use the test card numbers listed at https://razorpay.com/docs/payments/payments/test-card-details/ (any future expiry, any CVV; OTP page accepts any value in test mode).
   - The order appears in *Account → Orders* as "Paid via Razorpay", and in the Razorpay dashboard under *Transactions → Payments*.

**Going live later** requires completing Razorpay KYC (PAN, bank account, business details) and a public website with Terms, Privacy, Refund/Cancellation, Shipping and Contact pages. After approval, generate **Live** keys (`rzp_live_…`) and replace the test ones.

How it's secured: the backend re-prices the bag, creates the Razorpay order for that exact amount, and verifies Razorpay's HMAC signature and the amount before creating our order. A payment can't be reused, and card data never touches our servers.

---

## 2. Clerk (sign-in)

Sign-in, sign-up, password resets, email verification and social logins are all handled by **Clerk**.
**It already works**: `npx clerk init` created a *temporary, unclaimed* Clerk development app and wrote its keys to
`ecomm_personalization/project/.env.local` (the backend reuses those two keys automatically).

### Claim the app (do this once, so it's yours)
1. In a terminal: `cd ecomm_personalization/project` then `npx clerk auth login`.
   A browser window opens: sign up / sign in to Clerk. The temporary app is then claimed into your account automatically.
2. Open https://dashboard.clerk.com → your AURA app. You'll see your users, sessions and settings there.

### Choose how people sign in
Dashboard → **User & authentication** (or **Configure → Email, phone, username / SSO connections**):
- **Email** with verification code or password, **Phone number** (SMS OTP, popular in India), **Google** (works in development without any Google Cloud setup, because Clerk provides shared credentials), and more (Apple, Microsoft…).
- Or from the terminal: `npx clerk config pull` to review and `npx clerk config patch` (add `--dry-run` to preview) to change.

### Deploying with the development keys (demo)
Follow `docs/DEPLOY.md`. Paste the same two keys into Vercel and Render, and set `HPLPGA_CORS_ORIGINS` on Render to your Vercel URL.

### Going live
Development keys (`pk_test_…`/`sk_test_…`) are meant for testing: Clerk shows a "Development mode" badge, caps the number of users, and uses shared Google credentials. For real customers on your own domain:
1. `npx clerk deploy` (or Dashboard → **Configure → Domains / Production instance**) to create the production instance for your domain.
2. For Google sign-in in production, Clerk asks for **your own** Google OAuth credentials: follow Clerk's prompt (Google Cloud Console → OAuth client ID → Web application → paste the redirect URI Clerk shows).
3. Put the production keys in `project/.env.local` (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) **and** `backend/.env` (`CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`), and add your domain to `HPLPGA_CORS_ORIGINS`.

Check: `/health` shows `"auth": "clerk", "clerkUserLookup": true`.

---

## 3. Email (SMTP) — order confirmations

These are our store emails (order confirmations). Sign-in emails (verification codes, password resets) are sent by Clerk itself. Without SMTP, our emails are written to `backend/artifacts/outbox.log`.

### Option A: Gmail (simplest, ~500 emails/day)
1. Your Google Account → **Security** → turn on **2-Step Verification** (required for app passwords).
2. Open https://myaccount.google.com/apppasswords → app name `AURA` → **Create** → copy the 16-character password (remove the spaces).
3. In `backend/.env`:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=yourname@gmail.com
   SMTP_PASSWORD=abcdefghijklmnop
   MAIL_FROM=AURA <yourname@gmail.com>
   PUBLIC_SITE_URL=http://localhost:3000
   ```
4. Restart. `/health` shows `"email": "smtp"`. Test by placing an order while signed in and check the inbox (and spam folder) for the confirmation.

### Option B: Brevo (free 300/day, better deliverability from a custom domain)
1. Sign up at https://www.brevo.com → **SMTP & API → SMTP** → **Generate a new SMTP key**.
2. Add and verify your sender email under **Senders, domains & dedicated IPs**.
3. Use `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_USER=<the SMTP login shown on that page>`, `SMTP_PASSWORD=<the SMTP key>`, and `MAIL_FROM=AURA <your-verified-sender>`.

`PUBLIC_SITE_URL` is the address used in email links; change it to your real domain after deploying.

---

## 4. PostgreSQL (production database)

SQLite (the default file `backend/artifacts/store.db`) is fine on one machine. Switch to Postgres when you deploy.

### Option A: Neon (managed, free, never pauses your data away)
1. Sign up at https://neon.tech → **Create project** (pick the region closest to your users; for India choose the nearest Asia-Pacific region).
2. On the project dashboard click **Connect** and copy the connection string. It looks like
   `postgresql://neondb_owner:PASSWORD@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
3. Change the start to `postgresql+psycopg://` and put it in `backend/.env`:
   ```
   HPLPGA_DATABASE_URL=postgresql+psycopg://neondb_owner:PASSWORD@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
4. Install the driver once: `pip install "psycopg[binary]"`.
5. Restart the backend. All tables are created automatically on first start. `/health` shows `"database": "postgresql"`.

### Option B: Docker (self-hosted)
```bash
cd ecomm_personalization
docker compose up -d db
```
Then set `HPLPGA_DATABASE_URL=postgresql+psycopg://aura:aura@localhost:5432/aura`, run `pip install "psycopg[binary]"`, and restart.

The new database starts empty (accounts from the SQLite file are not copied over; Clerk users get a fresh store account on their next sign-in). Once it's set up, tell me and I'll run the full test suite against it.

---

## 5. Anthropic (Claude hero copy)

1. Go to https://console.anthropic.com and sign up.
2. **Settings → Billing**: add a payment method and a small credit balance (usage is billed per request).
3. **Settings → API Keys → Create Key**, name it `AURA`, and copy it (starts with `sk-ant-`, shown only once).
4. In `backend/.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
   ```
5. Restart. `/health` shows `"llmCopy": true`.
   Pages stay instant: the first visitor of a given type sees the template copy while Claude writes that type's copy in the background. Later visitors of that type see Claude's copy (hero eyebrow/title/subtitle/button). In the Lab, generating a page waits for Claude directly.
   To keep cost down, copy is cached per visitor type (stage × department × channel × daypart × persona × region), so each type is generated once per server run.

---

## Final check

With the backend running, http://localhost:8000/health should show what you enabled. For example, with Razorpay and Gmail set up:
```json
"integrations": {"database": "sqlite", "auth": "clerk", "clerkUserLookup": true, "payments": "test", "email": "smtp", "llmCopy": false}
```
Then walk through it once: sign up via Clerk → add to bag → pay with `success@razorpay` → receive the confirmation email → *Account → Orders* shows the order as paid.
