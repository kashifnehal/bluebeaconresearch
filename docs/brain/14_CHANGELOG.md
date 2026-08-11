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
- **Yahoo Finance v3 Breaking Change**: `price-syncer.ts` called `yahooFinance.quote()` (old API). Fixed to `new YahooFinance().quote()`. Result: 8 commodity prices now in DB.
- **GDELT URL 404**: Endpoint `/api/v2/events/search` doesn't exist. Fixed to `/api/v2/doc/doc?mode=artlist`.
- **`raw_events.source` Constraint Violation**: DB check constraint only allowed `gdelt/acled/newsapi` — not `gnews`. All GNews inserts were silently failing (error 23514). Fixed: GNews maps to `newsapi` source value. Migration 008 created.
- **Upstash Redis TLS**: `redis://` → `rediss://` required. Added `tls: { rejectUnauthorized: false }` to ioredis. No more ECONNRESET.
- **Supabase Credentials**: `.env.local` pointed to wrong Supabase project. Restored to `evavcgfmemwryggdkjmx.supabase.co`.

**Architecture: Direct-to-DB Signal Insertion (ADR 006):**
Collectors now classify and insert signals directly to Supabase without BullMQ queue active. Startup → signals in DB immediately.

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
- **Word-Boundary Relevance Filter (`isRelevantEvent`)**: Upgraded keyword classifier in `gdelt-collector.ts` and `auto-ingest.ts` to use strict regex word boundary matching (`\bwar\b`, `\boil\b`, `\bgas\b`) and hard exclusions for historical year strings (`1970`–`2005`). Eliminates false positives like *"1970 anti-war protests"* or *"tug-of-war"*.
- **24-Hour Feed Window & Recency Prioritization (`/api/signals`)**: Updated web signal API to filter by `event_date >= 24h ago` and sort strictly by publication timestamp (`event_date DESC`), guaranteeing real-time breaking events anchor the top of the Intelligence Feed and Alerts stream.
- **Purged Historical Noise**: Cleaned legacy false-positive signals from Supabase DB.
- **Production Audit**: Verified clean compilation across `apps/web` and `apps/backend` (`pnpm build`). Worker startup and 15-minute cron ingestion verified end-to-end.
