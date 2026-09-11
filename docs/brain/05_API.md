# 05_API.md — Fastify REST API Architecture & OpenAPI Specifications

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

This document details every REST endpoint in `apps/backend/src/routes`, including HTTP methods, authentication requirements, rate limiting thresholds, request/response payload schemas, and client consumers.

---

## 1. Fastify Server Setup & Middlewares

- **Base URL**: `http://localhost:3001` (Dev) / `https://api.bluebeaconresearch.com` (Production)
- **Framework**: Fastify `v5.8.2` with `@fastify/cors` and `@fastify/swagger`
- **Auth Guard**: `apps/backend/src/middleware/auth.ts` verifies Supabase JWT `Authorization: Bearer <token>` or `x-api-key: <hash>`
- **Plan Guard**: `apps/backend/src/middleware/plan-guard.ts` checks user plan tier (`free`, `analyst`, `pro`, `api`)

---

## 2. Comprehensive Endpoint Index

### 2.1 Signal Intelligence Endpoints

#### `GET /api/signals`

- **Description**: Fetches paginated tactical intelligence signals.
- **Auth**: Required (Bearer JWT or API Key).
- **Query Params**:
  - `severity` (`number`, optional, e.g. `7`): Min severity threshold.
  - `commodity` (`string`, optional, e.g. `USOIL`): Target symbol.
  - `region` (`string`, optional, e.g. `Middle East`).
  - `window` (`string`, optional): signal lifecycle filter. Allowed values:
    - `latest` → fresh intelligence feed: `event_date >= 24h` or `is_active = true`.
    - `24h` → published within the last 24 hours only.
    - `7d` → published within the last 7 days.
    - `active` → currently active signals regardless of publish age.
  - `limit` (`number`, default `50`, max `100`).
  - `offset` (`number`, default `0`).
  - `page` (`number`, default `1`): page-based pagination; response carries a real `nextCursor` (`String(page+1)` or `null`) and `total`.
  - `personalized` (`"true"`, optional, default **off**) — #81 "My Feed". When the caller is authenticated **and** has saved preferences, narrows the feed to signals overlapping their saved `regions`, `commodities`, **or `forex_pairs`** (the last added by #87 phase 2, `55df380`, 2026-09-09 — matched against `signals.currency_pair_impacts` with the same jsonb-`@>` containment used for `commodity_impacts`, folded into one combined `OR`). No user or no saved prefs → no-op, full feed returned. Personalized payloads are **never** written to the per-query process cache. Response adds `personalized` (boolean — whether the narrowing was actually applied).
- **Response `200 OK`**:
  ```json
  {
    "signals": [
      {
        "id": "uuid",
        "title": "Red Sea Missile Engagement Near Tanker",
        "summary": "Anti-ship missile fired near commercial oil tanker in Bab-el-Mandeb Strait.",
        "ai_analysis": "Claude 3.5 Sonnet analysis detailing supply line risk...",
        "severity": 9,
        "confidence": 0.94,
        "country": "Yemen",
        "region": "Middle East",
        "lat": 12.5,
        "lng": 43.3,
        "commodity_impacts": [
          { "asset": "USOIL", "direction": "up", "confidence": 0.85 }
        ],
        "currencyPairImpacts": [
          { "asset": "USDRUB", "direction": "up", "confidence": 0.72 }
        ],
        "classification_method": "claude",
        "is_breaking": true,
        "created_at": "2026-08-04T12:00:00Z",
        "updated_at": "2026-08-04T12:15:00Z",
        "eventDate": "2026-08-04T11:45:00Z"
      }
    ],
    "total": 1,
    "fallback": false,
    "fallbackReason": null,
    "fallbackLastUpdated": null
  }
  ```
> ⚠️ UPDATED 2026-08-19 — Two caveats on the `ai_analysis` field above: (1) Anthropic API credit is currently exhausted, so a heuristic classifier fallback is generating this content, not live Claude; (2) for severity ≥7 signals specifically, this field was found completely unpopulated (0 of 423 signals, ever) due to a dormant-BullMQ-queue wiring bug, fixed 2026-08-19 by wiring `generateSignalAnalysis()` inline into the collectors and reconciliation worker.
> ⚠️ UPDATED 2026-09-12 — new field `classification_method` (`"claude"` | `"heuristic"` | `null` for pre-existing unbackfilled rows) reflects which caveat above actually applied to this specific row. As of this date, heuristic-path severity is hard-capped at 6 — a `"heuristic"` row will never show severity > 6. See `10_DECISIONS.md` ADR 016 and migration `20260912000000_signals_classification_method.sql`.
- **Consumers**: Next.js Dashboard, MapLibre Map (OpenStreetMap tiles), Mobile Client.

**Notes**: In degraded or rate-limited scenarios `/api/signals` may return the last-known payload with additional non-breaking fields: `fallback` (boolean), `fallbackReason` (string), and `fallbackLastUpdated` (ISO timestamp). The server also sets header `x-signals-feed-status: degraded` when serving cached/fallback data.

#### `GET /api/signals/:id`

- **Description**: Fetches granular single signal details and raw news source references.
- **Auth**: Required.
- **Consumers**: Event Deep-Dive page (`/events/[id]`).

#### `GET /api/signals/:id/chat` and `POST /api/signals/:id/chat` (#111, `9f2aada` web / `dcdc877` Fastify)

- **Description**: Per-signal follow-up chat, grounded **only** in that signal's own data. Next.js BFF at `apps/web/app/api/signals/[id]/chat/route.ts` resolves the caller's Supabase session and forwards `Authorization: Bearer` to Fastify `GET|POST /v1/signals/:id/chat`. The panel never talks to Fastify from the browser.
- **Auth**: Required. Fastify also gates POST: `403 premium_required` if `planTier === "free"`; `429 rate_limited` after 30 user messages / rolling 24h (counted on `signal_chat_messages`, not `@fastify/rate-limit`); `503 { "error": "ai_temporarily_unavailable" }` if `chatAboutSignal()` throws unexpectedly (added 2026-09-12 — the POST handler previously had no try/catch around this call at all, so an unexpected exception would have produced a generic 500 instead of a specific, honest error the frontend can render).
- **POST body**: `{ "message": string }` → `{ "reply": string }`. GET returns `{ "data": [{ id, role, content, created_at }] }` (last 50, oldest first).
- **Consumers**: `SignalChatPanel` on `/events/[id]`.
- **Why**: explain this briefing, not give buy/sell or personalized-position advice. See `18_AI_ENGINE.md` §3b / `ClaudeService.chatAboutSignal()`.

---

### 2.2 Alert Rules & Dispatch Endpoints

#### `GET /api/alerts`

- **Description**: Fetches user-configured alert rules.
- **Auth**: Required.

#### `POST /api/alerts`

- **Description**: Creates a new user alert rule.
- **Request Body**:
  ```json
  {
    "name": "Crude Oil Severe Alerts",
    "commodities": ["USOIL", "UKOIL"],
    "regions": ["Middle East"],
    "min_severity": 8,
    "channels": ["telegram", "push"]
  }
  ```

#### `DELETE /api/alerts/:id`

- **Description**: Deletes an alert rule by ID.

> ⚠️ UPDATED 2026-09-09 (#87 phase 3, `a102e68`) — `alert_rules` gained a
> `forex_pairs text[]` column (mirrors `commodities`). The alert dispatcher
> (`apps/backend/src/workers/alert-dispatcher.ts`) matches a rule when its
> `forex_pairs` overlap a signal's `currency_pair_impacts`, **OR'd** with the
> commodity match (a rule with neither list set is not instrument-filtered). The
> daily digest (`digest-sender.ts`) folds `user_preferences.forex_pairs` into the
> same single containment `OR` against `currency_pair_impacts`. The Next.js web
> route `GET /api/alert-rules` and `GET /api/alerts/recent` (the latter now joins
> `currency_pair_impacts`) both return the new field. Alert-rule creation is a
> direct RLS-scoped Supabase insert from `/alerts` and each event page — the
> create-rule modal there carries a 6-pair forex multi-select. No
> `equity_tickers` — equity stays gated (ADR 013 / D17).

---

### 2.3 Backtesting Suite Endpoint

#### `POST /api/backtesting/run`

- **Description**: Executes historical signal backtest against commodity price action.
- **Auth**: Required (`Analyst`, `Pro`, or `API` tier required).
- **Request Body**:
  ```json
  {
    "symbol": "USOIL",
    "startDate": "2025-01-01",
    "endDate": "2026-08-01",
    "minSeverity": 7,
    "holdingPeriodHours": 48
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "sharpeRatio": 1.84,
    "winRatePct": 68.5,
    "totalTrades": 42,
    "maxDrawdownPct": -4.2,
    "equityCurve": [
      { "date": "2025-01-02", "value": 10000 },
      { "date": "2025-01-03", "value": 10450 }
    ]
  }
  ```

---

### 2.4 Commodities & Prices Endpoints

#### `GET /api/prices`

- **Description**: Returns latest cached 24h prices for the symbols the price-syncer worker writes into `commodity_prices` — 8 commodities (`USOIL`, `UKOIL`, `XAUUSD`, `NGAS`, `WHEAT`, `COPPER`, `XAGUSD`, `CORN`) **and, since #87 phase 1, 6 forex pairs** (`EURUSD`, `GBPUSD`, `USDJPY`, `USDCHF`, `USDRUB`, `USDCNY`). Tier 1 (the `commodity_prices` query) returns every symbol present; the Tier-2 Redis fallback allow-list was widened to include the forex pairs in #87 phase 2 (`55df380`, 2026-09-09).
- **Auth**: None (Public/Cached).

#### `GET /v1/accuracy` (#121, 2026-09-11)

- **Description**: Public, no-auth aggregation of `signal_outcomes` — overall + per-asset `hit_rate`/`avg_move_when_correct`/`sample_size_note` (gated to `not_enough_history: true` below 20 scored predictions), a `volatile_neutral_summary` kept separate from `hit_rate`, and `date_range`. Never live-recomputes against `commodity_prices`. Full detail: `docs/claude_project/05_API.md` §"Accuracy — GET /v1/accuracy".
- **Auth**: None.

---

### 2.5 API Keys & Developer Webhooks

#### `GET /api/api-keys` & `POST /api/api-keys`

- **Description**: Generates new enterprise `x-api-key` strings (`bb_live_...`).

#### `GET /api/webhooks` & `POST /api/webhooks`

- **Description**: Subscribes target HTTP endpoint to real-time signal dispatches.
