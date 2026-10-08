# 12_DEPLOYMENT.md — Deployment Architecture, Infrastructure & Environment Variables

> **📍 Doc status — topic/historical file.** Live status: `docs/brain/08_CURRENT_STATUS.md`. `claude/23_TODO.md` is not in this repo. Fastify `/docs` is not a public portal.

This document provides a guide to infrastructure hosting, CI/CD deployment pipelines, required secrets, environment variable configurations, and external API service dependencies.

---

## 1. Production Hosting Topology

```
┌─────────────────────────┐      ┌─────────────────────────┐      ┌─────────────────────────┐
│     Vercel Platform     │      │   Render / Railway /    │      │    Supabase Managed     │
│                         │      │     DigitalOcean        │      │       Postgres          │
│ - Next.js 16 Web App    │      │ - Fastify REST API      │      │ - Database & RLS        │
│ - Middleware Auth Guard │      │ - BullMQ Worker Process │      │ - Supabase Auth & JWT   │
└─────────────────────────┘      └─────────────────────────┘      └─────────────────────────┘
                                              │
                                              ▼
                                 ┌─────────────────────────┐
                                 │   Upstash Serverless    │
                                 │         Redis           │
                                 │ - BullMQ Queues         │
                                 │ - Edge Rate Limiting    │
                                 └─────────────────────────┘
```

---

## 2. Environment Variables Audit (`.env.example`)

### Supabase & Auth
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project HTTPS URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public anon JWT key.
- `SUPABASE_SERVICE_ROLE_KEY`: Admin service role key (backend secret).

### AI Engine
- `ANTHROPIC_API_KEY`: Anthropic API secret key for Claude 3.5 Sonnet / Haiku calls.

### External Ingestion APIs
- `ALPHA_VANTAGE_API_KEY`: Financial commodity market data provider.
- `GNEWS_API_KEY`: Global news article collector.
- `ACLED_API_KEY` / `ACLED_API_EMAIL`: Verified military engagement data feed.

### Alert Channels & Geospatial
- `TELEGRAM_BOT_TOKEN`: Bot token for instant Telegram alert dispatch.
- `NEXT_PUBLIC_MAPBOX_TOKEN`: Mapbox GL JS map tile access token.

> ⚠️ UPDATED 2026-08-19 — the map actually uses `maplibre-gl` (MapLibre GL JS) + OpenStreetMap tiles, not Mapbox, and does not require this token.
- `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis HTTP credentials.

---

## 3. Build & Deployment Commands

### Monorepo Build Pipeline (`turbo.json`)
```bash
# Install dependencies
pnpm install

# Run type check across monorepo
pnpm run type-check

# Build all applications and packages
pnpm run build

# Start backend server
pnpm --filter backend start
```

---

## 4. Railway Deployment Configuration Matrix

Railway deploys two distinct services from the backend codebase:

| Railway Service | Purpose | Build Command | Start Command | Healthcheck Path |
| :--- | :--- | :--- | :--- | :--- |
| **`backend`** | Fastify HTTP API & Webhooks | `pnpm install --no-frozen-lockfile && pnpm run build` | `pnpm run start:server` | `/health` |
| **`workers`** | RSS, GDELT, GNews & Price Collectors | `pnpm install --no-frozen-lockfile && pnpm run build` | `pnpm run start:workers` | `/health` |

> **IMPORTANT**:
> 1. Workers service **must** use config file `/apps/backend/railway.workers.json` (not `railway.json`). Settings are locked in Railway UI when config-as-code is active — change the file in GitHub and redeploy.
> 2. `"sleepApplication": false` in `railway.workers.json` is **required**. Serverless/sleep mode scales workers to zero with no HTTP traffic, killing 15-minute cron jobs.
> 3. After deploy, verify logs: `startup:rss` within 30s, `workers:heartbeat` every 5 min, `rss-collector` every 30 min.
> 4. Add `SUPABASE_SERVICE_ROLE_KEY` to **Vercel** (not just Railway) so `/api/signals` reads reliably on dashboard refresh.
> 5. `NIXPACKS_NO_FROZEN_LOCKFILE=1` in `nixpacks.toml` prevents lockfile errors during Railway builds.
> 6. Pre-deploy `npm run migrate` is a no-op in `package.json` — safe if left configured in Railway UI.

## 6. Auth Domain Proxy (Cloudflare Worker in front of Supabase Auth)

> ⚠️ ADDED 2026-09-27 — code shipped, **not yet deployed or live**. Full detail: `docs/brain/12_DEPLOYMENT.md` §6, `docs/brain/14_CHANGELOG.md` v0.111.0, ADR 029 in `10_DECISIONS.md`.

A Cloudflare Worker (`infra/cloudflare/auth-proxy-worker.js`) will sit at `auth.bluebeaconresearch.com` and proxy all Supabase REST/Auth/Storage/Realtime traffic, rewriting the Host header, so OAuth screens and auth redirects show a BBR domain instead of the raw `*.supabase.co` project URL. CORS is restricted to BBR's real production and preview domains, never a wildcard. `apps/web` reads an optional `NEXT_PUBLIC_SUPABASE_AUTH_URL` for auth-flow clients only (falls back to the raw project URL when unset, so this ships with zero production behavior change). **Still needed, dashboard-only, no engineering:** (1) add the DNS record + bind the Worker in Cloudflare, (2) update the Google Cloud Console OAuth redirect URI, (3) add the new redirect URL to Supabase Auth's own allowlist, (4) test the full Google sign-in flow in a preview deployment before touching production. None of these were possible from this session — see `docs/brain/LIVE_TODO.md`.

---

### Troubleshooting: "Dashboard shows old data after deploy"

This is usually **not** a caching or Railway failure. Check in order:

1. **Workers logs** — did `startup:rss` show `inserted > 0`? If `inserted: 0, duplicates: N`, feeds had no new articles.
2. **Supabase** — compare `created_at` (ingestion) vs `event_date` (publish). UI shows `event_date`.
3. **Vercel env** — is `SUPABASE_SERVICE_ROLE_KEY` set? Without it, `/api/signals` may return empty for some sessions.
4. **Featured card logic** — `/alerts` hero picks `severity >= 8` first; new low-severity signals won't replace the hero card.

