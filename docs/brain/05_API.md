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
- **Consumers**: Next.js Dashboard, MapLibre Map (OpenStreetMap tiles), Mobile Client.

**Notes**: In degraded or rate-limited scenarios `/api/signals` may return the last-known payload with additional non-breaking fields: `fallback` (boolean), `fallbackReason` (string), and `fallbackLastUpdated` (ISO timestamp). The server also sets header `x-signals-feed-status: degraded` when serving cached/fallback data.

#### `GET /api/signals/:id`

- **Description**: Fetches granular single signal details and raw news source references.
- **Auth**: Required.
- **Consumers**: Event Deep-Dive page (`/events/[id]`).

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

- **Description**: Returns latest cached 24h commodity prices ticker (`USOIL`, `GOLD`, `NG`, `COPPER`, `WHEAT`).
- **Auth**: None (Public/Cached).

---

### 2.5 API Keys & Developer Webhooks

#### `GET /api/api-keys` & `POST /api/api-keys`

- **Description**: Generates new enterprise `x-api-key` strings (`bb_live_...`).

#### `GET /api/webhooks` & `POST /api/webhooks`

- **Description**: Subscribes target HTTP endpoint to real-time signal dispatches.
