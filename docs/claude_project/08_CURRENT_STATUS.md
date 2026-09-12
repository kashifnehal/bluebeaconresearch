# 08_CURRENT_STATUS.md — Repository Status & System Audit Matrix

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.
>
> ⚠️ UPDATED 2026-08-27 — Several fixes landed this session (GDELT/GNews ingestion-time geocoding, `commodity_impacts` classification bug + partial backfill, Sonnet briefing error logging/retry, signal-generation dormant-queue doc correction) plus a Telegram connect-flow gap found (not yet fixed). Per this doc's own policy, full detail lives in `docs/brain/08_CURRENT_STATUS.md` §5 and `docs/brain/14_CHANGELOG.md` v0.30.0 — not duplicated here.
>
> ⚠️ UPDATED 2026-09-07 — Personalization (#81), watchlist preference-awareness (#89), the Alerts four-section reframe + Telegram template (#82), and the personalized daily digest (#83) all shipped. `user_preferences` gained `onboarding_completed_at`/`created_at`/`digest_enabled` (+ reserved forex/equity columns). New backend worker `digest-sender.ts` on a daily `node-cron`. Full detail: `docs/brain/14_CHANGELOG.md` v0.34.0, `docs/claude_project/14_CHANGELOG.md` PHASE 8, `docs/brain/LIVE_TODO.md`.
>
> ⚠️ UPDATED 2026-09-07 (later same day) — The economic calendar (#86) also shipped: new `/calendar` page on a static, manually-curated data file (deliberate v1, not a live paid API). Separately, the #83 digest **production cron path is now fully end-to-end confirmed** (not just "key is live"): a one-off prod verification (no code change) temporarily pointed `DIGEST_CRON` at a near-term time and the deployed `workers` service's own cron callback ran `runDigestOnce()`, delivering a real personalized email via the Railway `RESEND_API_KEY` (Resend id `ffc24290-8ad1-4338-ac15-9c24707f60a1`, status delivered, distinct from the earlier manual test send). `DIGEST_CRON` was reset to `0 6 * * *`. Full detail: `docs/brain/14_CHANGELOG.md` v0.35.0, `docs/brain/LIVE_TODO.md` (#83).

> ⚠️ UPDATED 2026-09-09 — #87 forex pair taxonomy **phase 1 of 3 (schema + classifier + price sync) shipped**, commit `a15e2fd`, backend-only. New additive `signals.currency_pair_impacts jsonb` column (migration `20260909035949_forex_pair_impacts.sql`). `claude.service.ts` gains `ALLOWED_FOREX_PAIRS` (EURUSD|GBPUSD|USDJPY|USDCHF|USDRUB|USDCNY), forex alias map + `normalizeForexPair()` + `sanitizeForexImpacts()`, and a `currencyPairImpacts` field in the Claude prompt/`ClassificationResult`; EURUSD/USDRUB were **removed** from `ALLOWED_COMMODITY_ASSETS` (a long-standing mislabeling — historical `commodity_impacts` rows left as-is, not backfilled). Heuristic fallback covers USDRUB (Russia+sanctions) and USDCNY (China+tariff/Taiwan) only; the other 4 pairs are AI-only on that path. `price-syncer.ts` now also syncs 6 Yahoo `<PAIR>=X` forex tickers into `commodity_prices` (all 6 verified live, incl. USDRUB=X/USDCNY=X). Verified via information_schema, a real Claude classification (USDRUB landed in `currency_pair_impacts`, not `commodity_impacts`), a forced `heuristicClassify()` run, and a real `runPriceSyncOnce()` (non-null prices for all 6). **Phases 2 (onboarding/watchlist UI) and 3 (alert_rules/dispatcher/digest) not started.** ~~Known gap: only the dormant `ai-classifier.ts` insert path was wired.~~ **Phase 1B (commit `abb2004`, 2026-09-09) closed that gap** — `currency_pair_impacts` is now written by the three live signal-creation inserts (`signal-merge.ts` `insertOrMergeSignal()` for rss/gnews/gdelt, `reconciliation.ts`, `acled-collector.ts`), with ADR 010 merge semantics preserved (impacts written once at row creation, never rewritten on a duplicate/escalation merge — same as `commodity_impacts` always has). Verified end-to-end: a real Russia-sanctions classification through the live path stores a `signals` row matchable by the same jsonb-contains operator production commodity matching uses. Full detail: `docs/brain/LIVE_TODO.md` (#87), `docs/brain/14_CHANGELOG.md` v0.36.0 + v0.36.1.

> ⚠️ UPDATED 2026-09-09 (later) — #87 **phase 2 of 3 (onboarding, feed filter, watchlist) shipped**, commit `55df380`, `apps/web` + `packages/shared` only. Wires the previously-unused `user_preferences.forex_pairs` column into the *existing* #81/#89 mechanisms — no second onboarding flow, no new feed-filter param, no separate watchlist toggle. New `FOREX_PAIRS` shared constant (same 6 pairs). `/onboarding` step 2 gains a "Currency pairs you follow" chip list (same helpers as commodities); `forex_pairs` added to the prefs upsert — **and that upsert's missing `onConflict: "user_id"` was fixed**, a latent bug that made it 409 and silently drop *all* captured preferences for any user who already had a `user_preferences` row. `/api/signals?personalized=true` now also matches `currency_pair_impacts` containment for each preferred pair, folded into the same single OR filter, and returns `currencyPairImpacts` in the payload. `/watchlist` seeds its "My Commodities"/"Show All" default from `commodities ∪ forex_pairs` and lists all 13 assets; `/api/prices` Tier-2 fallback list widened (Tier 1 already returned forex). Verified with Playwright + SQL: onboarding wrote `forex_pairs=["EURUSD","USDCHF"]`; personalized feed with only those prefs returned exactly the matching signal and toggling off restored the full feed; watchlist showed both pairs with live prices and the toggle round-tripped. ~~Known limitation (out of scope): the `/watchlist/[symbol]` drill-down still keys off commodities only.~~ **Closed 2026-09-09 in #87 phase 4 (`accd468`)** — drill-down now resolves `FOREX_PAIRS`, checks `forexPairs` for "You follow this", and fetches correlated signals via a new `?forexPair=` param on `/api/signals`. Full detail: `docs/brain/LIVE_TODO.md` (#87), `docs/brain/14_CHANGELOG.md` v0.36.2 / v0.36.4.

> ⚠️ UPDATED 2026-09-09 (later still) — #87 **phase 3 of 3 (alert rules, dispatcher, digest) shipped**, commit `a102e68`. New additive `alert_rules.forex_pairs text[]` column (migration `20260909044602_alert_rules_forex_pairs.sql`), mirroring `alert_rules.commodities`; `min_severity`'s conservative default untouched. The alert dispatcher matches a rule when its `forex_pairs` overlap a signal's `currency_pair_impacts`, OR'd with the existing commodity match (a rule with neither list set is still not instrument-filtered); the Telegram/Slack/in-app "Which instruments" line now lists forex pairs alongside commodities. The daily digest folds each followed pair into the same single containment `OR` against `currency_pair_impacts`, credits forex hits in the "matched" reason, and its copy now reads "the regions, commodities, and forex pairs you follow". The create-rule modal on `/alerts` and each event page gained a 6-pair multi-select (persists `forex_pairs`); rule cards show a "Forex:" line; the Alerts page renders currency-pair chips in "Which instruments"; `/api/alerts/recent` joins `currency_pair_impacts`. No `equity_tickers` — equity stays gated (ADR 013 / D17). Verified per the alerts/digest delivery standard: a forex-only rule (no regions, no commodities, `forex_pairs=["EURUSD"]`) produced a **real Telegram message** whose "Which instruments" line showed `EURUSD ↓ · USDJPY ↑ · USDCHF ↑`, with the two pre-existing rules paused so the forex rule was provably the sole match; a forex-only digest preference selected exactly the matching signal and rendered "forex pairs" + "EURUSD" into text and HTML; Playwright confirmed the Alerts card renders currency-pair chips and the new modal multi-select round-tripped `["EURUSD","USDJPY"]` through the DB. Full detail: `docs/brain/14_CHANGELOG.md` v0.36.3, `docs/claude_project/14_CHANGELOG.md` PHASE 9.

> ⚠️ UPDATED 2026-09-11 — Docs sync only (no application code): D19 / ADR 015 recorded; #104–#128 parked as plans/research in `docs/brain/LIVE_TODO.md` (none marked done; #129 left unmarked); repo-root `AGENTS.md` + `.cursor/mcp.json` added for Cursor Pro. Live Supabase project ref confirmed as `evavcgfmemwryggdkjmx`. Full detail: `docs/brain/14_CHANGELOG.md` v0.38.0, `docs/claude_project/14_CHANGELOG.md` PHASE 10.

> ⚠️ UPDATED 2026-09-11 (later same day) — tonight's product batch shipped: #105 map popup, #107 watchlist seed (+ prefs persist), #108 backtesting auto-apply, #116 auth-timeout middleware, #119 welcome tour step, #120 plain-language briefings, #122/#123 quick-view slide-over, #124/#125 shared FilterBar + desk chips, #126 freshness/coverage, #127 calendar filters (map layers still gated). Do not duplicate verification here — per-commit evidence is in `docs/brain/LIVE_TODO.md`. Brain changelog: `docs/brain/14_CHANGELOG.md` v0.39.0–v0.43.0. This tree: PHASE 11.

> ⚠️ UPDATED 2026-09-11 (later still) — #111 **backend half shipped** (`apps/backend` only; frontend chat panel still open). New `GET/POST /v1/signals/:id/chat`, `ClaudeService.chatAboutSignal()` (same `claude-sonnet-5` model + buy/sell-refusal wording as #120's `generateAnalysis()`, plus refusal of personalized position-advice questions), new `signal_chat_messages` table + RLS, plan-tier gate (`403 premium_required`) and a 30-msg/24h per-user counter (`429 rate_limited`). Verified live on the standing test account: grounded on-topic answer + correct refusal of a personalized-position question, both turns confirmed written to and removed from the DB. Full detail: `docs/brain/14_CHANGELOG.md` v0.46.0, `docs/claude_project/14_CHANGELOG.md` PHASE 12, `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-09-11 (later still) — #111 **frontend half shipped — feature now fully complete end-to-end.** New `SignalChatPanel` component wired into the event detail page below the existing Full Analyst Briefing section (untouched); same-origin `/api/signals/[id]/chat` proxy routes forward the caller's Supabase session to the backend, same pattern as `api/telegram/connect-code`. Playwright-verified on the standing test account: empty state, a real grounded reply, the always-visible disclaimer, and — reloading the page — the same conversation persisted (proves backend-backed, not local state). Also found and worked around an unrelated Next.js 16 Turbopack dev-mode bug (hydration never completes when the dev server is reached via `127.0.0.1` instead of `localhost`, because Chromium's Origin header on the HMR WebSocket gets treated as cross-origin) — noted for future local Playwright runs, no app code changed for it. Full detail: `docs/brain/14_CHANGELOG.md` v0.47.0, `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-09-11 (#106) — 5-year historical watchlist chart shipped: on-demand Yahoo `chart()` weekly bars, in-memory 15-minute cache, second panel on `/watchlist/[symbol]`. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: `docs/brain/14_CHANGELOG.md` v0.44.0. This tree: PHASE 12.

> ⚠️ UPDATED 2026-09-11 (docs hygiene) — remaining markdown citations of an unused Supabase project ref were purged. Live project remains `evavcgfmemwryggdkjmx`. No code/config contained the unused ref. Brain changelog: `docs/brain/14_CHANGELOG.md` v0.45.0. This tree: PHASE 13.

> ⚠️ UPDATED 2026-09-11 (#53) — historical `commodity_impacts` backfill ran via one-time `classifyEvent()` script. Before 767 filled / 2,057 empty; after 1,634 filled / 1,195 empty. 201 rows left because Anthropic credit exhausted (live pipeline back on heuristic fallback until restored). Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: `docs/brain/14_CHANGELOG.md` v0.48.0. This tree: PHASE 14.
>
> ⚠️ UPDATED 2026-09-11 (#121 backend half) — new table `signal_outcomes` (public read, service-role write) + daily worker `outcome-tracker.ts` permanently record predicted-vs-actual commodity direction 48h after each signal, backing a future `/accuracy` page without live-recomputing against the 90-day-retained `commodity_prices` table. Backfilled to 2,965 rows against production; caught and fixed a bug where legacy pre-#87 EURUSD/USDRUB commodity_impacts entries (no forex price history before 2026-09-09) were clamping to a distant price and fabricating false "flat" outcomes. Frontend `/accuracy` page shipped 2026-09-11, see below. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: `docs/brain/14_CHANGELOG.md` v0.49.0. This tree: PHASE 15.

> ⚠️ UPDATED 2026-09-11 (#121 frontend half — **fully shipped**) — new public `GET /v1/accuracy` aggregates `signal_outcomes` into overall + per-asset hit rate / avg move when correct / sample size (never one without the others), a `volatile_neutral_summary` kept separate from hit rate, and a date range; per-asset rows below 20 scored predictions show "not enough history yet" instead of a misleading percentage. New public `/accuracy` page renders all of it together, plus a permanent past-performance disclaimer, with deliberately no "top signals"/"best calls" list. Found and fixed a real bug during verification: Supabase `.in()` filters throw `TypeError: fetch failed` past ~400 real UUIDs (a URL-length limit, not flakiness) — this had also silently broken part of `outcome-tracker.ts`'s existing-outcomes lookup; both now chunk at 200. Verified: real numbers from production (`evavcgfmemwryggdkjmx`) match a hand-run SQL check for USOIL exactly. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: `docs/brain/14_CHANGELOG.md` v0.50.0. This tree: PHASE 16.

> ⚠️ UPDATED 2026-09-12 (reliability/trust fixes, `apps/backend` only) — direct production investigation found `heuristicClassify()` assigning severity 8/9 on bare keyword matches with no relevance judgment (real examples: an Oregon military-radar-site permitting story scored 8 on "military"; a personal Navy memoir scored 9 on "war"). Fixed: (1) heuristic severity hard-capped at 6 — 7/8/9 now only ever come from a real Claude classification; (2) new `signals.classification_method` column (`claude`|`heuristic`) set going forward by `classifyEvent()`, surfaced in the signals API responses, with a best-effort historical backfill (confidence-pattern match, separately flagged `classification_method_inferred`, not an authoritative reclassification); (3) Claude/Anthropic API calls now logged to `service_health_events` (previously untracked — only ingestion sources were); (4) `POST /v1/signals/:id/chat` now wraps `chatAboutSignal()` in try/catch, returning `503 ai_temporarily_unavailable` instead of a generic 500 on an unexpected error. See ADR 016 / D20 in `10_DECISIONS.md`. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: `docs/brain/14_CHANGELOG.md` v0.51.0. This tree: PHASE 17.

> ⚠️ UPDATED 2026-09-12 (later, `apps/web`) — SignalChatPanel visual/layout pass: contrast/type-size/composer wrapping, a heuristic auto-classified note, and specific copy for `503 ai_temporarily_unavailable`. Same component and backend contract. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: `docs/brain/14_CHANGELOG.md` v0.52.0. This tree: PHASE 18.

> ⚠️ UPDATED 2026-09-12 (docs, no application code) — #111 and #121 documented at architecture depth (not changelog depth): grounded generation vs RAG + two-rule prompt / publishers' exclusion (`18_AI_ENGINE.md` §3b, D21/ADR 017); 48h outcome methodology (`17_SIGNAL_ENGINE.md` §7, D22/ADR 018). New **Known Limitations** section below. Cross-links: #111→#103, #121→#53/#115.

> ⚠️ UPDATED 2026-09-12 (later, #111 governance) — dual Anthropic daily budgets, `CHAT_ALLOWED_EMAILS` fail-closed gate, fail-closed 30/day + 5/5min burst, Haiku relevance pre-check, cited replies, `[ANTHROPIC BUDGET]` logs + chat 50% email. Step 0: signups hardcode `pro` (plan-tier 403 is a no-op; left unchanged); daily counter previously failed open. Mocked tests only. D23 / ADR 019. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.53.0. This tree: PHASE 19.

> ⚠️ UPDATED 2026-09-12 (later still, #111 quality fixes) — real live testing after #134's governance audit found replies could cut off mid-sentence and markdown wasn't rendered. `max_tokens` stays 600; a `stop_reason === "max_tokens"` safety net trims to the last complete sentence instead. System prompt gains a ~180-word length instruction + a markdown-formatting instruction, and strengthens (without replacing) the sources-section instruction. `SignalChatPanel` now renders the answer via `react-markdown`, restricted to paragraphs/emphasis/lists (no links/images — the real Sources list stays the only clickable-link surface). #134's governance code untouched. Mocked tests only. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.54.0. This tree: PHASE 20.

> ⚠️ UPDATED 2026-09-12 (#133 + #112) — mobile dashboard shell is no longer crushed at 390px (off-canvas sidebar below `md`; 256px push unchanged at `md`+). Telegram connect UX: header icon + contextual prompt after 3 signal views; dismissed state is `profiles.notification_prompt_dismissed_at`. Discord not in this ship. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.55.0. This tree: PHASE 21.

Last updated: 2026-09-12 (#133 mobile dashboard shell + #112 Telegram connect UX)

---

## 1. Production Readiness Overview

| Subsystem                           | Status              | Notes                                                                     |
| :---------------------------------- | :------------------ | :------------------------------------------------------------------------ |
| **Turborepo Monorepo Architecture** | ✅ Operational      | Clean monorepo structure                                                  |
| **Next.js 16 Web App (Vercel)**     | ✅ Operational      | `/api/signals` force-dynamic; needs `SUPABASE_SERVICE_ROLE_KEY` on Vercel |
| **PostgreSQL Schema (Supabase)**    | ✅ Operational      | 9 migrations applied (including 009 event_date index)                     |
| **Railway Workers (Cron)**          | ✅ Operational      | `sleepApplication: false`, heartbeat every 5m, collectors every 15m       |
| **Railway Backend (HTTP API)**      | ✅ Operational      | `api.bluebeaconresearch.com` healthcheck passing                          |
| **RSS Real-Time Collector**         | ⚠️ Partial          | BBC, Al Jazeera, Guardian, NPR, UN News work; Reuters feed returns 404    |
| **GNews Ingestion**                 | ⚠️ Degraded         | Free tier — 1 query/run; mostly duplicates after initial ingest           |
| **GDELT Ingestion**                 | ⚠️ Degraded         | HTTP 429 rate limits (GDELT is keyless, no auth tier exists); exponential backoff (60s/120s+jitter, 3 attempts) added 2026-08-22, replacing a flat 30s retry that often landed inside GDELT's own ~15min IP block window |
| **Price Syncer (Yahoo Finance)**    | ✅ Operational      | 8 commodity prices every 15 min                                           |
| **Claude AI Classifier**            | ⚠️ Degraded         | Zero Anthropic credit — heuristic fallback active                         |
| **Heuristic Fallback Classifier**   | ✅ Operational      | Dynamic confidence scoring (55%–90%) + word-boundary filtering            |
| **Upstash Redis / BullMQ**          | ✅ Operational      | Fixed `rediss://` TLS protocol                                            |
| **Interactive UI Controls**         | ✅ 100% Operational | All buttons, filters, modals, FABs, and CSV downloads active              |

> ⚠️ UPDATED 2026-08-19 — the "9 migrations applied" row above is stale; `supabase/migrations/` now goes through 012 (13 files total), with migration 012 (RLS consolidation, 6 new indexes, unique constraint) applied to the live DB 2026-08-19, verified via Supabase Advisors.

---

## 2. Data Pipeline State (as of 2026-08-12)

- **`raw_events`**: Ingestion active on deploy startup + 15-min cron. Typical run: `inserted: 0–2`, `duplicates: 15–40`, `filtered: 40–80`.
- **`signals`**: 20+ signals in 24h `event_date` window, plus active ongoing events older than 24h are preserved in the default feed.
- **`Global Map`**: `/map` now plots geolocated events from real `lat`/`lng` values in `/api/signals`; missing Mapbox tokens gracefully fall back to a neutral overlay.

> ⚠️ UPDATED 2026-08-19 — this Mapbox-token framing is stale; the map now uses `maplibre-gl` (MapLibre GL JS) + OpenStreetMap tiles and doesn't require a Mapbox token at all. Separately, the `lat`/`lng` values plotted here for RSS/GNews/GDELT-sourced signals are still not real per-article geocoding — they come from a hardcoded keyword/country/region lookup table with jitter, not a geocoding API; this is a confirmed, explicitly deferred founder decision, not a bug.
- **`commodity_prices`**: Updated every 15 min (8 commodities via Yahoo Finance).

**Latest verified ingest** (2026-08-11T18:37 UTC deploy): `startup:rss → inserted: 1, signals: 1`.

---

## 3. How the Data Pipeline Works

```
Railway workers (startup + every 15m)
  RSS (BBC, Al Jazeera, Guardian, NPR, UN News) + GNews + GDELT
        ↓
isRelevantEvent() word-boundary filter — ~70% of articles filtered out
        ↓
Deduplicate by external_id — most remaining articles already in DB
        ↓
Insert into raw_events + signals (event_date = article PUBLISH time)
        ↓
Next.js /api/signals (default feed: 24h fresh + active ongoing events; explicit `window=latest|24h|7d|active` filters available)
        ↓
Dashboard shows eventDate → "X hours ago" = when article was PUBLISHED
```

---

## 4. Why Dashboard Timestamps Look "Old" (Not a Bug)

| Field        | Meaning                                   | Shown in UI?                     |
| :----------- | :---------------------------------------- | :------------------------------- |
| `created_at` | When **we ingested** the signal           | ❌ No (except NotificationPanel) |
| `event_date` | When the **source article was published** | ✅ Yes — `"12 hours ago"`        |

A signal ingested **5 minutes ago** from a BBC article published **12 hours ago** will display **"12 hours ago"**. Refreshing the page does not change this — it is intentional (v0.10.0 decision).

Featured cards on `/alerts` pick the first signal with **`severity >= 8`**. New ingested signals with lower severity (e.g. 5) exist in the DB but may not become the hero card.

---

## Known Limitations

Standing limitations. Not a changelog. Same section exists in `docs/brain/08_CURRENT_STATUS.md`. Design context: D20–D22 / ADR 016–018.

### Heuristic classifier severity-scoring gap (found 2026-09-11, capped 2026-09-12)

`heuristicClassify()` assigned severity 7–9 on bare keyword matches. Confirmed production ids:

- `37e6c146-4189-4b96-be45-ad01ccaea016` — Oregon military-radar permitting story — severity **8** on "military".
- `5e3b9c09-99ad-4959-88e2-dcc90c2bb629` — personal Navy memoir — severity **9** on "war".

Both confidence `0.76` (heuristic-only). Cap: heuristic severity ≤ 6. #115 first flagged severity-bunching; this investigation confirmed it. The cap is a bound, not a quality fix.

### Recurring Anthropic credit exhaustion

Repeated `credit balance too low` (2026-08-19; #53 backfill 2026-09-11, 201 rows skipped; 2026-09-12 ingest, every classify call). Live traffic is heuristic-only until funded. Ops problem, not a code path to "fix" by retrying the API.

### `service_health_events` did not track Claude/Anthropic until Prompt O

Pre-2026-09-12 the table tracked collectors/prices only. Prompt O added `recordServiceHealth("anthropic", ...)` on `classifyEvent()` and `chatAboutSignal()`. Claude outages before that date are not in this table.

---

## 5. Known Issues & Action Items

| Issue                                  | Severity  | Status                                                           |
| :------------------------------------- | :-------- | :--------------------------------------------------------------- |
| Railway Serverless sleep killing cron  | Fixed     | `sleepApplication: false` in `railway.workers.json`              |
| Wrong start command on workers service | Fixed     | `railway.workers.json` → `pnpm run start:workers`                |
| UI timestamps look stale vs ingestion  | Explained | By design — shows `event_date`, not `created_at`                 |
| Reuters RSS feed 404 on Railway        | Open      | `reutersagency.com` feed URL returns 404; other feeds compensate |
| GDELT HTTP 429 rate limiting           | Open      | Exponential backoff added 2026-08-22 (60s/120s+jitter, 3 attempts); still open since GDELT offers no way to eliminate 429s outright (keyless, no paid tier) — may still fail during sustained blocks |
| GNews free tier quota                  | Open      | 1 query/run; mostly returns duplicates after initial ingest      |
| Anthropic API credit exhausted         | High      | Heuristic fallback active                                        |
| ACLED collector requires credentials   | Open      | Set `ACLED_EMAIL` + `ACLED_PASSWORD` in Railway                  |
| `SUPABASE_SERVICE_ROLE_KEY` on Vercel  | Open      | Required for reliable `/api/signals` server reads                |
| Telegram alerts not working            | Open      | `TELEGRAM_BOT_TOKEN` not set in Railway                          |

> ⚠️ UPDATED 2026-08-19 — the missing `TELEGRAM_BOT_TOKEN` is still true and still blocks Telegram delivery specifically, but this table's diagnosis was incomplete: as of 2026-08-18 it turned out alert dispatch to ALL channels (Telegram, Slack, webhook, push) had been completely non-functional due to a separate wiring bug — the `alert-dispatch` BullMQ queue was never fed, so nothing ever triggered dispatch even when other prerequisites were met. That's now fixed (collectors call `dispatchAlertsForSignal()` inline); Telegram itself still needs the bot token added.

---

## 6. How to Verify Workers Are Healthy

Railway → **workers** → Logs. Expect:

```
Running initial ingestion immediately on startup...
startup:rss → { inserted: N, signals: N, ... }
workers: cron schedulers active, health server listening
workers:heartbeat → every 5 min
rss-collector / price-sync → every 15 min
```

Supabase SQL:

```sql
SELECT title, created_at, event_date,
       NOW() - created_at AS ingested_ago,
       NOW() - event_date AS published_ago
FROM signals ORDER BY created_at DESC LIMIT 5;
```

If `created_at` advances but UI still shows old times → check `event_date` (publish time), not ingestion.

---

## 7. Environment Variables Required

### Supabase (Vercel + Railway + `.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=https://evavcgfmemwryggdkjmx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>   ← REQUIRED on Vercel for /api/signals
```

### Redis (Railway workers + backend)

```
REDIS_URL=rediss://default:<token>@<host>:6379   ← MUST be rediss:// (TLS)
```

### Data Sources (Railway workers)

```
GNEWS_API_KEY=<gnews token>
ANTHROPIC_API_KEY=<optional — heuristic fallback works without credits>
ACLED_EMAIL=<optional>
ACLED_PASSWORD=<optional>
```
