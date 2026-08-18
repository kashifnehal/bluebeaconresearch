# 10_DECISIONS.md — Architectural & Product Decision Log

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

**Classification: Internal — CTO Level**
**Format: Decision → Context → Options considered → Choice → Rationale → Trade-offs**

---

## D1: Monorepo vs Polyrepo

**Decision:** Turborepo monorepo (pnpm workspaces)

**Context:** Three apps needed: web (Next.js), backend (Fastify), mobile (Expo). Common types and constants shared between all three.

**Options considered:**
- A) Separate git repos for each app
- B) Monorepo with Lerna
- C) Monorepo with Turborepo + pnpm
- D) Monorepo with Nx

**Choice:** C — Turborepo + pnpm

**Rationale:**
- Shared TypeScript types prevent API/frontend contract drift (biggest risk in a 3-app system)
- Single git push deploys everything
- Turborepo incremental builds: only rebuilds what changed — fast CI
- pnpm workspaces: efficient package deduplication
- Turborepo has better DX than Nx for this project size
- Lerna is mostly deprecated in favor of Turborepo

**Trade-offs:**
- Single large repo can be slower to clone
- Railway needs Root Directory setting (this was missed and caused the backend to never deploy)
- All env vars must be configured per-app even in monorepo

---

## D2: Frontend Framework

**Decision:** Next.js 16 with App Router

**Context:** Need SSR for landing page SEO, client-side interactivity for dashboard, server-side auth for security.

**Options considered:**
- A) Next.js with Pages Router (older pattern)
- B) Next.js with App Router (React 18 server components)
- C) Remix
- D) SvelteKit
- E) Pure React SPA (Vite)

**Choice:** B — Next.js App Router

**Rationale:**
- Server Components for landing page SEO (signal preview rendered server-side)
- Cookie-based auth via @supabase/ssr works perfectly with App Router middleware
- Route groups allow shared layouts without shared auth: (auth) group vs (dashboard) group
- Vercel deployment is trivially simple for Next.js
- App Router's loading.tsx and error.tsx are exactly what's needed for dashboard UX
- The market standard — easier to hire for

**Trade-offs:**
- App Router is newer; more gotchas around client/server boundaries
- "use client" discipline required — easy to accidentally put server code in client component
- Slightly more complex than Pages Router for newcomers

---

## D3: Backend Framework

**Decision:** Fastify 4 over Express

**Context:** Need a Node.js HTTP server for the API. Workers also live in the same codebase.

**Options considered:**
- A) Express.js (most common)
- B) Fastify (high performance)
- C) Hono (ultra-lightweight)
- D) NestJS (opinionated, full-featured)
- E) Elysia (Bun runtime)

**Choice:** B — Fastify

**Rationale:**
- 2–3× faster than Express for JSON serialization (important for signal feed endpoint)
- Built-in schema validation via JSON Schema (reduces boilerplate)
- @fastify/swagger for auto-generated OpenAPI docs at /docs
- @fastify/rate-limit is mature and Redis-backed
- Plugin architecture is clean and testable
- No need for NestJS complexity at this stage

**Trade-offs:**
- Less community knowledge than Express (harder to find Stack Overflow answers)
- Plugin ecosystem smaller than Express
- Schema validation is verbose but necessary

---

## D4: Database

**Decision:** Supabase (PostgreSQL 15 + PostGIS)

**Context:** Need a relational database with real-time capabilities, auth, and low operational overhead.

**Options considered:**
- A) Supabase (hosted Postgres + Auth + RLS + PostGIS)
- B) PlanetScale (MySQL, serverless)
- C) Neon (serverless Postgres)
- D) MongoDB Atlas (document database)
- E) Self-hosted Postgres on Railway

**Choice:** A — Supabase

**Rationale:**
- PostGIS extension: chokepoint proximity calculation (Haversine distance) requires geospatial queries
- Built-in Auth: no need to build auth from scratch — Supabase handles JWT, OAuth, email verification, password reset
- RLS policies: row-level security means no accidental data leaks between users
- Real-time subscriptions: SSE alternative would be Supabase Realtime (not used, but available)
- Free tier is generous for development
- Supabase dashboard is excellent for SQL migrations and data inspection
- @supabase/ssr works perfectly with Next.js App Router

**Trade-offs:**
- Vendor lock-in to Supabase ecosystem
- Free tier limitations (500MB database, 2GB bandwidth) — upgrade to Pro at scale
- RLS adds query complexity in some cases

---

## D5: Queue System

**Decision:** BullMQ + Upstash Redis

**Context:** The AI classification pipeline needs async job processing. GDELT delivers events faster than Claude can process them synchronously.

**Options considered:**
- A) BullMQ with Railway Redis (self-managed)
- B) BullMQ with Upstash Redis (managed, REST API)
- C) pg-boss (Postgres-based queue — already have Supabase)
- D) Inngest (managed event system)
- E) Simple cron with Supabase polling (no queue)

**Choice:** B — BullMQ + Upstash Redis

**Rationale:**
- BullMQ is the most mature Node.js queue library with concurrency, retry, priority
- Upstash Redis: serverless Redis compatible with BullMQ, free tier, no server to manage
- Decouples collection from classification — GDELT runs every 15 min, AI classification can process at its own rate
- Priority queuing: severity 10 events jump the queue and get classified first
- Retry logic: if Claude fails or rate-limits, job retries automatically
- Dead letter queue: failed jobs visible for debugging

**Why not pg-boss:**
- Postgres-based queues add load to the database during high-volume event ingestion
- BullMQ's monitoring (Bull Dashboard) is better

**Why not Inngest:**
- Additional vendor dependency
- BullMQ is sufficient for current scale

**Trade-offs:**
- Redis is an additional service to manage/pay for
- Upstash free tier has 10K commands/day limit — may need upgrade at scale

---

## D6: AI Model Selection

**Decision:** Anthropic Claude 3.5 (Haiku for classification, Sonnet for analysis)

**Context:** Need AI for: (1) classifying events into structured JSON (severity, commodity impacts, confidence), and (2) generating full intelligence briefings (5-8 paragraph analysis).

**Options considered:**
- A) Claude 3.5 Haiku + Claude 3.5 Sonnet (Anthropic)
- B) Gemini Flash-Lite + Gemini Flash (Google — free tiers)
- C) Groq Llama 3.3 70B (ultra-fast inference, generous free tier)
- D) GPT-4o mini + GPT-4o (OpenAI)
- E) Hybrid: Gemini Flash-Lite for classification, Claude Sonnet for briefings

**Choice:** A — Claude 3.5 (current production)

**Alternatives discussed for cost reduction:**
- Gemini Flash-Lite: 1,000 req/day free → classification only
- Groq Llama 3.3 70B: 14,400 req/day free → fallback
- Target: $0 AI cost using Gemini + Groq

**Current production:** Uses Claude 3.5 Haiku (classification) + Claude 3.5 Sonnet (briefings). Cost not monitored. Estimated $15-30/month at current low volume, but risks $400/month without pre-filter at scale.
> ⚠️ UPDATED 2026-08-19 — this decision (Claude as the model choice) still stands, but "current production" is no longer accurate as written: Anthropic API credit has been exhausted for some time, so a heuristic keyword-based fallback classifier is what's actually running in production today, not live Claude calls. Signals still generate; they lack Claude's classification/briefing quality until credit is restored.

**Rationale for Claude:**
- Best-in-class instruction following for structured JSON output
- Claude 3.5 Sonnet produces the most coherent intelligence briefing prose
- Anthropic's API is reliable with good rate limits
- The geopolitical analysis quality is noticeably better than GPT-4o mini or Groq

**Why Gemini/Groq are valid alternatives:**
- Gemini Flash-Lite is free for 1,000 req/day — sufficient for classification at current volume
- Groq is the fastest inference available (sub-100ms) — good for real-time feel
- Cost is $0 on free tiers vs ~$30/month for Claude

**Decision pending:** Switch classification to Gemini Flash-Lite, keep Sonnet only for severity≥7 full briefings. Implement daily spend cap.

**Trade-offs:**
- Claude is more expensive but produces better output quality
- Gemini/Groq free tiers have daily limits that could be exhausted during major events
- OpenAI was rejected: no meaningful quality advantage over Claude for this use case at higher cost

---

## D7: Real-time Delivery Method (SSE vs WebSocket)

**Decision:** Server-Sent Events (SSE)

**Context:** Dashboard needs live signal updates without polling.

**Options considered:**
- A) WebSockets (bidirectional)
- B) Server-Sent Events (unidirectional server→client)
- C) Polling (client requests every N seconds)
- D) Supabase Realtime subscriptions

**Choice:** B — SSE

**Rationale:**
- Unidirectional: server pushes signals to clients — no client→server messages needed
- Works with Vercel serverless (WebSockets require persistent connection, problematic on Vercel)
- Simpler than WebSockets: no upgrade handshake, no socket management
- Built-in reconnection in browsers (EventSource auto-reconnects)
- HTTP/2 supports many concurrent SSE connections efficiently

**Why not Supabase Realtime:**
- Would expose database schema/RLS logic to frontend directly
- Less control over what data is sent and to whom
- Harder to implement plan-based delays (free tier 4-hour delay)

**Trade-offs:**
- SSE is one-way: cannot receive client messages (not needed here)
- At scale (10K+ users): polling DB every 60s = 10K queries/min → must switch to Redis pub/sub fan-out
- Vercel edge functions time out after 30 seconds: implemented 5-minute max connection + client reconnect

---

## D8: Commodity Price Source

**Decision (initial):** Alpha Vantage API
**Decision (current, pending implementation):** Yahoo Finance (yahoo-finance2 npm package)

**Context:** Need real-time commodity prices for watchlist, signal cards, and price ticker.

**Why Alpha Vantage was chosen initially:**
- Well-known, documented, reliable
- Provides commodity futures data (CL=F, BZ=F, GC=F etc.)
- Free tier available

**Why Alpha Vantage was rejected:**
- Free tier: 25 requests/day total
- 8 symbols × 96 runs/day needed = 768 requests/day
- Quota exhausted in the first 45 minutes of every day
- Paid tier: $50/month — too expensive for current stage

**Why Yahoo Finance chosen as replacement:**
- Completely free with no API key required
- Unlimited requests (scraped via unofficial yfinance pattern)
- Same symbol format (CL=F, BZ=F, GC=F)
- yahoo-finance2 npm package is well-maintained with TypeScript support
- Risk: unofficial API, could break without warning (mitigated by Redis cache + fallback prices)

---

## D9: Deployment Platform

**Decision:** Vercel (web) + Railway (backend + workers)

**Context:** Need to host Next.js web app and Node.js Fastify backend separately.

**Options considered:**
- Web: Vercel, AWS Amplify, Netlify, Railway, Render
- Backend: Railway, Render, Fly.io, AWS ECS, Heroku, DigitalOcean App Platform

**Choices:**
- Web → Vercel: trivially simple Next.js deployment, global CDN, serverless functions, free tier
- Backend → Railway: simple GitHub-connected deployment, supports two separate services, good DX

**Why not Render:**
- Free tier spins down after inactivity (workers cannot sleep — they run on crons)
- Railway keeps services always-on on paid plan

**Why not Fly.io:**
- More configuration required (fly.toml, Dockerfile)
- Railway's GitHub integration is simpler for this stage

**Why not AWS:**
- Too much infrastructure overhead for a single-founder stage
- Cost unpredictability

**Trade-offs:**
- Railway free tier: credits exhaust, needs billing ($5/month hobby plan)
- Railway monorepo: requires Root Directory setting per service — this was missed and caused backend to never deploy
- Vercel serverless: SSE max 30s timeout (mitigated by 5-min connection limit + reconnect)

---

## D10: Authentication Provider

**Decision:** Supabase Auth

**Context:** Need email/password + OAuth login with session management.

**Options considered:**
- A) Supabase Auth (built into Supabase)
- B) Auth0
- C) Clerk
- D) NextAuth / Auth.js
- E) Custom JWT (build from scratch)

**Choice:** A — Supabase Auth

**Rationale:**
- Already using Supabase for database — no additional vendor
- @supabase/ssr library handles cookie-based sessions perfectly for Next.js App Router
- Built-in email verification, password reset, OAuth providers
- Free tier: 50,000 monthly active users
- DB trigger on auth.users INSERT auto-creates profiles row

**Why not Clerk:**
- Additional monthly cost ($25+/month for production features)
- Another vendor dependency when Supabase covers the need

**Why not NextAuth:**
- More configuration for OAuth providers
- Session management more complex with App Router
- Supabase integration requires more glue code

**Trade-offs:**
- Supabase Auth is tied to Supabase — migrating auth = migrating database
- OAuth callback URL must be Supabase URL (/auth/v1/callback) not the app URL

---

## D11: Marketing Positioning (Research Firm vs AI Tool)

**Decision:** Position as "AI-powered research firm" not "AI tool"

**Context:** Early positioning described BBR as "an AI tool." Users immediately think "just another ChatGPT wrapper."

**The pivot:** After competitor research and user feedback analysis, the positioning changed to: "Blue Beacon Research — AI-powered with a team of researchers continuously analyzing the severity of news and its implications on trades."

**Why this works:**
- Bloomberg, Stratfor, Palantir are all research firms — that's the category users trust
- "AI tool" signals: cheap, generic, commodity
- "Research firm" signals: expert, trusted, exclusive, expensive
- The product IS an AI tool but shouldn't be framed that way — the research framing is more accurate to the value delivered
- Framing as research firm justifies the premium pricing

**What this means for copy:**
- Never say "our AI" in the product — say "our research team" or "our intelligence analysts"
- Signal cards are "intelligence briefings" not "AI outputs"
- The dashboard is an "intelligence terminal" not an "AI dashboard"
- Severity classification is done by "our research engine" not "GPT"

---

## D12: India-specific vs Global

**Decision:** Global product, not India-specific

**Context:** Original idea was targeted at Indian commodity traders (MCX, NSE) as a specific initial market.

**Why India-specific was rejected:**
- India has 2.5M+ active commodity traders — large TAM
- BUT: global positioning is more prestigious and credible for a geopolitical intelligence platform
- Geopolitical intelligence is inherently global — restricting to India makes the product feel parochial
- Competitors (Bloomberg, Stratfor) are global — being "the Bloomberg for India" is weaker positioning than "the affordable Bloomberg for the world"
- BBR's data sources (GDELT, ACLED) are global — artificially restricting to India wastes the data pipeline
- Investors (future) respond better to global TAM

**What was preserved:**
- India remains a strong go-to-market focus (large retail trader community, WhatsApp-native)
- WhatsApp alerts (India-specific channel) deferred to V2
- India-relevant events (India-Pakistan conflict, RBI decisions, monsoon crop impact) are naturally covered by the global platform

---

## D13: Stripe Billing — When to Implement

**Decision:** Stub Stripe completely until first person asks to pay

**Context:** Should Stripe be fully implemented before launch or after?

**Rationale for stubbing:**
- Implementing Stripe takes 3 full days (products, checkout, webhooks, portal, upgrade/downgrade flows)
- During early testing, no one is paying — Stripe adds complexity with zero revenue benefit
- All users hardcoded to 'pro' via SQL: `UPDATE profiles SET plan_tier = 'pro'`
- Risk: if Stripe is built but untested, a broken checkout flow loses paying customers at the critical moment
- Better approach: stub completely → get product working → implement Stripe only when first paying customer appears

**How to implement Stripe when ready:**
1. Create products/prices in Stripe dashboard
2. Implement /api/stripe/checkout route (creates checkout session)
3. Implement /api/stripe/webhook route (handles subscription events)
4. Implement /api/stripe/portal route (customer self-service)
5. Remove SQL hardcode, test full upgrade flow
6. Add plan enforcement middleware (currently exists but plan = 'pro' for everyone)

---

## D14: WorldMonitor Competitor Strategy

**Decision:** Don't compete on breadth — compete on depth and personalization

**Context:** WorldMonitor is free, open source, has 59K GitHub stars, and is adding paid Pro features. Initial instinct was to add more data layers to BBR to match.

**Why competing on breadth was rejected:**
- WorldMonitor has 2M users and a massive open-source community — we cannot win a data breadth war
- Adding 500 RSS feeds and 21-language support doesn't differentiate BBR
- It makes the product more complex, hurting BBR's core value proposition (simplicity)

**The chosen differentiation:**
1. Personalized alerts (WorldMonitor Pro has digest alerts but not per-rule personalization)
2. Commodity-specific backtesting (WorldMonitor has zero backtesting)
3. Trader-first framing (WorldMonitor is analyst-first, data-first)
4. Economic calendar integrated with signal generation (WorldMonitor doesn't generate signals from calendar events)
5. Self-serve in 5 minutes (WorldMonitor Pro setup is complex)

**What this means for product decisions:**
- Every feature added must serve the "personalized commodity trading intelligence" use case
- Never add features that WorldMonitor already does well (raw feed breadth, country risk scores, webcams)
- BBR's moat is: geopolitical event → specific commodity impact → personalized alert → before markets open
