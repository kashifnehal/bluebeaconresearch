# 12_DEPLOYMENT.md — Deployment Architecture, Infrastructure & Environment Variables

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
- `NEWS_API_KEY` / `GNEWS_API_KEY`: Global news article collectors.
- `ACLED_API_KEY` / `ACLED_API_EMAIL`: Verified military engagement data feed.

### Alert Channels & Geospatial
- `TELEGRAM_BOT_TOKEN`: Bot token for instant Telegram alert dispatch.
- `NEXT_PUBLIC_MAPBOX_TOKEN`: Mapbox GL JS map tile access token.
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
| **`workers`** | RSS, GDELT, GNews & Price Collectors | `pnpm install --no-frozen-lockfile && pnpm run build` | `pnpm run start:workers` (auto via `scripts/railway-start.sh`) | `/health` (workers now listen for healthcheck) |

> **IMPORTANT**: 
> 1. Both Railway services share `/apps/backend/railway.json`. Deploy settings are **locked in the Railway UI** (config-as-code). The start command uses `scripts/railway-start.sh`, which reads `RAILWAY_SERVICE_NAME` to launch `start:workers` or `start:server` automatically.
> 2. **Disable Serverless** on the `workers` service (Settings → Deploy → Enable Serverless → OFF). Serverless is not controllable via `railway.json` and will scale workers to zero, stopping all cron jobs.
> 3. Optionally point the `workers` service at `/apps/backend/railway.workers.json` in Settings → Config-as-code for an explicit worker-only config.
> 2. `NIXPACKS_NO_FROZEN_LOCKFILE=1` is configured in `nixpacks.toml` to prevent `ERR_PNPM_OUTDATED_LOCKFILE` during CI image builds.
> 3. `apps/backend/src/index.ts` imports both `server.js` and `workers.js` to ensure fallback support for default `pnpm start` entrypoints.

