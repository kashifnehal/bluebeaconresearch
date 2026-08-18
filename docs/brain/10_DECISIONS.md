# 10_DECISIONS.md — Architectural Decision Records (ADRs) & Trade-offs

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

This document records the foundational architectural decisions, framework selections, infrastructure trade-offs, underlying assumptions, and system risks for Blue Beacon Research.

---

## 1. ADR 001: Selection of Next.js 16 App Router for Web Terminal

### Context

The platform requires an institutional dark terminal interface with fast initial page load (SEO for landing page) combined with protected real-time dashboard routes.

### Decision

Adopt Next.js 16 (`apps/web`) using the App Router, `@supabase/ssr` middleware, and React 19.

### Rationale

- **SSR & SEO**: Server-side rendering for `/` and public pages guarantees optimal search engine indexing.
- **Middleware Guarding**: `middleware.ts` enables zero-latency route checking for authentication and `isProjectReady` gating before rendering page components.
- **Developer Velocity**: Seamless monorepo integration with shared TypeScript types (`packages/shared`).

---

## 2. ADR 002: Fastify REST Backend vs. Next.js API Routes

### Context

High-frequency ingestion workers, background alert routing, and external developer APIs require high-throughput Node.js execution.

### Decision

Decouple the backend API into a dedicated Fastify REST server (`apps/backend`) running on port 3001 rather than using Next.js route handlers exclusively.

### Rationale

- **Throughput**: Fastify is significantly faster with lower overhead than Next.js serverless functions.
- **Long-Running Process Isolation**: Background workers (`workers.ts`) and cron schedulers require persistent Node.js event loops, which are prohibited in serverless environments like Vercel.
- **Schema Validation**: Built-in Zod schema compilation and Fastify plugin ecosystem.

---

## 3. ADR 003: Upstash Redis & BullMQ for Background Processing

### Context

Ingesting 350+ global news feeds every 15 minutes and dispatching sub-second alerts requires reliable queue management with retry logic.

### Decision

Utilize BullMQ backed by Upstash serverless Redis.

### Rationale

- **Decoupled Heavy Operations**: AI prompts (Anthropic API calls take 1–3s) are isolated from HTTP request/response loops.
- **Concurrency & Backoff**: BullMQ provides automatic exponential backoff, rate-limiting, and dead-letter queues out of the box.
- **Serverless Redis**: Upstash Redis allows seamless scaling without managing self-hosted Redis servers.

---

## 4. ADR 004: Supabase PostgreSQL for Relational Data & RLS Security

### Context

Geopolitical signals, user preferences, alert rules, and API keys require strict tenant isolation and complex relational querying.

### Decision

Adopt Supabase PostgreSQL with native Row Level Security (RLS).

### Rationale

- **Database-Level Isolation**: RLS policies (`auth.uid() = user_id`) enforce security directly inside PostgreSQL, eliminating multi-tenant data leaks regardless of API layer bugs.
- **Full-Text Search**: Built-in GIN index support (`to_tsvector`) for fast text search on signal titles and summaries.
- **Ecosystem Integration**: Unified authentication, database migrations, and real-time subscriptions.

---

## 5. ADR 005: Heuristic Fallback Classifier (No Vendor Lock-in)

### Context

Claude API credits can exhaust. BullMQ workers require Redis to be operational. Both are external dependencies that can fail.

### Decision

`ClaudeService.classifyEvent()` wraps the Anthropic API call in a try/catch and falls back to a **keyword-based NLP heuristic classifier** when the API fails.

### Market Impact Integrity

- The heuristic fallback is conservative by design: it only emits commodity impacts when direct textual evidence exists.
- It must never invent market exposure to populate UI cards or assign a synthetic `USOIL` volatile impact when no commodity signal is present.
- If no defensible asset impact exists, the fallback returns an empty `commodityImpacts` array.
- Commodity asset symbols are validated against the approved product list to prevent unsupported or invented assets.

### Rationale

- **100% Pipeline Reliability**: Signals are ALWAYS created regardless of Anthropic credit balance, rate limits, or API outages.
- **No Mock Data**: Real news articles are processed into real signals, just without AI-enhanced analysis.
- **Zero Cost Fallback**: Heuristic classifier runs fully in-process with no external API cost.

---

## 6. ADR 006: Direct-to-DB Signal Insertion (Bypass BullMQ)

### Context

In early deployment, BullMQ workers may not be running. When collectors insert into `raw_events` and enqueue `aiClassification` jobs, if the worker isn't listening, signals are never created.

### Decision

Both `gnews-collector.ts` and `gdelt-collector.ts` now **classify and insert signals directly** to Supabase, bypassing the BullMQ queue entirely.

### Rationale

- **Simpler Runtime**: No dependency on Redis being available for basic ingestion.
- **Works Locally**: Developers can run a single cron trigger and immediately see signals in the DB.
- **Deduplication**: Signal dedup is handled by checking `external_id` in `raw_events` before classification.

---

## 7. ADR 007: RSS Real-Time Collector & Strict Word-Boundary Ingestion

### Context

GNews API free tier caches articles with a 12-hour lag, serving stale news despite workers running every 15 minutes. Additionally, simple substring keyword filters (`"war"`) produced false positives from historical or benign articles (e.g., _"1970 anti-war protests"_, _"tug-of-war"_).

### Decision

1. Introduce a dedicated RSS Collector (`apps/backend/src/workers/rss-collector.ts`) fetching live feeds from Reuters, BBC World, Al Jazeera, and The Guardian without API keys or rate limits.
2. Upgrade `isRelevantEvent` across collectors and inline auto-ingest to enforce **regex word-boundary matching** (`\bwar\b`, `\boil\b`, `\bgas\b`) and hard exclusions for historic year ranges (`1970`–`2005`).
3. Limit the web signal feed (`/api/signals`) to a **24-hour `event_date` window** sorted by publication timestamp `event_date DESC`.

### Rationale

- **Sub-Hour Freshness**: Wire RSS feeds provide breaking news within minutes (<1h), overcoming third-party API cache delays.
- **Zero API Costs**: RSS feeds require no authentication keys or paid subscriptions.
- **Signal Precision**: Regex word-boundary filtering ensures only true geopolitical/military/economic events reach severity 8–9.

---

## 8. Architectural Assumptions & Future Risks

1. **Third-Party API & RSS Feed Availability**: System relies on GNews, GDELT, RSS endpoints, Yahoo Finance uptime.
2. **Anthropic API Credits**: Production requires Anthropic credits. Heuristic fallback covers outages but quality is lower.
3. **GNews Free Tier**: 10 articles / 15 min = 960 articles/day. Upgrade if more volume is needed.
4. **GDELT Reliability**: GDELT v2/doc/doc API is academic infrastructure; occasional slow responses are expected.
5. **Map Rendering Choice**: To avoid Mapbox account/token dependencies and ensure out-of-the-box functionality, the web client uses **MapLibre GL** with OpenStreetMap raster tiles. This preserves GIS features (heatmap, clustering) while removing reliance on Mapbox tier limits.
