# 05_API.md — Fastify REST API Architecture & OpenAPI Specifications

> **📍 Doc status — current as of 2026-09-26** for `/docs`, `sort=relevance`, the `sort=severity` ordering fix, and BFF-reads-Supabase. `claude/23_TODO.md` is not in this repo.
>
> ⚠️ UPDATED 2026-09-19 — Fastify Swagger UI at `/docs` is **not** public. It registers only when `NODE_ENV` is `development` or `test`. Production previously served unauthenticated OpenAPI at `https://api.bluebeaconresearch.com/docs`. Auth hook no longer skips `/docs` in production. Global rate limit remains `@fastify/rate-limit` 60/min in-memory (see `apps/backend/src/app.ts`).
>
> ⚠️ UPDATED 2026-09-13 (#138) — Fastify `/v1` unchanged. Next.js BFF `apiErrorLogged()` no longer forwards provider `.message` in the JSON `message` field (see `apps/web/lib/api-response.ts`).

This document details every REST endpoint in `apps/backend/src/routes`, including HTTP methods, authentication requirements, rate limiting thresholds, request/response payload schemas, and client consumers.

---

## 1. Fastify Server Setup & Middlewares

- **Base URL**: `http://localhost:3001` (Dev) / `https://api.bluebeaconresearch.com` (Production)
- **Framework**: Fastify `v5.8.2` with `@fastify/cors` and `@fastify/swagger` (Swagger UI `/docs` is local/test only as of 2026-09-19; not a public developer portal)
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
  - `search` (`string`, optional, min 3 chars): `ilike` OR across `title`/`summary`/`country`/`event_type`. Previously undocumented — added here alongside `sort` below.
  - `sort` (`string`, optional, default `"severity"`): `"severity"` — **fixed 2026-09-26 (claude/229/86, commit `20e0050`)**: genuinely `severity desc, created_at desc` now. It had been `event_date desc, severity desc, created_at desc` (recency-first despite the name) since before this doc first flagged it as undocumented-but-unchanged; the `sort=relevance` candidate pre-fetch kept that recency-first order deliberately, and a shared ternary branch had conflated the two. `"newest"` (`event_date desc, created_at desc`), `"confidence"`, or **`"relevance"`** (recency+severity blend, see below) are unaffected.
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
        "media_impact_entity": null,
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
> ⚠️ UPDATED 2026-09-13 (#142) — `media_impact_entity` (`string` | `null`) is the matched `media_impact_watchlist.entity_name` when the story's statement is attributable to a sourced communicator; null otherwise. Next.js `/api/signals` and `/api/signals/:id` also attach `mediaImpactCaveat` (short first-sentence caveat from the watchlist) for the `[Media-Impact]` tag. Not a forecast.
> ⚠️ UPDATED 2026-09-13 (#143) — Next.js `/api/signals` and `/api/signals/:id` now also map `eventCategory` / `marketMechanism` / `isPreview` (and `:id` now includes `currencyPairImpacts`) so the MARKET IMPACT ASSESSMENT box can render them. Fastify `/v1` already returned these via `select("*")` from #141; this is the BFF mapping only.
> ⚠️ UPDATED 2026-09-20 (#143 leftover) — `/api/signals/:id` now also maps `novelty` / `sourceConfirmation` / `materialityReasoning` (null-safe; most pre-gate rows stay null). List `/api/signals` does not map these three. Still unmapped in the BFF: `relevance` / `materiality_pass`.
> ⚠️ UPDATED 2026-09-21 (#178) — list `GET /api/signals` now maps the same three fields with the same parsers as `:id`. Still unmapped in the BFF: `relevance` / `materiality_pass`.
> ⚠️ UPDATED 2026-09-20 (search-quality fix) — new `sort=relevance`: fetches a candidate set (existing filters apply, up to a 200-row window ordered by `event_date desc`), then in application code ranks by `rank_score = severity / (hours_since_eventDate + 2)^1.8` and slices the requested page — a big story from an hour ago can now outrank a bigger story from days ago, and vice versa if the gap is large enough. Formula in `apps/web/lib/signal-relevance-rank.ts`. Used today only by `CommandPalette.tsx`'s Signals search (`search=…&sort=relevance`); the Intelligence Feed page's default sort is untouched. **Doc-accuracy correction found this ship**: `docs/claude_project/05_API.md` §6 ("NEXT.JS API ROUTES") said `signals/route.ts → proxies GET /v1/signals` — that's wrong (fixed there this ship). This route reads Supabase directly, same as `signals/[id]/route.ts` right below it in that same list; it never calls the Fastify backend. The separate Fastify `GET /v1/signals` (documented in `docs/claude_project/05_API.md` §4.2 — this file doesn't have its own copy of that route) is a distinct API-tier surface for `api.bluebeaconresearch.com` programmatic customers and has (and had) no `search` param at all — command-palette-style text search only ever existed on this BFF route. `sort=relevance` was added to both routes for consistency (mirrored formula in `apps/backend/src/lib/relevance-rank.ts`), but only this BFF route can actually search by text.
- **Consumers**: Next.js Dashboard, MapLibre Map (OpenStreetMap tiles), Mobile Client, Command Palette (`sort=relevance`).

**Notes**: In degraded or rate-limited scenarios `/api/signals` may return the last-known payload with additional non-breaking fields: `fallback` (boolean), `fallbackReason` (string), and `fallbackLastUpdated` (ISO timestamp). The server also sets header `x-signals-feed-status: degraded` when serving cached/fallback data.

#### `GET /api/signals/:id`

- **Description**: Fetches granular single signal details and raw news source references.
- **Auth**: Required.
- **Consumers**: Event Deep-Dive page (`/events/[id]`).
> ⚠️ UPDATED 2026-09-25 — response gains two fields, both bundled into the same payload (no separate round-trip, consistent with `historicalComparisons`/`pricesAtSignal` already living here): `sources` is now ordered oldest-first (`event_date` ?? parsed `raw_data.seendate` ?? `created_at`) and each entry carries `domain` (`raw_data.domain`) — powers the renamed "timeline" tab. New `relatedEvents[]`: other `signals` sharing this row's `country` AND at least one `commodity_impacts[].asset`, `event_date` within a placeholder 7 days *of this event's own `event_date`* (not wall-clock now — an old event must still be able to show related events), excluding anything already folded into this signal's own `raw_event_ids`. Each entry carries a `reinforcing`/`conflicting`/`mixed` label from comparing `direction` per shared asset — no numeric relevance score. Both windows/thresholds are explicitly placeholders (see `apps/web/app/api/signals/[id]/route.ts` comments, `04_DATABASE.md`).

#### `GET /api/signals/:id/chat` and `POST /api/signals/:id/chat` (#111, `9f2aada` web / `dcdc877` Fastify)

- **Description**: Per-signal follow-up chat, grounded **only** in that signal's own data. Next.js BFF at `apps/web/app/api/signals/[id]/chat/route.ts` resolves the caller's Supabase session and forwards `Authorization: Bearer` to Fastify `GET|POST /v1/signals/:id/chat`. The panel never talks to Fastify from the browser.
- **Auth**: Required. Fastify gates GET+POST with `CHAT_ALLOWED_EMAILS` (`403 chat_early_access_only`, fail closed if unset). POST then: existing `403 premium_required` if `planTier === "free"` (currently a no-op — signups hardcode `pro`); `429 rate_limited` after 30 user messages / 24h (fails closed on count error); `429 rate_limited_burst` after 5 / 5 min; `503 ai_temporarily_unavailable` with a distinct `message` when the chat daily budget is spent, or without it when the model is down.
- **POST body**: `{ "message": string }` → `{ "reply": string }` (assistant text may include a `---SOURCES---` block of handed URLs). GET returns `{ "data": [{ id, role, content, created_at }] }` (last 50, oldest first).
- **Consumers**: `SignalChatPanel` on `/events/[id]`.
- **Why**: explain this briefing, not give buy/sell or personalized-position advice. Grounded generation of the URL-identified signal — not RAG (D21 / ADR 017). Same #103 buy/sell rule as `generateAnalysis()`, plus personalized-advice refusal. See `18_AI_ENGINE.md` §3b / `ClaudeService.chatAboutSignal()`.

#### `POST /v1/search/assist` (Cmd+K fallback)

- **Description**: One-sentence suggestion from retrieved BBR page copy when the existing Command Palette search has few hits. Fastify `apps/backend/src/routes/search.routes.ts`; Next.js BFF `apps/web/app/api/search/assist/route.ts` forwards the caller's Bearer token (same pattern as signal chat).
- **Auth**: Required (`requireUser`). Not gated by `CHAT_ALLOWED_EMAILS` (palette is for every signed-in user). Chat daily Anthropic budget still applies.
- **POST body**: `{ "query": string }` (2–200 chars).
- **200**: `{ "status": "ok", "answer", "title", "url", "similarity" }` or `{ "status": "no_confident_answer" }` when similarity is below threshold, the index is empty, or Haiku returns `NO_ANSWER`.
- **503**: `{ "error": "ai_temporarily_unavailable" }` when the chat daily budget is spent (same message as #111) or Haiku throws.
- **Consumers**: `CommandPalette` "Suggested" group only — never blended into Pages/Signals.
- **See**: `18_AI_ENGINE.md` §3c.

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

#### `GET /api/alerts/rule-stats` (Next.js, `apps/web/app/api/alerts/rule-stats/route.ts`, new 2026-09-25, `f019cb9`)

- **Description**: Per-rule 14-day match-trend aggregation for the `/alerts` page's new trend chart under each rule's name. RLS-scoped `supabaseAuth` client, same as `/api/alert-rules`/`/api/alerts/recent`. Runs two column-only `alerts_sent` queries (`rule_id, signal_id, created_at` for the last 14 days; `rule_id, signal_id` all-time) rather than pulling full match/signal records just to count them, deduping by `signal_id` per rule/day server-side (one signal can produce multiple `alerts_sent` rows, one per delivery channel — matches how `matchesByRule` on the page itself already defines "a match"). Returns `{ stats: [{ ruleId, totalMatches, dailyCounts: [{date: "YYYY-MM-DD", count}] }] }` for every rule with at least one all-time match; the frontend gates a "not enough history yet" empty state when `totalMatches < 3` or the rule is `< 7` days old (`components/alerts/AlertRuleTrendChart.tsx`). No new table/column.

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

- **Description**: Public, no-auth aggregation of `signal_outcomes` — overall + per-asset `hit_rate`/`avg_move_when_correct`/`sample_size_note` (gated to `not_enough_history: true` below 20 scored predictions), a `volatile_neutral_summary` kept separate from `hit_rate`, and `date_range`. Reads only `checkpoint_hours = 48` (the worker also writes 1h/4h/24h rows; those are excluded unless a future prompt adds a time-horizon selector). Never live-recomputes against `commodity_prices` (90-day retention would erase history). Methodology: `docs/claude_project/17_SIGNAL_ENGINE.md` §7, D22 / ADR 018. Prerequisite #53; quality context #115. Endpoint contract: `docs/claude_project/05_API.md` §"Accuracy — GET /v1/accuracy".
- **Auth**: None.

---

### 2.5 API Keys & Developer Webhooks

#### `GET /api/api-keys` & `POST /api/api-keys`

- **Description**: Generates new enterprise `x-api-key` strings (`bb_live_...`).

#### `GET /api/webhooks` & `POST /api/webhooks`

- **Description**: Subscribes target HTTP endpoint to real-time signal dispatches.

#### `POST /api/discord/test` (Next.js, `apps/web/app/api/discord/test/route.ts`, 2026-09-12)

- **Description**: Authenticated one-off ping of a Discord incoming-webhook URL. Body `{ webhookUrl }`. Returns `{ ok: true }` or `{ ok: false, error }`. Rejects non-Discord hosts. Settings Test button uses this instead of posting from the browser. Alert *delivery* itself is `alert-dispatcher.ts` (`channel === "discord"`), not this route.

#### `POST /api/feedback` (Next.js, `apps/web/app/api/feedback/route.ts`, #155)

- **Description**: Authenticated Help-page feedback/bug report. Body `{ message, email?, pageContext? }`. Inserts into `feedback_submissions` with the caller's `user_id` (RLS own-row). Returns `{ ok: true }`. 401 if signed out. Not live chat. Not Resend.
