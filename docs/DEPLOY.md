# Deploying AURA (free tier, ~20 minutes)

| Part | Host | Free tier notes |
|---|---|---|
| Storefront (Next.js, `ecomm_personalization/project`) | **Vercel** | Unlimited for hobby projects |
| API (FastAPI, `ecomm_personalization/backend`) | **Render** (Docker, `render.yaml` at the repo root) | 512 MB RAM (the API uses ~256 MB). Sleeps after 15 min idle; the first request then takes ~50 s |
| Database | **Neon** Postgres | Never deletes your data. Render's free disk is wiped on every deploy, so SQLite can't be used there |
| Sign-in | **Clerk** (your current development keys) | Fine for a demo. Real customers need a production instance (see KEYS_SETUP.md, "Going live") |

Everything in the repo is ready. You only paste values into three dashboards.

## Before you start

1. **Commit and push** the project to GitHub (`Rohit-Doi/HPLPGA`). The trained models (`backend/artifacts/models`, about 22 MB) and `backend/artifacts/processed/catalog.parquet` are now included on purpose: the API needs them to serve.
2. Open `ecomm_personalization/project/.env.local` in your editor. You'll copy the two Clerk keys from it. Never paste them into a file that gets committed.
3. **Pick your two names now.** Each host's URL comes from the name you type, so you can fill in each host's settings before the other exists:
   - Render service name, e.g. `aura-api`, gives `https://aura-api.onrender.com`
   - Vercel project name, e.g. `aura-store`, gives `https://aura-store.vercel.app`

   If a name is taken, the host adds a suffix. Use whatever URL it actually gives you below.

## 1. Database: Neon (3 min)

1. https://neon.tech → sign up → **Create project** → region **AWS Asia Pacific (Singapore)**.
2. **Connect** → copy the connection string.
3. Change `postgresql://` at the start to **`postgresql+psycopg://`**. Keep `?sslmode=require` at the end. This is your `HPLPGA_DATABASE_URL`.

## 2. API: Render (5 min plus about 8 min of building)

1. https://render.com → sign up with GitHub → **New → Blueprint** → choose the `HPLPGA` repo. Render reads `render.yaml`.
2. It asks for these values:

| Key | Value |
|---|---|
| `HPLPGA_CORS_ORIGINS` | your Vercel URL, e.g. `https://aura-store.vercel.app` (no trailing slash) |
| `CLERK_PUBLISHABLE_KEY` | the value of `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` from `.env.local` |
| `CLERK_SECRET_KEY` | the value of `CLERK_SECRET_KEY` from `.env.local` |
| `HPLPGA_DATABASE_URL` | the Neon string from step 1 |
| `PUBLIC_SITE_URL` | same as `HPLPGA_CORS_ORIGINS` |

   Optional, under **Environment** later: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, the `SMTP_*` values, `ANTHROPIC_API_KEY`.
3. **Apply**, and wait for "Live".
4. Open `https://<your-api>.onrender.com/health`. It must show `"auth": "clerk"`, `"clerkUserLookup": true` and `"database": "postgresql"`.

## 3. Storefront: Vercel (5 min)

1. https://vercel.com → sign up with GitHub → **Add New → Project** → import `HPLPGA`.
2. **Root Directory**: click *Edit*, choose **`ecomm_personalization/project`**. Framework: Next.js (auto-detected).
3. **Environment Variables** (all three before the first deploy):

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | your Render URL, e.g. `https://aura-api.onrender.com` (no trailing slash) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | from `.env.local` |
| `CLERK_SECRET_KEY` | from `.env.local` |

4. **Deploy**.

If either URL turned out different from what you planned, fix it now:
- Render URL changed: update `NEXT_PUBLIC_API_URL` in Vercel → **Deployments → Redeploy**. `NEXT_PUBLIC_*` values are baked in at build time, so a redeploy is required.
- Vercel URL changed: update `HPLPGA_CORS_ORIGINS` and `PUBLIC_SITE_URL` in Render. Render restarts on its own.

## 4. Check it works

1. Open `https://<your-api>.onrender.com/health` first, to wake the API.
2. Open the Vercel URL. The home page should show personalised products, not the offline fallback.
3. **Sign up.** You should land on `/welcome` with 250 points, and the account appears in the Clerk dashboard under **Users**.
4. Add to bag → checkout → place an order. It should appear in *Account → Orders*.

If sign-in works but your account shows as a guest (no points or orders), `HPLPGA_CORS_ORIGINS` on Render doesn't exactly match the address in your browser bar.

### Vercel preview URLs (optional)

Each branch or pull-request deploy gets its own URL. To allow those as well, add this in Render:
`HPLPGA_CORS_ORIGIN_REGEX=https://aura-store-[a-z0-9-]+-<your-vercel-team>\.vercel\.app`

## Before a demo

Render's free API sleeps when nobody uses it. About a minute before you present, open `/health`, then the home page.

## Tested locally

- `docker build -f backend/Dockerfile .` (run from `ecomm_personalization/`) builds the exact Render image.
- In that container, `/health`, the personalised landing page and the storefront API all respond.
- The image allows the configured origin and refuses other sites.
- It uses about 256 MB of RAM.
- The storefront builds (`next build`) from a clean copy that contains only the files git tracks.
