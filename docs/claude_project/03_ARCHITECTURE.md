# 03_ARCHITECTURE.md — System Architecture & Data Pipelines

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

---

## 3. Background Workers & Queue Architecture

The worker processes run independently in `apps/backend/src/workers.ts` managed by BullMQ and Upstash Redis:

1. **`gdelt-collector.ts`**: Fetches real-time GDELT 2.0 API events every 15 minutes, parsing conflict location and news URL metadata.
2. **`acled-collector.ts`**: Queries Armed Conflict Location & Event Data Project API for verified military engagement data.
3. **`gnews-collector.ts`**: Searches global news feeds for military, oil pipeline, and maritime conflict keywords.
4. **`ai-classifier.ts`**: Consumes pending events from `ai-classification` queue, sends structured prompts to Claude 3.5, and parses JSON signal outputs.
5. **`signal-generator.ts`**: Persists enriched AI intelligence signals into `signals` database table.
6. **`alert-dispatcher.ts`**: Matches newly created signals against user `alert_rules` and dispatches multi-channel payload notifications.
7. **`price-syncer.ts`**: Syncs real-time physical commodity prices from Alpha Vantage API into `commodity_prices` every hour.
8. **`sanctions-syncer.ts`**: Monitors global sanctions list updates for defense compliance.

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
