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

