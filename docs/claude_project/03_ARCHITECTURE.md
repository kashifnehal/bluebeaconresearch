# 03_ARCHITECTURE.md — System Architecture & Data Pipelines

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

This document details the high-level and low-level software architecture, data flow diagrams, background queue workers, state synchronization, and component dependencies across the Turborepo workspace.

---

## 1. High-Level Architecture Overview

Blue Beacon Research uses a decoupled, event-driven monorepo architecture managed via **Turborepo** and **pnpm workspaces**.

```
                        ┌──────────────────────────────────────────────────┐
                        │             Client Applications                  │
                        │  - Next.js 16 Web Terminal (Vercel)              │
                        │  - Expo / React Native Mobile Client             │
                        └────────────────────────┬─────────────────────────┘
                                                 │ HTTPS / REST / JWT
                                                 ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   Fastify Backend API Server                                   │
│  - Port 3001                                                                                   │
│  - Routes: /signals, /alerts, /backtesting, /webhooks, /api-keys, /prices, /users, /telegram   │
│  - Middlewares: Auth Handler (@supabase/ssr), Plan Guard, Zod Validator                        │
└───────────────┬───────────────────────────────┬───────────────────────────────┬────────────────┘
                │                               │                               │
                ▼                               ▼                               ▼
┌──────────────────────────────┐ ┌───────────────────────────┐ ┌───────────────────────────┐
│     Supabase PostgreSQL      │ │   Upstash Redis & BullMQ  │ │       AI Engine           │
│  - RLS Security Policies     │ │  - Queues: Ingestion,     │ │ Anthropic Claude 3.5      │
│  - Signals & Raw Events DB   │ │    Classification, Alerts │ │   Sonnet & Haiku SDK      │
└──────────────────────────────┘ └───────────────────────────┘ └───────────────────────────┘
                ▲                               ▲
                │                               │
┌───────────────┴───────────────────────────────┴────────────────────────────────────────────────┐
│                                   Async Background Workers                                     │
│  - node-cron Scheduler (15-min intervals)                                                      │
│  - Collectors: GDELT, ACLED, GNews API                                                         │
│  - AI Signal Generator Queue Processor                                                         │
│  - Sub-second Multi-channel Alert Dispatcher Worker                                            │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

> ⚠️ UPDATED 2026-08-19 — the "Sub-second Multi-channel Alert Dispatcher Worker" was actually completely non-functional (dormant/unfed queue) until fixed 2026-08-18; see the detailed note under section 2 below.

---

## 2. Ingestion & Signal Processing Pipeline

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ GDELT Collector │       │ ACLED Collector │       │ GNews Collector │
└────────┬────────┘       └────────┬────────┘       └────────┬────────┘
         │                         │                         │
         └────────────────────┬────┴─────────────────────────┘
                              │ Cron Trigger (every 15 min)
                              ▼
                ┌───────────────────────────┐
                │ Insert into `raw_events`  │ Deduplication by source
                │     (PostgreSQL DB)       │ + external_id key
                └─────────────┬─────────────┘
                              │
                              ▼
                ┌───────────────────────────┐
                │  BullMQ Classifier Queue  │ Queue: `ai-classification`
                └─────────────┬─────────────┘
                              │
                              ▼
                ┌───────────────────────────┐
                │ Anthropic Claude 3.5 AI   │ Prompting Sonnet/Haiku
                │   Synthesis Service       │ to output JSON signal
                └─────────────┬─────────────┘
                              │
                              ▼
                ┌───────────────────────────┐
                │  Insert into `signals`    │ Store severity (1-10),
                │     (PostgreSQL DB)       │ confidence & impacts
                └─────────────┬─────────────┘
                              │
                              ▼
                ┌───────────────────────────┐
                │ BullMQ Alert Dispatcher   │ Queue: `alert-dispatch`
                └─────────────┬─────────────┘
                              │
         ┌────────────────────┼────────────────────┬────────────────────┐
         ▼                    ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Telegram Bot   │  │  Slack Webhook  │  │ HTTP Webhooks   │  │ Expo Push Alert │
└─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘
```

> ⚠️ UPDATED 2026-08-19 — the `BullMQ Alert Dispatcher` / `alert-dispatch` queue step shown above was never actually fed (a wiring gap, not a credentials issue), so alert dispatch was completely non-functional until 2026-08-18. It's now fixed by having collectors (rss/gnews/gdelt) call `dispatchAlertsForSignal()` inline right after each insert; the BullMQ queue/worker was deliberately kept but is dormant, not the live trigger path shown in this diagram.

> ⚠️ UPDATED 2026-08-29 — the diagram above also omits two things that materially changed how ingestion works:
>
> 1. **A fourth collector, `rss-collector.ts`, was added and is now the primary real-time source** (ADR 007, `10_DECISIONS.md`) — it pulls live wire feeds (BBC World, Al Jazeera, Guardian, DW World, and market/finance feeds) with no API key and no rate limit, feeding into `raw_events` alongside GDELT/ACLED/GNews. It exists because GNews's free tier caches articles up to 12 hours late, which was serving stale news as if it were breaking.
> 2. **Freshness tagging and cross-source merge were added on top of the raw pipeline.** Each collector now tags its inserts `freshness: "realtime"` (RSS, GDELT) or `freshness: "cached"` (GNews) in `raw_events.raw_data`. A new step, `signal-merge.ts` (ADR 010), runs after classification: when RSS/GNews/GDELT all report the same real-world event (same region, event dates within ±8h, high text-similarity on the AI-generated summary), instead of creating duplicate signal cards it merges them into one — reusing the existing AI briefing if the new report doesn't raise severity, or regenerating the briefing and bumping severity if it does. When sources disagree on the event's timestamp, the realtime-tagged source's timestamp wins over a cached one, so a GNews cache refresh can no longer make an old story look freshly-breaking. Wired into rss/gnews/gdelt collectors only — not `acled-collector.ts`, not `reconciliation.ts`.
> 3. **Per-collector health tracking was added** (`apps/backend/src/lib/pipeline-status.ts`): each collector's success/failure and consecutive-failure count is now tracked, feeding a Sentry alert after repeated failures — direct response to RSS having silently failed for 16 days in August with zero visibility.

---

## 3. Background Workers & Queue Architecture

The worker processes run independently in `apps/backend/src/workers.ts` managed by BullMQ and Upstash Redis:

1. **`rss-collector.ts`**: Fetches live wire-feed RSS (BBC World, Al Jazeera, Guardian, DW World, plus market/finance feeds) every 15 minutes — no API key, no rate limit. The platform's primary real-time source; see ADR 007 in `10_DECISIONS.md`.
2. **`gdelt-collector.ts`**: Fetches real-time GDELT 2.0 API events every 15 minutes, parsing conflict location and news URL metadata.
3. **`acled-collector.ts`**: Queries Armed Conflict Location & Event Data Project API for verified military engagement data.
4. **`gnews-collector.ts`**: Searches global news feeds for military, oil pipeline, and maritime conflict keywords.
5. **`ai-classifier.ts`**: Consumes pending events from `ai-classification` queue, sends structured prompts to Claude 3.5, and parses JSON signal outputs.
6. **`signal-generator.ts`**: Persists enriched AI intelligence signals into `signals` database table.
7. **`alert-dispatcher.ts`**: Matches newly created signals against user `alert_rules` and dispatches multi-channel payload notifications.

> ⚠️ UPDATED 2026-08-19 — as of 2026-08-18 this worker's queue is dormant; the collectors call `dispatchAlertsForSignal()` inline instead (see the pipeline-diagram note above for the full story).

8. **`price-syncer.ts`**: Syncs real-time physical commodity prices from Alpha Vantage API into `commodity_prices` every hour.

> ⚠️ UPDATED 2026-08-19 — prices are synced from Yahoo Finance (`yahoo-finance2`), not Alpha Vantage; Alpha Vantage was fully replaced (kept only as an unused env var).
9. **`sanctions-syncer.ts`**: Monitors global sanctions list updates for defense compliance.

> ⚠️ UPDATED 2026-08-29 — one more worker-level component not in the numbered list above: `signal-merge.ts`, which runs inline from the rss/gnews/gdelt collectors right after classification to dedupe and freshness-arbitrate across sources — see the Section 2 note above for what it does and why.

---

## 4. Authentication & Security Architecture

- **Supabase SSR Auth (`@supabase/ssr`)**: Manages session cookies in Next.js middleware (`apps/web/middleware.ts`) and Server Actions.
- **Fastify Bearer Auth**: `apps/backend/src/middleware/auth.ts` validates incoming Supabase JWT tokens via `supabase.auth.getUser(token)` or custom enterprise API keys (`api_keys` table lookup).
- **Row Level Security (RLS)**: Enforced directly at the PostgreSQL layer. Tables (`profiles`, `alert_rules`, `webhook_endpoints`, `user_channels`) restrict read/write access strictly to `auth.uid() = user_id`.

---

## 5. Dependency Graph across Workspace

```
apps/web (Next.js 16) ──────┐
                             ├───► packages/shared (TypeScript types & constants)
apps/backend (Fastify) ──────┘
                             ▲
                             │
apps/mobile (Expo RN) ───────┘
```
