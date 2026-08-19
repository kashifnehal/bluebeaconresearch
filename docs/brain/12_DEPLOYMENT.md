# 12_DEPLOYMENT.md — Deployment Architecture, Infrastructure & Environment Variables

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

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
- Map rendering: the web client uses MapLibre GL with OpenStreetMap raster tiles by default and does not require a Mapbox token. If you plan to use a proprietary tile provider, set your provider-specific env vars accordingly.
- `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis HTTP credentials.

**Notes**: The `/api/signals` endpoint may return cached/fallback payloads when upstream rate-limits or DB errors occur; code sets header `x-signals-feed-status: degraded` and response fields `fallback`, `fallbackReason`, and `fallbackLastUpdated` to help the frontend display degraded-mode banners and last-updated timestamps.

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

| Railway Service | Purpose                              | Build Command                                         | Start Command            | Healthcheck Path |
| :-------------- | :----------------------------------- | :---------------------------------------------------- | :----------------------- | :--------------- |
| **`backend`**   | Fastify HTTP API & Webhooks          | `pnpm install --no-frozen-lockfile && pnpm run build` | `pnpm run start:server`  | `/health`        |
| **`workers`**   | RSS, GDELT, GNews & Price Collectors | `pnpm install --no-frozen-lockfile && pnpm run build` | `pnpm run start:workers` | `/health`        |

> **IMPORTANT**:
>
> 1. Workers service **must** use config file `/apps/backend/railway.workers.json` (not `railway.json`). Settings are locked in Railway UI when config-as-code is active — change the file in GitHub and redeploy.
> 2. `"sleepApplication": false` in `railway.workers.json` is **required**. Serverless/sleep mode scales workers to zero with no HTTP traffic, killing 15-minute cron jobs.
> ⚠️ UPDATED 2026-08-19 — `railway.json` (the backend service's config, confirmed as its default by elimination since point 1 above is the only documented override) had the same gap and lacked the same override: added `"sleepApplication": false` plus `restartPolicyType`/`restartPolicyMaxRetries`/`numReplicas` to match, healthcheck untouched. Railway's own docs warn the first request to a slept service can `502`, not just add latency — low urgency pre-launch (founder-only traffic) but cheap to close before real API customers or Telegram webhooks depend on first-hit reliability. Full detail: `14_CHANGELOG.md` v0.27.0.
> 3. After deploy, verify logs: `startup:rss` within 30s, `workers:heartbeat` every 5 min, `rss-collector` every 15 min.
> 4. Add `SUPABASE_SERVICE_ROLE_KEY` to **Vercel** (not just Railway) so `/api/signals` reads reliably on dashboard refresh.
> 5. `NIXPACKS_NO_FROZEN_LOCKFILE=1` in `nixpacks.toml` prevents lockfile errors during Railway builds.
> 6. Pre-deploy `npm run migrate` is a no-op in `package.json` — safe if left configured in Railway UI.
> 7. **Schema changes**: see `16_MIGRATION_CHECKLIST.md` (added 2026-08-18) — `supabase/config.toml` now exists and the CLI is scaffolded (`supabase db push`), but not yet linked to the live project (needs an interactive `supabase login`). Until it's linked, migrations still go through the SQL editor manually — but the standing verification checklist in that file is mandatory regardless, after the `008` constraint fix silently failed to apply for two days despite being marked done.
> ⚠️ UPDATED 2026-08-19 — The CLI is now linked (as of 2026-08-19, via a Supabase Personal Access Token, not interactive login). The Management API works (used to verify migration 012 via Advisors), but direct-Postgres CLI commands (`supabase db push`, `migration list`) still fail with a permission error on this project — cause not yet diagnosed. Schema changes still go through the SQL editor manually for now.

## 5. Email Delivery Infrastructure (Resend + Cloudflare DNS)

> ⚠️ ADDED 2026-08-19 — new production dependency, not present when this file's original sections were written.

- **Provider**: Resend, domain `send.bluebeaconresearch.com` — status Verified, DNS records hosted on Cloudflare, region North Virginia (us-east-1).
- **Wiring**: configured as Supabase Auth's custom SMTP provider directly in the Supabase dashboard (`Authentication → Emails → SMTP Settings` / `/auth/smtp`) — a **Supabase project setting**, not an application-level environment variable. Confirmed by grepping the entire `apps/` tree for direct Resend SDK/API usage: no hits outside build artifacts, so **no `RESEND_API_KEY` is required in Railway or Vercel** for this flow.
- **Why it matters**: this is what allows `Confirm email` to stay on in Supabase Auth without reverting to the 2/hour shared-mailer quota that caused the 2026-08-17 signup outage (see `08_CURRENT_STATUS.md`). Verified live: Supabase Authentication → Rate Limits shows 30 emails/hour (vs. the old 2/hour default), and a real signup → real Resend-delivered email → real click-through confirmation completed successfully.
- **Full incident/fix detail**: `14_CHANGELOG.md` v0.26.0.

---

### Troubleshooting: "Dashboard shows old data after deploy"

This is usually **not** a caching or Railway failure. Check in order:

1. **Workers logs** — did `startup:rss` show `inserted > 0`? If `inserted: 0, duplicates: N`, feeds had no new articles.
2. **Supabase** — compare `created_at` (ingestion) vs `event_date` (publish). UI shows `event_date`.
3. **Vercel env** — is `SUPABASE_SERVICE_ROLE_KEY` set? Without it, `/api/signals` may return empty for some sessions.
4. **Featured card logic** — `/alerts` hero picks `severity >= 8` first; new low-severity signals won't replace the hero card.
