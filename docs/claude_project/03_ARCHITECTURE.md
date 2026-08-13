# 03_ARCHITECTURE.md — Technical Architecture

**Classification: Internal — CTO Level**

---

## 1. ARCHITECTURE OVERVIEW

BBR is a **Turborepo monorepo** with three applications and one shared package. The separation is:
- `apps/web` — Next.js 16 (user-facing web terminal)
- `apps/backend` — Fastify 4 Node.js (REST API + background workers)
- `apps/mobile` — Expo React Native (iOS + Android, partially built)
- `packages/shared` — TypeScript types, constants, utilities shared across all apps

The monorepo strategy allows one git push to deploy everything, shared types prevent API/frontend drift, and Turborepo's incremental builds only rebuild what changed.

---

## 2. FRONTEND — apps/web

**Framework:** Next.js 16 with App Router  
**Language:** TypeScript  
**Styling:** Tailwind CSS + CSS Variables (design tokens)  
**Components:** Shadcn/ui (Radix UI primitives, code lives in repo)  
**State management:** Zustand (global: auth, UI state, feed filters)  
**Data fetching:** TanStack Query v5 (useQuery, useMutation, refetchInterval)  
**Charts:** Recharts  
**Maps:** Mapbox GL JS 3.20  
**Real-time:** Server-Sent Events (SSE) for live signal feed  
**Auth:** @supabase/ssr (cookie-based, works with Next.js App Router)  
**Deployment:** Vercel  
**Domain:** bluebeaconresearch.com  

**Key architectural decisions:**
- App Router over Pages Router: Server Components for SEO-sensitive pages (/), Client Components for interactive dashboard
- SSE over WebSockets: simpler, works with Vercel serverless, no persistent connection needed
- Supabase SSR over client-side auth: eliminates auth flash, middleware can redirect unauthenticated users before page renders
- Tailwind CSS Variables: all colors as CSS variables enables dark/light theme toggle with single class change on html element

**File structure:**
```
apps/web/
├── app/
│   ├── (auth)/         # route group, no dashboard layout
│   │   ├── login/
│   │   ├── signup/
│   │   ├── verify/
│   │   └── forgot-password/
│   ├── (dashboard)/    # protected, uses dashboard layout
│   │   ├── layout.tsx  # sidebar + topbar + auth guard
│   │   ├── dashboard/
│   │   ├── map/
│   │   ├── alerts/
│   │   ├── watchlist/
│   │   ├── backtesting/
│   │   ├── settings/
│   │   └── events/[id]/
│   ├── auth/callback/  # OAuth redirect handler
│   ├── onboarding/
│   ├── status/         # needs build
│   ├── accuracy/       # needs build
│   ├── privacy/
│   ├── terms/
│   ├── page.tsx        # landing page (public)
│   ├── layout.tsx      # root layout (fonts, providers)
│   ├── globals.css     # all CSS variables
│   ├── sitemap.ts      # needs build
│   └── robots.ts       # needs build
├── components/
│   ├── ui/             # shadcn auto-generated
│   ├── signals/        # SignalCard, SeverityBadge, CommodityChip
│   ├── layout/         # Sidebar, TopBar, PriceTicker, MobileNav
│   ├── charts/         # PriceChart, BacktestScatterPlot
│   ├── landing/        # Hero, LiveSignalPreview, PricingTable, AccessLimitedModal
│   ├── ErrorBoundary.tsx  # needs build
│   └── EmptyState.tsx     # needs build
├── hooks/
│   ├── useSignalFeed.ts   # SSE connection + polling fallback
│   ├── usePrices.ts
│   └── useAlerts.ts
├── lib/
│   ├── supabase.ts         # browser client
│   ├── supabase-server.ts  # server client (RSC)
│   ├── flags.ts            # PROJECT_READY gate
│   └── central-bank-rates.json  # needs create
├── store/
│   ├── useAuthStore.ts
│   ├── useUIStore.ts    # alertSoundEnabled, sidebar state, modal state
│   └── useFeedStore.ts  # search query, filters
└── middleware.ts        # auth guard + route protection
```

**middleware.ts behavior:**
- Protected routes: /dashboard/*, /map, /alerts, /watchlist, /backtesting, /settings, /events/*
- Unauthenticated → redirect /login
- Plan checking (deferred until Stripe live): /api-console requires 'api' plan

**SSE implementation:**
- Client: useSignalFeed hook opens EventSource to /api/events/stream
- Server: apps/web/app/api/events/stream/route.ts
- Polls Supabase every 60 seconds (changed from 15s to avoid DB overload at scale)
- Max connection duration: 5 minutes, then client reconnects (auto-reconnect with exponential backoff)
- Free tier: polls every 300 seconds
- Sends new signals as data: JSON
- Heartbeat: `: ping\n\n` every 30 seconds to prevent proxy timeout

**Error boundaries (needs build):**
- apps/web/app/error.tsx — global fallback ("Terminal Telemetry Offline")
- apps/web/app/(dashboard)/error.tsx — dashboard-specific
- apps/web/app/(dashboard)/loading.tsx — loading state during RSC fetch

---

## 3. BACKEND — apps/backend

**Framework:** Fastify 4  
**Language:** TypeScript  
**Runtime:** Node.js 20  
**Queue:** BullMQ  
**Scheduling:** node-cron  
**Database client:** @supabase/supabase-js (service role key — bypasses RLS)  
**Redis client:** ioredis (via BullMQ) + Upstash REST client  
**AI:** @anthropic-ai/sdk (Claude 3.5)  
**Deployment:** Railway.app  
**Domain:** api.bluebeaconresearch.com → Port 8888  

**TWO separate processes in apps/backend:**
```
start:server  → node dist/server.js   (Fastify HTTP API, public-facing)
start:workers → node dist/workers.js  (BullMQ workers + cron collectors, no public port)
```

**CRITICAL:** Both must be running as separate Railway services. Currently only the server process is configured in Railway (and even that is offline — service has never deployed successfully due to missing Root Directory setting).

**Fastify app registration order:**
1. @fastify/helmet (security headers)
2. @fastify/cors (allow bluebeaconresearch.com + localhost:3000)
3. @fastify/rate-limit (100 req/min global, stricter on sensitive endpoints)
4. @fastify/swagger (OpenAPI docs at /docs)
5. auth middleware (JWT + x-api-key)
6. plan-guard middleware (plan tier enforcement)
7. Route registrations

**Route registrations:**
```
/health                    → health check (no auth, not rate-limited)
/v1/signals                → signals routes
/v1/events                 → individual event routes
/v1/prices                 → commodity prices
/v1/alerts                 → alert rules CRUD
/v1/webhooks               → webhook endpoint management
/v1/backtesting            → backtest runner
/v1/api-keys               → API key management
/v1/telegram               → Telegram bot webhook + connect code
/v1/users/push-token       → mobile push token registration
/v1/health/pipeline        → pipeline health status (needs build)
/docs                      → Swagger UI
```

**Backend folder structure:**
```
apps/backend/src/
├── server.ts           # Fastify app entry point
├── workers.ts          # Worker/cron entry point
├── app.ts              # Fastify factory
├── env.ts              # Zod env schema validation
├── routes/
│   ├── signals.ts
│   ├── events.ts
│   ├── prices.ts
│   ├── alerts.ts
│   ├── webhooks.ts
│   ├── backtesting.ts  # currently returns mockResult()
│   ├── api-keys.ts
│   ├── telegram.ts
│   └── pipeline-health.ts  # needs build
├── workers/
│   ├── gdelt-collector.ts       # every 15 min
│   ├── acled-collector.ts       # every 30 min
│   ├── gnews-collector.ts       # every 30 min
│   ├── guardian-collector.ts    # every 30 min — needs build
│   ├── ai-classifier.ts         # BullMQ consumer
│   ├── signal-generator.ts      # BullMQ consumer
│   ├── alert-dispatcher.ts      # BullMQ consumer
│   ├── price-syncer.ts          # every 15 min — needs Yahoo Finance replacement
│   ├── sanctions-syncer.ts      # daily 04:00 UTC
│   ├── morning-brief.ts         # weekdays 07:45 UTC — needs build
│   ├── outcome-tracker.ts       # daily 03:00 UTC — needs build
│   └── calendar-collector.ts   # daily 00:00 UTC — needs build
├── services/
│   ├── claude.service.ts
│   ├── gdelt.service.ts
│   ├── acled.service.ts
│   ├── gnews.service.ts
│   ├── telegram.service.ts
│   ├── resend.service.ts        # email (currently stubbed)
│   └── expo-push.service.ts
├── middleware/
│   ├── auth.middleware.ts       # JWT + API key verification
│   ├── rate-limit.middleware.ts
│   └── plan-guard.middleware.ts
├── queues/
│   └── queues.ts               # BullMQ queue definitions
└── types/
    └── fastify.d.ts            # request.user augmentation
```

---

## 4. WORKERS (DATA PIPELINE)

Four BullMQ workers consuming from four queues:

**Queue: ai-classification**
- Producer: GDELT/ACLED/GNews collectors (after relevance filter)
- Consumer: ai-classifier.ts (concurrency: 5)
- Job data: { rawEventId, priority }
- Priority: based on Goldstein scale (higher = more urgent)

**Queue: signal-generation**
- Producer: ai-classifier.ts (only for severity ≥ 7 events)
- Consumer: signal-generator.ts (concurrency: 2 — Sonnet is expensive)
- Job data: { signalId }

**Queue: alert-dispatcher**
- Producer: signal-generator.ts (after signal inserted)
- Consumer: alert-dispatcher.ts (concurrency: 10)
- Job data: { signalId }

**Queue: price-sync**
- Triggered: cron every 15 minutes
- Consumer: price-syncer.ts

**Cron schedules:**
```
*/15 * * * *    gdelt-collector (every 15 min)
*/30 * * * *    acled-collector (every 30 min)
*/30 * * * *    gnews-collector (every 30 min)
*/30 * * * *    guardian-collector (every 30 min, needs build)
*/15 * * * *    price-syncer (every 15 min)
0 4 * * *       sanctions-syncer (04:00 UTC daily)
45 7 * * 1-5    morning-brief (07:45 UTC weekdays, needs build)
0 3 * * *       outcome-tracker (03:00 UTC daily, needs build)
0 0 * * *       calendar-collector (midnight UTC daily, needs build)
```

---

## 5. CACHING STRATEGY

**Redis (Upstash) cache keys and TTLs:**
```
prices:[symbol]                TTL: 900s (15 min)   — commodity prices
news:[md5(query)]              TTL: 3600s (1 hr)    — NewsAPI results for same query
backtest:[hash(params)]        TTL: 86400s (24 hr)  — backtest results
telegram:connect:[code]        TTL: 600s (10 min)   — Telegram connect codes
signal:latest                  TTL: 60s              — most recent signal for landing page
session:[userId]               TTL: 3600s            — user session cache
```

**Supabase as primary storage** (not a cache):
- All signals, raw_events, alerts, users permanent
- commodity_prices table: keep last 30 days, purge older

**Frontend caching:**
- TanStack Query refetchInterval: 60000 (60s) for prices
- TanStack Query staleTime: 30000 (30s) for signals
- SSE provides real-time updates, query cache provides persistence on reconnect

---

## 6. AUTHENTICATION & AUTHORIZATION

**Auth provider:** Supabase Auth  
**Session method:** Cookie-based (JWT stored in secure httpOnly cookie via @supabase/ssr)  
**Providers:** Email/password ✓ | Google OAuth ✓ (code built, needs Google Cloud config) | GitHub OAuth (deferred)

**JWT flow:**
1. User logs in → Supabase issues access_token + refresh_token
2. Stored in httpOnly cookies (cannot be accessed by JS)
3. middleware.ts reads cookies on every server request
4. If no valid session → redirect to /login
5. Access token expires every hour, refresh token auto-refreshes

**API key auth (backend):**
1. User creates key in /settings → generates raw key bb_live_[32 hex bytes]
2. Only SHA-256 hash stored in api_keys table — raw key shown ONCE
3. API request: x-api-key: bb_live_... header
4. Backend: hash incoming key, compare to stored hashes, get user_id
5. Increment api_keys.call_count

**Authorization levels:**
- Public: / (landing), /login, /signup, /verify, /status, /accuracy, /v1/health
- Authenticated (any plan): /dashboard, /map, /alerts, /watchlist, /settings, /events/*
- Analyst+ plan: real-time feed (free tier gets 4-hour delay)
- Pro+ plan: backtesting with real data, CSV export, multi-seat
- API tier: /api-console, API key management, webhook delivery, bb_live_ keys

**Supabase RLS:**
- profiles: user can only read/update own row
- user_preferences: user can only read/update own row
- alert_rules: user can only CRUD own rules
- alerts_sent: user can only read own alerts
- watchlist_entries: user can only CRUD own entries
- saved_signals: user can only CRUD own saved signals
- api_keys: user can only CRUD own keys
- signals: all authenticated users can read (no private signals)
- commodity_prices: all authenticated users can read
- economic_events: all authenticated users can read (when built)

**Service role key:**
- Used ONLY in apps/backend (never in apps/web client components)
- Bypasses all RLS
- Allows workers to INSERT signals, UPDATE profiles, etc.

---

## 7. DEPLOYMENT INFRASTRUCTURE

**Production environment:**

| Service | Provider | Domain/URL | Cost |
|---------|----------|------------|------|
| Web app | Vercel | bluebeaconresearch.com | Free/Pro $20/mo |
| Backend API | Railway | api.bluebeaconresearch.com:8888 | ~$5-10/mo |
| Backend Workers | Railway (separate service) | No public URL | ~$5-10/mo |
| Database | Supabase | xxx.supabase.co | Free/Pro $25/mo |
| Redis/Queue | Upstash | xxx.upstash.io | Free/$10/mo |
| File storage | Cloudflare R2 (planned) | — | ~$0/mo |
| CDN/Security | Cloudflare (planned) | DNS proxy | Free |
| Error monitoring | Sentry | — | Free 5K errors/mo |
| Analytics | PostHog | — | Free 1M events/mo |

**Railway setup (current state — needs fix):**
- Project: powerful-strength
- Environment: production
- Service 1 (backend API): 
  - Status: OFFLINE — never successfully deployed
  - Reason: Root Directory not set, start command not set
  - Fix: Set Root Directory = apps/backend, Start Command = pnpm run start:server, PORT=8888
- Service 2 (workers): Does not exist yet — needs creation with Start Command = pnpm run start:workers
- Free plan credits: $1.00 remaining — NEEDS BILLING IMMEDIATELY

**Railway required env vars (backend service):**
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
ALPHA_VANTAGE_API_KEY=xxx  (replace with Yahoo Finance — no key needed)
NEWS_API_KEY=xxx
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxx...
REDIS_URL=redis://xxx (Railway internal Redis or Upstash)
TELEGRAM_BOT_TOKEN=1234:ABCdef...
GNEWS_API_KEY=xxx
PORT=8888
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://bluebeaconresearch.com
```

**Vercel env vars (web service):**
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... (anon key, safe for browser)
SUPABASE_SERVICE_ROLE_KEY=eyJ... (for Next.js API routes only)
NEXT_PUBLIC_APP_URL=https://bluebeaconresearch.com
API_URL=https://api.bluebeaconresearch.com
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ...
NEXT_PUBLIC_PROJECT_READY=true  (set to false to show waitlist modal)
```

**Vercel deployment:**
- Framework: Next.js (auto-detected)
- Root directory: apps/web
- Build command: pnpm run build
- Auto-deploy on push to main branch

---

## 8. MONOREPO STRATEGY

**Tool:** Turborepo v2.8.18  
**Package manager:** pnpm workspaces  

**turbo.json pipeline:**
```json
{
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "test": {},
    "type-check": { "dependsOn": ["^build"] }
  }
}
```

**Why monorepo:**
- Single git push, unified CI/CD
- Shared TypeScript types between web, backend, mobile — no API drift
- Shared constants (COMMODITIES, REGIONS, SEVERITY_CONFIG, CHOKEPOINTS)
- Turborepo only rebuilds changed packages

**packages/shared exports:**
```typescript
// Types
Signal, RawEvent, CommodityImpact, AlertRule, UserProfile
Direction, PlanTier, Region, EventCategory

// Constants
COMMODITIES, REGIONS, SEVERITY_CONFIG, CHOKEPOINTS

// Utils
formatPrice(), severityLabel(), haversineKm()
```

---

## 9. SCALING CONSIDERATIONS

**Current scale:** Single instances of API + workers. Sufficient for 0-5K users.

**10K users:**
- SSE: Changed from 15s to 60s polling. Max 5 min connection duration. Reduces Supabase queries from 10K/15min to 10K/60min.
- Supabase: Upgrade to Pro ($25/mo). Connection pooler enabled.
- Railway: Monitor memory usage. Workers likely need more CPU for AI classification volume.

**50K users:**
- SSE: Switch from DB polling to Redis pub/sub fan-out. signal-generator publishes to Redis 'new_signal' channel. SSE route subscribes. O(1) DB operations regardless of user count.
- Claude AI cost: At 500 events/day × 50K users triggering alerts = significant cost. Implement Claude token budget and rate limiting per user.
- Supabase: Consider read replicas for signal queries.
- Railway: Horizontal scaling (multiple API instances behind Railway load balancer).

**100K users:**
- Consider dedicated infrastructure (AWS ECS or similar) for workers
- CDN for signal data (CloudFront or Cloudflare Workers)
- Database sharding strategy for signals table (partition by created_at month)
