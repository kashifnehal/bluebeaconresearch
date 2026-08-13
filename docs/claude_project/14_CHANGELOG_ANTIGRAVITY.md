# 14_CHANGELOG.md — System Evolution & Major Milestones

This document records historic development milestones, schema evolutions, feature additions, and architectural refactoring for Blue Beacon Research.

---

## Milestone Evolution & Historical Log

### v0.1.0 — Monorepo Architecture & Ingestion Setup

- Initialized Turborepo monorepo with `pnpm` workspaces (`apps/web`, `apps/backend`, `apps/mobile`, `packages/shared`).
- Configured core Supabase PostgreSQL schema (`production_schema.sql`) and `000_init_schema.sql` migration.
- Built GDELT, ACLED, and GNews collector workers with 15-minute cron triggers (`node-cron`).

### v0.2.0 — Anthropic Claude 3.5 AI Engine & BullMQ Queues

- Integrated Anthropic `@anthropic-ai/sdk` for Claude 3.5 Sonnet / Haiku signal synthesis.
- Set up BullMQ queues (`ai-classification`, `alert-dispatch`) backed by Upstash Redis.
- Implemented quantitative asset impact mapping (`commodity_impacts` JSONB) for physical commodities (`USOIL`, `GOLD`, `NG`, `COPPER`).

### v0.3.0 — Next.js 16 Web Terminal & Gating Middleware

- Implemented Next.js 16 dark glassmorphic terminal interface (`apps/web`).
- Added Mapbox GL JS interactive conflict heatmap (`/map`).
- Configured project readiness feature flag (`isProjectReady`) and gating middleware (`middleware.ts`) with early access waitlist modal (`AccessLimitedModal.tsx`).

### v0.4.0 — Multi-Channel Alert Router & Institutional Tools

- Built multi-channel alert dispatch engine supporting Telegram, Slack Webhooks, Custom HTTP Webhooks, and Expo Push Notifications.
- Implemented Strategy Backtesting engine (`/backtesting`), Asset Watchlist (`/watchlist`), and Developer API Key manager (`/settings`).
- Created 15-document complete architecture knowledge base in `docs/brain/`.

### v0.5.0 — Railway Multi-Service Deployment & Auth/WebSocket Resilience

- Split production infrastructure into two Railway microservices: `backend` (Fastify HTTP API) and `workers` (BullMQ + `node-cron` background collectors).
- Installed `ws` dependency and polyfilled `globalThis.WebSocket` in Supabase client (`supabase.ts`) to fix Node 20 runtime errors.
- Enhanced `getEnv()` with fallback alias resolution for `GNEWS_API_KEY`, `ACLED_API_EMAIL`, and `NEXT_PUBLIC_SUPABASE_URL`.
- Hardened Next.js SSR authentication flow in `login/page.tsx` using `window.location.href` to ensure cookie propagation to middleware.

### v0.6.0 — Yahoo Finance Market Data, 3-Tier Price Fallback & Signal Quality Hardening

- Replaced Alpha Vantage (25 req/day limit) with `yahoo-finance2` library for unlimited real-time commodity futures pricing (`CL=F`, `BZ=F`, `GC=F`, `NG=F`, `ZW=F`, `HG=F`, `SI=F`, `ZC=F`).
- Implemented 3-tier price resolution chain in `/api/prices` route: Supabase DB → Upstash Redis cache → Static hardcoded fallback (zero null responses guaranteed).
- Added `railway.json` and `railway.workers.json` declarative config files for Railway microservice builder.
- Confirmed Prompt 1 signal quality features fully operational: keyword pre-filter (`isRelevantEvent`), ISO-2 country code mapping, Claude confidence calibration, and duplicate signal deduplication.

### v0.7.0 — Skeleton Loaders, No Mock Data Policy & Complete Interactive UI Polish

- Eliminated all static mock/fallback data across dashboard, alerts, and map components.
- Added continuous skeleton loading states (`Skeleton`) across all dashboard feeds, tables, and detail pages on API loading/error.
- Implemented debounced search bar in `TopBar` with Zustand `useUIStore` state filtering live signals client-side by title, country, or event type.
- Built slide-in `NotificationPanel` drawer (`/api/alerts/recent`) with unread count tracking and red alert indicator on TopBar bell icon.
- Built centered `HelpModal` knowledge base guide for 5 core terminal modules.
- Created TopBar avatar dropdown menu with user profile details, Settings/Alerts links, and Supabase sign-out.
- Renamed "Deploy Countermeasures" button to "Set Alert for This Signal" with green accent styling and interactive threshold modal trigger.
- Fixed all landing page footer links (Terminal, Global Map, Signals, Research, Documentation, Compliance, Auth, Encrypted Support).
- Created `/status` static System Status page displaying 4 sub-system operational statuses and real-time timestamp.
- Made all signal rows in dashboard stream, alerts bento grid, and map live stream clickable, navigating directly to `/events/[id]`.

### v0.8.0 — Google OAuth 2.0 Integration & Auth Trigger Hardening

- Enabled Google OAuth authentication flow across `login/page.tsx` and `signup/page.tsx`.
- Updated `redirectTo` to dynamically resolve `window.location.origin` for clean callback handling across `http://localhost:3000` and `https://bluebeaconresearch.com`.
- Updated database trigger `handle_new_user()` in `004_auth_triggers.sql` with `coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')` to capture Google user names into `public.profiles`.
- Verified `/auth/callback/route.ts` PKCE code exchange, onboarding state checks, and middleware permissions.

---

### v0.9.0 — Full API Audit, Pipeline Bug Fixes & Live Data Restoration

**Root causes of zero signal data identified and fixed:**

- **Anthropic Credits Exhausted**: `claude.service.ts` had no try/catch — API failures crashed the entire worker. Fixed: wrapped in try/catch + added keyword heuristic fallback classifier (runs in-process, zero API cost).
- **Heuristic commodity impact hardening**: tightened fallback logic to only emit defensible asset impacts, removed the synthetic `USOIL` volatile fallback, and added allowed-asset validation to preserve signal integrity.
- **Yahoo Finance v3 Breaking Change**: `price-syncer.ts` called `yahooFinance.quote()` (old API). Fixed to `new YahooFinance().quote()`. Result: 8 commodity prices now in DB.
- **`raw_events.source` Constraint Violation**: DB check constraint only allowed `gdelt/acled/newsapi` — not `gnews`. All GNews inserts were silently failing (error 23514). Fixed: GNews maps to `newsapi` source value. Migration 008 created.
- **Upstash Redis TLS**: `redis://` → `rediss://` required. Added `tls: { rejectUnauthorized: false }` to ioredis. No more ECONNRESET.
- **Supabase Credentials**: `.env.local` pointed to wrong Supabase project. Restored to `evavcgfmemwryggdkjmx.supabase.co`.

**Architecture: Direct-to-DB Signal Insertion (ADR 006):**
Collectors now classify and insert signals directly to Supabase without BullMQ queue active. Startup → signals in DB immediately.

- Fixed backend `/v1/signals` lifecycle query semantics so the default feed preserves recent published signals (`event_date >= 24h`) while keeping ongoing `is_active=true` events visible.
- Removed synthetic auto-ingest fallback commodity assignment in `apps/web/lib/auto-ingest.ts`; inline ingestion now only emits commodity impacts when the headline contains explicit market/commodity evidence.

**Result**: 8 real signals + 8 commodity prices in production DB. Pipeline operational end-to-end.

---

### v0.10.0 — CEO Data Strategy: Freshness, Confidence & Event-Date Display

**Context**: Platform showed data "2 hours ago" even on refresh. All confidence scores were identical (82%). Both undermined product credibility.

**Decision: What data to show and how fresh** (2026-08-10)

**Fix 1 — Timestamp accuracy:**

- UI was showing `createdAt` (ingestion time), not when the article was published.
- Added `eventDate?: string` to `Signal` type. `/api/signals` batch-joins `raw_events.event_date` and returns article publish time. Dashboard, map, and events/[id] all now use `eventDate ?? createdAt`.
- Migration 009 (`009_signals_event_date.sql`) created — **apply via Supabase SQL Editor** to formally add column to signals table.

**Fix 2 — Confidence variance:**

- Heuristic classifier was hardcoding `confidence: 0.82` for every signal.
- Now dynamically scored: 5 signal quality categories × 7% each. Range: 55%–90%.
- Existing 8 signals backfilled: 69%, 76%, 83%, 90%.

**Fix 3 — Data volume and freshness:**

- GNews queries expanded from 1 to 3 topic searches per run (conflict/war, sanctions/energy, geopolitics/Iran/Russia/China).
- Workers now run collectors **immediately on startup** — no 15-min wait after Railway deploy.
- `/api/signals` filters to last 7 days only — no stale accumulation.
- Removed hardcoded `FALLBACK_PRICES` — prices API returns empty array if no real data (UI shows skeleton per "no mock data" policy).

---

### v0.11.0 — CTO System Audit & UI Interactivity Enforcement

**Audit & UI Controls Verification:**

- **Fixed SSR `window` Crash**: Resolved `window is not defined` error on refresh/back-navigation in `/login` and `/signup` pages. Routed client navigation through Next.js `router.replace()` and encapsulated `window.location.origin` in a post-mount `useEffect`.
- **Timestamp Standardization**: Verified and updated `alerts/page.tsx`, `events/[id]/page.tsx`, `dashboard/page.tsx`, and `map/page.tsx` to uniformly display `eventDate ?? createdAt` (article publish timestamp).
- **Interactive Control Wiring**:
  - Connected "Force Refresh" button in `WatchlistClient.tsx` to refetch live commodity price queries.
  - Wired Floating Action Button (`+`) on `/watchlist` to smoothly scroll to top and focus the commodity selector.
  - Built direct CSV export handler into "Download Audit Log" button on `/backtesting` page (`backtest_audit_<symbol>_<horizon>.csv`).
  - Confirmed all cards and signal table rows navigate seamlessly to `/events/[id]`.
- **Migration 009 Applied**: Successfully applied `009_signals_event_date.sql` to Supabase DB. `event_date` column now populated and indexed across all signal rows.

---

### v0.12.0 — Real-Time RSS Ingestion, Word-Boundary Precision & Production Audit

**Real-Time Data Pipeline Upgrade:**

- **RSS Collector Added (`apps/backend/src/workers/rss-collector.ts`)**: Integrated live RSS ingestion from Reuters, BBC World, Al Jazeera, and The Guardian. Delivers sub-hour breaking news (<1h fresh) directly into `raw_events` and `signals`, solving GNews free tier's 12-hour caching lag.
- **Word-Boundary Relevance Filter (`isRelevantEvent`)**: Upgraded keyword classifier in `gdelt-collector.ts` and `auto-ingest.ts` to use strict regex word boundary matching (`\bwar\b`, `\boil\b`, `\bgas\b`) and hard exclusions for historical year strings (`1970`–`2005`). Eliminates false positives like _"1970 anti-war protests"_ or _"tug-of-war"_.
- **Signal lifecycle feed improvement (`/api/signals`)**: Default dashboard query now returns fresh `event_date >= 24h` signals plus ongoing `is_active=true` events. Explicit `window=latest|24h|7d|active` query filters are now supported.
- **Map UX improvement**: `/map` now renders real geolocated `lat`/`lng` signal markers from `/api/signals`, with popups and event click navigation to `/events/[id]`.
- **Purged Historical Noise**: Cleaned legacy false-positive signals from Supabase DB.
- **Production & Railway Deployment Audit**:
  - **Nixpacks Lockfile Fix**: Configured `NIXPACKS_NO_FROZEN_LOCKFILE=1` in `nixpacks.toml` to prevent `ERR_PNPM_OUTDATED_LOCKFILE` during Railway CI container builds.
  - **Combined Entrypoint (`src/index.ts`)**: Updated default entrypoint to import both `server.js` and `workers.js` to ensure background workers launch reliably under default `pnpm start` execution.
  - **Railway Service Configuration Matrix**: Documented required start commands (`pnpm run start:workers` vs `pnpm run start:server`) and healthcheck rules in `12_DEPLOYMENT.md`.
  - **Clean Builds**: Verified zero TypeScript or ESLint errors across `apps/web` and `apps/backend`.

---

### v0.13.0 — Railway Workers Reliability, Collector Hardening & Timestamp UX Clarification

**Context**: Dashboard appeared "stuck" showing data from hours ago despite Railway deploys. Root cause analysis proved the pipeline was partially working but misunderstood.

**Railway Workers Infrastructure Fix:**

- **`railway.workers.json`**: Added `"sleepApplication": false`, `/health` healthcheck, `numReplicas: 1`, and restart policy. Prevents Serverless sleep mode from killing 15-minute `node-cron` schedulers.
- **`scripts/railway-start.sh`**: Smart start script reads `RAILWAY_SERVICE_NAME` to launch `start:workers` vs `start:server` when both services share `/apps/backend`.
- **`workers.ts`**: Workers now listen on `PORT` and expose `/health` for Railway healthchecks. Added `workers:heartbeat` log every 5 min to verify container stays alive. Fixed Pino log key (`result` not `res` — `res` is reserved and serialized as `{}`).
- **`ingest-once.ts`**: One-shot collector script for manual/cron triggers (`pnpm run ingest:once`).
- **`package.json`**: Added no-op `migrate` script so Railway pre-deploy `npm run migrate` does not fail.

**Collector Hardening:**

- **RSS**: Expanded feeds (NPR World, UN News), extended article window 4h → 12h, fixed broken Reuters URL (old `feeds.reuters.com` DNS fails on Railway).
- **GNews**: Reduced to 1 query per run (free tier ~96 req/day; 3 queries × every 15 min exceeded daily quota).
- **GDELT**: Added 30s retry on HTTP 429 rate limit.
- **ACLED**: Missing credentials now logged as skip, not crash-level error.

**Web API (`/api/signals`):**

- Added `force-dynamic` + `revalidate = 0` — no Next.js route caching on refresh.
- Requires authenticated session; prefers `SUPABASE_SERVICE_ROLE_KEY` on Vercel for reliable server-side reads.

**Critical UX Finding — Why Timestamps Look "Old":**

- UI displays **`eventDate`** (when the source article was **published**), NOT **`createdAt`** (when we **ingested** it).
- Example from production DB (2026-08-11): signal ingested **6 min ago** can correctly display **"12 hours ago"** if the BBC/Reuters article was published 12 hours earlier.
- Featured cards on `/alerts` prioritize **`severity >= 8`**, so newly ingested low-severity signals (e.g. severity 5) may not appear as the hero card even though they are in the database.
- **Refresh works correctly** — it re-fetches Supabase every 30s. When collectors report `inserted: 0, duplicates: N`, the dashboard correctly shows the same rows.

**Verified Production Log Pattern (healthy workers):**

```
startup:ingestion complete → collectors.rss.inserted: N
ingestion-cycle complete → every 15 min
workers:heartbeat → every 5 min
```

---

### v0.14.0 — Expanded Market Coverage, Ingestion Banner & Pipeline Documentation

**Product request:** Show last-fetched time in UI; reduce over-filtering of finance/market news; fix Reuters feed; document full ingestion logic.

**Relevance filter refactor (`lib/relevance-filter.ts`):**

- Extracted shared filter from `gdelt-collector.ts`.
- Added 50+ **market/finance keywords** (stocks, futures, earnings, fed, inflation, crypto, mergers, etc.).
- Two-tier RSS filtering: `finance` feeds (BBC Business, MarketWatch, WSJ Markets…) pass with hard-exclude only; `world` feeds require keyword match.

**RSS collector expansion:**

- Removed broken Reuters URLs (401/404 from server environments).
- Added: BBC Business, Guardian Business, NYT Business, MarketWatch, WSJ Markets, Investing.com.
- Article window set to **4 hours** (product requirement).

**GNews + GDELT queries expanded** to include market/finance terms.

**Ingestion status banner (`IngestionStatusBanner.tsx`):**

- Shows last fetched time, next run estimate, last run signal count.
- API: `/api/ingestion/status` reads Redis `pipeline:last_run` (fallback: Supabase `max(raw_events.created_at)`).
- Workers write pipeline status after each ingestion cycle.

**Documentation:** `docs/brain/15_INGESTION_PIPELINE.md` — full source-by-source logic, filters, display rules, and troubleshooting.
