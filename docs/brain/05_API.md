# 05_API.md — Fastify REST API Architecture & OpenAPI Specifications

> **📍 Doc status — current as of 2026-09-26** for `/docs`, `sort=relevance`, the `sort=severity` ordering fix, and BFF-reads-Supabase. `claude/23_TODO.md` is not in this repo.
>
> ⚠️ UPDATED 2026-09-19 — Fastify Swagger UI at `/docs` is **not** public. It registers only when `NODE_ENV` is `development` or `test`. Production previously served unauthenticated OpenAPI at `https://api.bluebeaconresearch.com/docs`. Auth hook no longer skips `/docs` in production. Global rate limit remains `@fastify/rate-limit` 60/min in-memory (see `apps/backend/src/app.ts`).
>
> ⚠️ UPDATED 2026-09-13 (#138) — Fastify `/v1` unchanged. Next.js BFF `apiErrorLogged()` no longer forwards provider `.message` in the JSON `message` field (see `apps/web/lib/api-response.ts`).
>
> ⚠️ UPDATED 2026-09-28 (#216) — both `GET /api/signals` and `GET /api/signals/:id` now map a new `invalidationCondition` field (null-safe, same pattern as `marketMechanism`/`materialityReasoning`) from `signals.invalidation_condition`. Surfaced in the UI on the event detail Analysis tab only (ADR 032/D36).

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
  - `minSources` (`number`, optional, 2026-09-30): Min `sources_count` — `.gte("sources_count", minSources)`, same pattern as `severity`. Also added to Fastify `GET /v1/signals`'s zod `querySchema` (`apps/backend/src/routes/signals.ts`). Surfaced as a "Min sources" select in `FilterBar.tsx` (`FilterBarValue.minSources`, default `1` = no filtering), shared by the dashboard feed and the map.
  - `eventCategory` (`string`, optional, W2-FEEDUX/claude-278 4.2): one of the 9 `EventCategory` values (`EVENT_CATEGORY_VALUES`, `packages/shared`) or the literal `"uncategorized"`. `"uncategorized"` → `.is("event_category", null)`; a real category → `.eq("event_category", value)`; anything else unrecognized is silently ignored (same pattern as an invalid `window`), not a 400. Applied inside `buildFilteredQuery()` alongside `severity`/`minSources`/`region`, so it composes with every window/pagination branch unchanged — no change to the recency+severity ranking, the severity floor, or pagination. Also added to Fastify `GET /v1/signals`'s zod `querySchema` (`z.enum([...9 values, "uncategorized"])`, `apps/backend/src/routes/signals.ts` — that route hardcodes the 9 literals rather than importing `@blue-beacon-research/shared`, same reason `relevance-rank.ts` does, see that file's own note). Surfaced as `CategoryChips.tsx` on the dashboard only (`FilterBarValue.eventCategory`, default `null` = All); the map page carries the field (shared `FilterBarValue`) but never renders the chip row or sends the param. Required because classifier coverage on `event_category` is low today (roughly half of recent signals, almost none of the older ones) — "Uncategorized" is a real, expected filter state, not an edge case.
  - `commodity` (`string`, optional, e.g. `USOIL`): Target symbol.
  - `region` (`string`, optional, e.g. `Middle East`).
  - `window` (`string`, optional): signal lifecycle filter. Allowed values:
    - *(default, no `window` param)* → **2026-09-29 tiered feed-fill fallback, page 1 only**: tries `event_date >= 24h` first; if the candidate count (matching all other filters) is below `MIN_FEED_FILL` (12), re-queries at 72h, then 7d, and stops there — never widens past a week. Response gains `resolvedWindow: "24h" | "72h" | "7d"` (which tier actually got used) and `justIn: Signal[]` (top 5 of that same candidate set by `event_date` DESC, pure recency, ids excluded from `signals` so nothing double-counts) — both fields present only on this default path, omitted for every explicit `window` value below. **Beyond page 1 (2026-09-29, v0.125.0): the time cutoff no longer applies at all.** Pagination past page 1 draws from the full `is_active=true` + `severity`(param) set via a real DB keyset cursor on `(event_date, id)`, not this tiered window — see the `page` param row below. Supersedes the 2026-09-28 fixed-24h-cutoff behavior (previously: real `event_date >= 24h` cutoff, full stop; before that, `event_date >= 24h OR is_active = true`, an unbounded no-op since `is_active` is true on 100% of rows).
    - `latest` → same default tiered behavior described above (this value maps to the same unnamed-`window` branch).
    - `24h` → published within the last 24 hours only.
    - `7d` → published within the last 7 days.
    - `30d` → published within the last 30 days.
    - `all` → no date restriction at all (explicit "show everything").
    - `active` → currently active signals regardless of publish age (`is_active = true`, unaffected by the 2026-09-28 default-window fix).
  - `search` (`string`, optional, min 3 chars): `ilike` OR across `title`/`summary`/`country`/`event_type`. Previously undocumented — added here alongside `sort` below. **`mode=archive` restricts this to `title`/`summary` only.**
  - `sort` (`string`, optional, default `"severity"`): **2026-09-28** — `"severity"` (the default, and any unrecognized value) now goes through the same recency+severity blend as `"relevance"` (`relevanceRankScore`, `apps/web/lib/signal-relevance-rank.ts`) — a candidate set is fetched, re-ranked in application code, then paginated, replacing the previous pure `severity desc, created_at desc` DB order. This was itself a fix (2026-09-26, claude/229/86, commit `20e0050`) of an earlier bug where the default was actually `event_date desc, severity desc, created_at desc` (recency-first despite the name). `"newest"` (`event_date desc, created_at desc`) and `"confidence"` remain the two pure, non-blended orders. Archive mode always emits `event_date DESC, id DESC` regardless.
  - `mode` (`"archive"`, optional, 2026-09-29, v0.126.0): opt-in archive/search lookup used by `/archive`. **No severity floor** unless `severity` is also sent; **no recency/`window` cutoff**; optional `from`/`to` (`YYYY-MM-DD`, inclusive UTC day bounds on `event_date`); `search` is title/summary only. Pagination is a keyset cursor on `(event_date, id)` (`lib/signal-archive.ts` — opaque `page` token, `{d, id}` only, not the feed's `{d,id,t,n,j}` relevance cursor). Existing feed/`window`/`sort=newest` (watchlist) callers omit `mode` and are unchanged.
  - `from` / `to` (`YYYY-MM-DD`, optional, archive mode only): inclusive date range on `event_date`.
  - `limit` (`number`, default `50`, max `100`).
  - `offset` (`number`, default `0`).
  - `page` (default `1`): pagination token, semantics depend on the request. For an explicit `window` value, or `sort=newest`/`sort=confidence`, it's a plain page number (`.range()`-based), and `nextCursor` in the response is `String(page+1)` or `null`, exactly as before. For the **default (no `window`) relevance-sorted view specifically (2026-09-29, v0.125.0)**, page 1 ignores this param (always the tiered fallback above); every page after that, `page` is instead an **opaque cursor** — a base64url-encoded `{d, id, t, n, j}` (`FeedCursor` in `route.ts`: keyset position, reference "now" snapshot, cumulative-shown count, "Just In" ids to skip) that the client must pass back verbatim from the previous response's `nextCursor`, never construct itself. `total`/`hasMore` on this path reflect the real unrestricted `is_active`+severity count, not the tiered window's. New `oldestEventDate` (string ISO, or omitted) — present only once this path's cursor pagination has genuinely exhausted the matching set, for an honest "reached the earliest signal on record" UI state instead of implying there's no more news.
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

**Notes**: In degraded or rate-limited scenarios `/api/signals` may return the last-known payload with additional non-breaking fields: `fallback` (boolean), `fallbackReason` (string), and `fallbackLastUpdated` (ISO timestamp). The server also sets header `x-signals-feed-status: degraded` when serving cached/fallback data. On the default (no `window` param) path only, the payload also carries `resolvedWindow` and `justIn` (see the `window` param row above); `apps/web/hooks/useSignalFeed.ts` re-prepends `justIn` onto `liveSignals` for callers that just want one flat, no-duplicate list, and exposes both fields separately for callers (e.g. the dashboard's featured-card pick and its "still expanding" banner) that want the split.

#### `GET /api/signals/:id`

- **Description**: Fetches granular single signal details and raw news source references.
- **Auth**: Required.
- **Consumers**: Event Deep-Dive page (`/events/[id]`).
> ⚠️ UPDATED 2026-09-25 — response gains two fields, both bundled into the same payload (no separate round-trip, consistent with `historicalComparisons`/`pricesAtSignal` already living here): `sources` is now ordered oldest-first (`event_date` ?? parsed `raw_data.seendate` ?? `created_at`) and each entry carries `domain` (`raw_data.domain`) — powers the renamed "timeline" tab. New `relatedEvents[]`: other `signals` sharing this row's `country` AND at least one `commodity_impacts[].asset`, `event_date` within a placeholder 7 days *of this event's own `event_date`* (not wall-clock now — an old event must still be able to show related events), excluding anything already folded into this signal's own `raw_event_ids`. Each entry carries a `reinforcing`/`conflicting`/`mixed` label from comparing `direction` per shared asset — no numeric relevance score. Both windows/thresholds are explicitly placeholders (see `apps/web/app/api/signals/[id]/route.ts` comments, `04_DATABASE.md`).
> ⚠️ UPDATED 2026-09-26 (market-impact magnitude/time-horizon) — response gains `marketImpactMagnitudes: Record<asset, {magnitude: {medianMovePct, sampleSize} | null, timeHorizonLabel: "within hours" | "within a day" | "multi-day" | null}>`, one entry per asset named in `commodityImpacts`/`currencyPairImpacts`. Computed from `signal_outcomes` (paginated with `.range()` in `OUTCOME_ROWS_PAGE_SIZE = 1000` batches — a single unranged `.select()` silently truncates at PostgREST's max-rows and undercounts every asset, since e.g. USOIL alone has 4,900+ outcome rows across its 4 checkpoints). `magnitude` is the median of `|actual_pct_change|` at the 24h checkpoint, gated at the same `MIN_SAMPLE_SIZE = 20` as `/v1/accuracy` (`apps/backend/src/routes/accuracy.routes.ts`) — null below the gate. `timeHorizonLabel` separately finds whichever of the 1h/4h/24h/48h checkpoints has the largest median move among checkpoints that individually clear the gate. Pure aggregation lives in `apps/web/lib/market-impact-assessment.ts` (`computeMarketImpactMagnitude`, `deriveTimeHorizonLabel`) so it's unit-testable without a DB call; only the fetch itself is server-only (route handler), not exposed as a client-callable lib function.

> ⚠️ UPDATED 2026-09-27 (Phase 2 of #227 — historical-pattern chart) — each `marketImpactMagnitudes[asset]` entry gains `checkpoints: {checkpointHours, medianMovePct, sampleSize}[]` — one point per 1h/4h/24h/48h checkpoint that individually clears `MIN_SAMPLE_SIZE`, omitted (not zeroed) otherwise. **No new query**: computed from the same in-memory `rows` array the route already pages in for the 24h `magnitude`/`timeHorizonLabel` fields above. New pure `computeMarketImpactCheckpoints(rows, asset, minSampleSize)` in `market-impact-assessment.ts` calls the existing `computeMarketImpactMagnitude()` once per checkpoint. Consumed by the new `MarketImpactChart.tsx` — see `06_COMPONENTS.md` §3.3b.

> ⚠️ UPDATED 2026-10-10 (`3dc96e6`) — each `marketImpactMagnitudes[asset]` entry gains `baselines: WindowMoveBaseline[]` (`{windowHours, medianMovePct, windowCount, eventRowsMatched, spanDays}`, one per 1h/4h/24h/48h window that clears `MARKET_IMPACT_MIN_SAMPLE_SIZE`, omitted otherwise). Computed by new `apps/web/lib/price-baseline-server.ts`'s `fetchMatchedBaselines(supabase, assets, outcomeRows)`, called once per route from the `signal_outcomes` rows the route already fetched (no duplicate `signal_outcomes` query). It reads `commodity_prices` per asset (`fetchAllRangedRows`, 90-day retention), builds hourly windows (`apps/web/lib/price-baseline.ts`'s `buildHourlyWindows`), and weighted-medians them against the asset's matching tracked-signal event-start hours (`computeMatchedWindowBaseline`) — the hourly-window build is cached 60 minutes per asset+window-length (not the final baseline, since the matching event rows differ per caller). `fetchSignalOutcomeRows` (`signal-outcomes-server.ts`) now also embeds `signals.event_date` via the `signal_outcomes.signal_id` FK (`asset, checkpoint_hours, actual_pct_change, signals(event_date)`) so this matching needs no second query.

#### `GET /api/market-impact` (new, 2026-09-27 — #227 calendar integration)

- **Description**: Asset-level counterpart to `GET /api/signals/:id`'s per-signal `marketImpactMagnitudes` block, for surfaces that want "how has [asset] historically moved" without a specific signal in hand — first consumer is the Economic Calendar (`/calendar`). Query param `assets` (comma-separated, e.g. `?assets=USOIL,UKOIL,WHEAT,CORN`) → `{ magnitudes: Record<asset, { magnitude, timeHorizonLabel, checkpoints, baselines }> }`, same shape as the per-signal block (`baselines` added 2026-10-10, `3dc96e6` — see above). **No new query logic**: the `signal_outcomes` `.range()` paging loop was extracted out of `signals/[id]/route.ts` into a shared `fetchSignalOutcomeRows()` in new `apps/web/lib/signal-outcomes-server.ts`; both routes call it, then the same `computeMarketImpactMagnitude`/`deriveTimeHorizonLabel`/`computeMarketImpactCheckpoints`/`fetchMatchedBaselines` from `market-impact-assessment.ts` / `price-baseline-server.ts`.
- **Auth**: Same policy as `signals/:id` — required in production, open in dev.
- **Consumers**: `/calendar` (`CalendarPage`) — see `06_COMPONENTS.md` §3.10.

#### `GET /api/signals/:id/chat` and `POST /api/signals/:id/chat` (#111, `9f2aada` web / `dcdc877` Fastify)

- **Description**: Per-signal follow-up chat, grounded **only** in that signal's own data. Next.js BFF at `apps/web/app/api/signals/[id]/chat/route.ts` resolves the caller's Supabase session and forwards `Authorization: Bearer` to Fastify `GET|POST /v1/signals/:id/chat`. The panel never talks to Fastify from the browser.
- **Auth**: Required. Fastify gates GET+POST with `CHAT_ALLOWED_EMAILS` (`403 chat_early_access_only`, fail closed if unset). POST then: existing `403 premium_required` if `planTier === "free"` (currently a no-op — signups hardcode `pro`); `429 rate_limited` after 30 user messages / 24h (fails closed on count error); `429 rate_limited_burst` after 5 / 5 min; `503 ai_temporarily_unavailable` with a distinct `message` when the chat daily budget is spent, or without it when the model is down.
- **POST body**: `{ "message": string }` → `{ "reply": string }` (assistant text may include a `---SOURCES---` block of handed URLs). **GET** (paging added AUDIT_276/W5-PAGE-BACKEND): query params `limit` (default 50, max 100) and `before` (cursor — an earlier page's oldest `created_at`, for "Load older messages" in `SignalChatPanel`); no params returns the most recent `limit` messages. Returns `{ "data": [{ id, role, content, created_at }], "hasMore": boolean, "nextBefore": string | null }`, oldest first within the page.
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

#### `GET /api/signals/attribution` (#207/#228 chart attribution, Phase 1 — 2026-09-26; result count + floor revised 2026-09-27; Phase 2 backfill fallback added 2026-09-28)

- **Description**: "What happened around this time" — given one chart point, returns up to 10 dated signals from the 7-day window before it, ranked but not singled out as "the" cause. Next.js route (`apps/web/app/api/signals/attribution/route.ts`). DB-first lookup is unchanged (no LLM call on that path). **New 2026-09-28**: when the DB-first lookup returns zero results, this route now calls Fastify `GET /v1/signals/attribution-backfill` (see below) — a real Fastify route was added for this specific fallback, unlike the DB-first path, because it needs to run a classifier call + a write through the ingestion path, not a plain Supabase read.
- **Auth**: Same pattern as `/api/signals` — required in production, allowed unauthenticated in local/dev.
- **Query Params** (all required):
  - `asset` (`string`): ticker, e.g. `USOIL`. Validated `^[A-Z0-9]+$`.
  - `timestamp` (`string`, ISO 8601): the chart point's own timestamp.
  - `direction` (`"up"` | `"down"` | `"volatile"`): the move's direction at that point (frontend computes this from the adjacent chart point's pct change, `directionAtIndex()` in `watchlist/[symbol]/page.tsx`, ≥3% → `volatile`).
- **Query shape**: `signals` where `event_date <= timestamp AND event_date >= timestamp - 7d`, and where `commodity_impacts`/`currency_pair_impacts` contains `asset` **OR** `event_category IS NOT NULL` (candidate-widening — see qualifying floor below).
- **Scoring** (in application code, not SQL, unchanged): direct asset match = **3**, direction match on that asset's own impact entry = **2**, recency = **2 × (1 − hoursBefore / 168)** (linear decay across the 7-day window), severity = **severity/10 × 1**. Max 8. Used only to rank/order candidates now, not to gate them.
- **Qualifying floor (revised 2026-09-27, replaces the old `MIN_SCORE = 3` gate)**: same asset **OR** same region as the clicked instrument, within the window already enforced above. An asset like `USOIL` has no stored region of its own, so "same region" is inferred per-request: the region(s) of this window's actual asset-matched signals become the instrument's region set; a candidate without a direct asset tag qualifies if its own `region` is in that set. This intentionally removed the old "asset match + at least one other scoring factor" requirement, which was silently excluding real, dated, same-region high-severity events — founder framing: prefer a slightly-too-broad list over hiding a real event, since the copy no longer implies any one item is more likely the cause.
- **Response `200 OK`**: `{ "results": [{ "id", "title", "eventDate", "hoursBefore", "severity", "backfilled"? }] }` — top 10 by score on the DB-first path (was top 3), empty array if nothing clears the floor and the Phase 2 fallback also finds nothing. `severity` added to the response 2026-09-27 (frontend now displays it per result). No score is returned to the client (ranking-internal only). `backfilled: true` is present only on a Phase 2 result.
- **Consumers**: `WatchlistSymbolPage` chart attribution panel only.
- **Rendering contract** (frontend, not this endpoint): a header line above the list — "News from the 7 days before this move, shown by severity — not a claim that any single one caused it." — then each result → title + "N hours/days before this move · Severity N" + link to `/events/[id]`, equal visual weight, with the fixed line "Time-window observation only — not a claim that this event caused the move." beneath the list. Empty `results` → "No clearly related event found in BBR's tracked history for this window." (unchanged, still shown after both the DB-first AND Phase 2 fallback come back empty). Trigger hint copy is "What happened around this time". `data-testid="chart-attribution-result"` on a DB-first row, `data-testid="chart-attribution-backfilled"` on a Phase 2 row — same visual treatment, different testid only, so the two are distinguishable in a live re-check without re-reading code.
- **Phase 2 fallback (2026-09-28, #207/#228 Phase 2)**: only runs when DB-first returns zero results, and only for a signed-in user. Rate-limited per user via the existing `rateLimitOrPass` helper (5 requests / 3600s, key `signals-attribution-backfill:<userId>`) — on a rate-limit hit or any upstream failure, silently falls back to the same empty-DB-first response, never a 429/500 to the browser. Forwards the caller's Supabase session as `Authorization: Bearer` to Fastify `GET /v1/signals/attribution-backfill?asset=&timestamp=` (`process.env.API_URL`), same proxy pattern as `/api/signals/:id/chat`.

#### `GET /v1/signals/attribution-backfill` (Fastify, #207/#228 Phase 2 — 2026-09-28)

- **Description**: Given `{ asset, timestamp }`, queries GDELT's own historical DOC 2.0 archive (`STARTDATETIME`/`ENDDATETIME`, the same 7-day lookback as the DB-first path) scoped to the asset's plain-English display name (from `commodities.ts`'s `COMMODITIES` list) OR'd with its raw ticker, since GDELT indexes article text, not tickers. Classifies the top 3–5 candidates by proximity to the clicked timestamp with the existing `ClaudeService.classifyEvent()` (same prompt/model the live collectors use — no new prompt written), discards anything the classifier doesn't tag with the requested asset in `commodityImpacts`/`currencyPairImpacts`, and writes each survivor through the normal `raw_events` → materiality gate → `signals` path (`insertOrMergeSignal`, `freshness: "cached"`, `isBackfilled: true`). Implementation: `apps/backend/src/services/chart-attribution-backfill.service.ts`, registered at `apps/backend/src/routes/signal-attribution-backfill.routes.ts`.
- **Auth**: Standard `requireUser` (global preHandler) — same as every other `/v1/signals/*` route. Only ever called server-to-server from the Next.js route above, never directly from the browser.
- **Query Params**: `asset` (`^[A-Z0-9]+$`), `timestamp` (ISO 8601) — both required, `400` if missing/invalid.
- **Response `200 OK`**: `{ "results": [{ "id", "title", "eventDate", "hoursBefore", "severity", "backfilled": true }] }`, sorted by severity descending to match the frontend's "shown by severity" copy. Empty array on no GDELT hits, no classifier-confirmed-relevant hits, or any upstream error (never a 4xx/5xx to the caller on a GDELT/Anthropic failure — logged via `recordServiceHealth` instead).
- **Cost/write path notes**: `raw_events.source = 'chart-attribution-backfill'` (new CHECK constraint value) and `signals.is_backfilled boolean default false` (new column) — see `04_DATABASE.md` and migration `20260928120000_signals_is_backfilled_and_attribution_backfill_source.sql`. `classifyEvent()` draws from the **ingestion** Anthropic budget bucket, not `chat` — it's hardcoded that way inside `claude.service.ts` regardless of caller, so a burst of chart-attribution clicks competes with the cron collectors' daily ingestion cap, not the per-user chat cap. A backfilled "new" signal deliberately does NOT call `dispatchAlertsForSignal` — see ADR 030 / D34 in `10_DECISIONS.md`.
- **GDELT archive limit**: DOC 2.0 only searches its own rolling ~3-month archive. BBR's `signals` table currently spans 2026-08-09 → 2026-09-25, comfortably inside that window today — noted as a known future limit, not solved by this change.
- **Not verified live this ship**: the DB migration adding `is_backfilled`/the new source CHECK value was written but **not yet applied** — Claude Code's own production-deploy safety gate denied the `apply_migration` MCP call in this session (same gate that blocked `user_sessions`, see `16_MIGRATION_CHECKLIST.md`). Until a human applies it, any real GDELT hit's `raw_events`/`signals` insert will fail (constraint violation / unknown column) and this endpoint will silently return `results: []` — behaviorally identical to "nothing found," not a visible error, but the actual backfill won't produce results until the migration lands. Type-checked and unit-tested clean (`pnpm type-check` + `pnpm test`, both apps); GDELT query construction was not exercised against the live API in this session — outbound network calls were also blocked by the same sandbox gate.

---

#### `GET /api/signals/driver-breakdown` (Next.js route, doc 278 Part A, 2026-10-01)

- **Description**: Powers the watchlist symbol page's stacked-area "Signal Drivers" chart. Given `{ symbol, from, to }` (ISO timestamps), pages `signals` with `.range()` (1,000-row PostgREST cap — USOIL alone exceeds it in wide windows) filtered on `commodity_impacts`/`currency_pair_impacts` containing the asset (same `.filter(col, "cs", '[{"asset":"X"}]')` pattern as `/api/signals/attribution`; `.contains()` was tried first and silently returned zero rows — do not reuse it here), then groups in-process by UTC day (`event_date ?? created_at`, sliced to `YYYY-MM-DD`) and `event_category`.
- **Symbol routing**: commodity symbols (in `COMMODITIES`) match `commodity_impacts` only. Forex symbols (in `FOREX_PAIRS`) query **both** `currency_pair_impacts` and `commodity_impacts` and merge/de-dupe the two row-sets by signal `id` (`apps/web/lib/driver-breakdown.ts`'s `mergeSignalRows`) — fixed 2026-10-01: a forex pair can be tagged in both columns (verified live, EURUSD: 248 rows in `commodity_impacts` vs 39 in `currency_pair_impacts`, union 287, zero overlap today), so the original single-column (`currency_pair_impacts`-only) query undercounted every forex symbol. `400` on an unknown symbol.
- **Response `200 OK`**: `{ "rows": [{ "date", "category", "count" }], "total": number }`. `category` is one of the 9 real `EventCategory` values or the literal `"uncategorized"` for `event_category IS NULL`. Empty `rows`/`total: 0` for a zero-signal instrument (confirmed live for COPPER, XAGUSD) — not an error.
- **Failure response (2026-10-01, extended 2026-10-02)**: a rate-limit or DB error now returns `{ "rows": [], "error": "rate_limited" | "db_error" }`; the no-Supabase-client and unauthenticated-in-production early returns, which previously gave a bare `{ rows: [] }` with no error flag (indistinguishable from a genuine zero-signal instrument), now also carry `error: "unavailable"` and `error: "unauthenticated"` respectively. All four are still `200 OK`, so existing callers that only read `rows` don't break. `DriverBreakdownChart.tsx`'s `useQuery` throws when `error` is present (react-query `retry: 2`) and renders a distinct failure state — "Sign in to see driver data." for `unauthenticated`, "Couldn't load driver data. Try again." (with a "Retry" button calling `refetch()`) for the other three — instead of caching the response as a success; the honest empty-state copy is reserved for a real `total: 0`.
- **`event_category` data quality note** (found while building this): ~98% of USOIL's 1,276-signal window has `event_category IS NULL` even for signals created well after the 2026-09-13 materiality-gate migration (`20260913160000_signals_materiality_gate.sql`) that added the column — it is not purely a pre-migration artifact, some post-gate classifications still don't set it. The frontend treats this as an honest "Uncategorized" bucket, not dropped or silently merged into `other_market_relevant`.
- **Frontend bucket cap**: `DriverBreakdownChart.tsx` renders at most the top-7 real categories (by count in the window) with their own color, folds any remaining real categories into a single "Other" series, and always gives "Uncategorized" its own entry when present — total ≤ 8 categorical colors + 1 gray, per the dataviz skill's fixed-8-hue categorical limit. See the component's own comments for the exact rule.
- **Rate limit**: `rateLimitOrPass('signals-driver-breakdown:<ip>')`, same pattern as the other `/api/signals/*` routes — soft-fails to `{ rows: [], error: "rate_limited" }` rather than a 429.
- **Auth**: same as `/api/signals/attribution` — unauthenticated allowed outside production.
- **Not a new Fastify/backend route** — implemented entirely in `apps/web` (queries Supabase directly), matching `/api/signals/attribution`'s existing pattern; no `apps/backend` change was needed.

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

> ⚠️ UPDATED 2026-10-02 (PERS-Pn) — `alerts_sent` gains a nullable `match_reason jsonb`
> column (migration written, **not yet applied to the live DB** — see
> `16_MIGRATION_CHECKLIST.md`). `GET /api/alerts/recent`'s existing
> `select("*", ...)` on `alerts_sent` already carries it through with no route code
> change — only a clarifying comment was added. `dispatchAlertsForSignal()` writes
> `{ tier: 1|2|3, matched: { watchlist?, commodity?, region?, forex?: string[] } }`
> per matched rule (tier 1 = signal asset on `user_preferences.watchlist_symbols`,
> tier 2 = commodity/forex AND region both matched, tier 3 = only one matched;
> display/ordering only, never affects whether an alert was sent). The same reason
> is rendered as one plain line in `buildAlertBody()`'s chat delivery and on the
> `/alerts` page card. **Deployment-order note:** the backend's `alerts_sent` insert
> does not check for an error, so deploying this code before the migration is
> applied would silently stop every `alerts_sent` row from being written (not just
> `match_reason`) — see `16_MIGRATION_CHECKLIST.md`.

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

#### `POST /api/auth/register-session` (Next.js, `apps/web/app/api/auth/register-session/route.ts`, fresh task, no ticket number, 2026-09-27)

- **Description**: Session-cap bookkeeping, called right after a successful password login (also inlined server-side in `auth/callback/route.ts` for Google OAuth). Decodes the `session_id` claim from the caller's JWT, derives a `device_label` from `User-Agent`, deletes any of that user's `user_sessions` rows older than 30 days, evicts the single oldest row if the user is already at `MAX_SESSIONS_PER_USER` (2), then inserts the new row. 401 if signed out; otherwise always `{ ok: true|false }` — never blocks login on failure. Eviction is row-only (see Table 18e, `04_DATABASE.md`) — it cannot force-revoke the evicted session's already-issued JWT. **`user_sessions` migration not yet applied to the live DB** — this route's writes currently fail silently until it is (see `16_MIGRATION_CHECKLIST.md`).
