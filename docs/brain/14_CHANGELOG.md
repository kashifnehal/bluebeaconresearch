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

