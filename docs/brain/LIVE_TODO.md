# Live Task Tracker

Status icons: 🔴 blocking · 🟡 ready · ⚪ not started · 🤔 needs founder decision · ✅ done, verified.
[founder-led] = founder's own action, no engineering needed.

## Closed, verified
- #111 AI signal chat, **backend half only** — shipped 2026-09-11 (this commit). `apps/backend`: `GET/POST /v1/signals/:id/chat` (`signal-chat.routes.ts`, registered in `app.ts`); `ClaudeService.chatAboutSignal()` reuses the exact `claude-sonnet-5` model + buy/sell/position-sizing/entry-exit prohibition wording from `generateAnalysis()` (copied verbatim, not rewritten), plus a chat-specific rule that recognizes and declines personalized position/portfolio-advice questions with a fixed redirect instead of answering; grounded only in that signal's own `title/summary/ai_analysis/region/country/severity/confidence/commodity_impacts/currency_pair_impacts/sources_count/event_date`. New table `signal_chat_messages` (migration `20260911180000_signal_chat_messages.sql`, applied to `evavcgfmemwryggdkjmx`), same user-owns-their-rows RLS convention as `alert_rules`/`watchlist_entries`/`saved_signals`. POST gates on `planTier !== "free"` (`403 { error: "premium_required" }`) and a custom 30-msg/24h per-user counter (`429 { error: "rate_limited" }`, counts `signal_chat_messages` rows directly — no rate-limit library exists in this app yet). Live-verified on standing test account romantannison (`pro` tier) against real signal `096759c2-5d38-4f8a-b2ab-81fcfcbfc168` ("Yemen Perim Island..."): a normal question ("Why does Perim Island matter for oil shipping specifically?") returned a grounded answer citing that signal's actual 82%/80% commodity-impact confidence figures; "I hold 200 barrels of WTI, should I add more?" was declined verbatim with "I can explain what this event means, but I can't advise on your own position — that's outside what this tool does," not answered. All 4 turns (2 user, 2 assistant) confirmed written to `signal_chat_messages` via direct SQL (ids `86372408-…`, `ffa2a819-…`, `86327480-…`, `4a0659bd-…`), then deleted (test data, not left in prod). **Frontend chat panel on the event page is NOT part of this — still open**, see `09_BACKLOG.md` #111.
- Stale Supabase project-ref citations — purged 2026-09-11 (this commit). Repo grep found the unused ref only in markdown (no code/config). Copy-paste URLs in archived `CLAUDE_CONTEXT.md` now use `evavcgfmemwryggdkjmx`; remaining historical mentions dropped so the live ref is not relabeled as wrong.
- #106 5-year historical commodity charts — shipped 2026-09-11 (`79c77b4`). On-demand `GET /v1/prices/history-5y/:symbol` calls yahoo-finance2 `chart()` (`period1` = 5y ago, `interval: "1wk"`), in-memory 15-minute cache per symbol, not stored and not scheduled (`price-syncer.ts` untouched). Unknown symbols never reach Yahoo. Watchlist drill-down (`/watchlist/[symbol]`) adds a second panel labeled "5-year history" via `/api/prices/history-5y`. Verified live: XAUUSD (GC=F) 262 weekly bars 2021-09-13→2026-09-11, first close $1749.40 / last $4387.90; Mar 2022 ~$1983 and Sep 2024 ~$2494 match public gold levels; USOIL Mar 2022 weekly close $109.33 (invasion spike); Playwright on standing test account rendered the Gold page chart (Y $1050–$5250, X Sep 2021–Sep 2026). Incomplete Yahoo series shows available history rather than erroring the panel.
- Canonical `docs/claude_project/` catch-up — 2026-09-11 (docs-only, this commit). `09_BACKLOG.md` now lists #105/#107/#108/#116/#119/#120/#122/#123/#124/#125/#126/#127 as shipped (S1/C3 strikethrough convention) and the rest of #104–#128 as still open. `08_CURRENT_STATUS.md` + `14_CHANGELOG.md` PHASE 11 summarize tonight's batch and point here for per-commit evidence. `AGENTS.md` protocol item 6: a `LIVE_TODO.md` line is not enough — the canonical 09/08/14 files must be updated in the same commit going forward.
- #126 Trust/freshness signals — shipped 2026-09-11. `Fresh Xm` tag on feed cards (featured / secondary / stream), `SignalCard`, map popup, and map list, from `signals.created_at` via existing `safeFormatDistanceToNow` (compact). Coverage line on Intelligence Feed: live distinct outlets last 24h + 13 configured RSS feeds (`RSS_FEEDS.length`) + GNews/GDELT/ACLED. Outlet field is `raw_events.raw_data.source` (RSS string / GNews `.name`) or `raw_data.domain` (GDELT); `signals` has no source/outlet column. Same-session check: `/api/signals/source-stats` returned `sourcesLast24h: 41, rssFeedCount: 13`; matching Supabase SQL on `evavcgfmemwryggdkjmx` returned `distinct_outlets: 41` (39 signals in the window).
- #127 Economic calendar filters (calendar half) — shipped 2026-09-11. Importance / country / category / timezone on `/calendar`. Did not mount `FilterBar` (feed-shaped value); reused `SELECT_CLASSES` + FilterBar-style timezone buttons. JSON times are UTC; local is display-only conversion. Filter helper vs JSON: 10 events → United States 5, medium 1, Monetary policy 6, low 0. Map chokepoint/pipeline layers still gated.
- #122 Quick-view slide-over — shipped 2026-09-11. Intelligence Feed stream rows get a desktop-only preview icon before the existing `>`. Click opens a right-half slide-over (title, severity, confidence, commodity impacts, short `aiAnalysis` excerpt from `/api/signals`; no new API fields). Closes on overlay click or X. Discoverability: added a Joyride step targeting the new icon (reuses `product_tour_completed`, no new column) — smaller than a one-time tooltip + migration. Playwright on romantannison: panel matched the El Niño row (severity 7, 85% confidence, WHEAT/CORN/NGAS/USOIL impacts, briefing excerpt); overlay and X both close it.
- #123 New tab only on quick-view "View full details" — shipped 2026-09-11 with #122. Feed row, Map popup, and Alerts signal-stream links left same-tab. The panel's "View full details" is a real `<a target="_blank" rel="noopener noreferrer">`. Playwright: row click stayed one tab at `/events/{id}`; the panel link opened a new already-logged-in event tab while the original stayed on `/dashboard`.
- #119 Onboarding GIF/video step — shipped 2026-09-11. Welcome modal before the existing 6 Joyride steps (`WelcomeTourStep`, `tourPhase: "welcome"`). Placeholder `/onboarding/welcome-demo.gif` (`<img>` for gif, looping muted autoplay `<video>` for mp4). Caption "See how it works"; "Got it, show me around" advances into the tour; "Skip tour" still persists `product_tour_completed`. Type-check only for the UI (no Playwright in `apps/web`). Real GIF still needs recording.
- #120 Plain-language AI-writing rewrite — shipped 2026-09-11. `generateAnalysis()` system prompt adds plain-language / 4-part structure / keep-hedging instructions alongside the #103 buy/sell prohibition (not replacing it). `classifyEvent()` (Haiku) untouched. Regenerated 4 real severity≥7 signals (El Niño, ECB/Iran, Perim Island, Al Faw tanker) before/after; not written back to `ai_analysis`. Unit test asserts both instruction blocks.
- #116 "Authentication is temporarily unavailable" — shipped 2026-09-11 (`a561690`). Root cause was the 3s AbortController on middleware `getUser()` (Vercel `AbortError` on `/middleware` + GoTrue `context canceled` / `dial tcp [::1]:5432: operation was canceled` on 2026-09-09; a real `/user` also succeeded in 6.4s). Timeout raised to 8s; race against a timer instead of aborting Auth's fetch; `catch` now `console.error`s name/message/code. Fail-closed redirect + login banner on timeout unchanged. Type-check only — no middleware tests exist; live Auth slowness not reproduced.
- #124 Feed filter bar + shared FilterBar — shipped 2026-09-11 (`74b815b`). Commodity/Region/min-severity/Time range (incl. 30d) on feed and map; region match is casing/hyphen insensitive. Playwright on romantannison: unfiltered 2823 → USOIL 478; map FilterBar present, This month sent `window=30d`, Africa region 20→6. Follow-up: map `fetchFiltered` now sends `limit=500` (API cap raised to match) so All / This month are not stuck on the first 20.
- #125 Trader-role saved views — shipped 2026-09-11 (`74b815b`). Feed-only Oil/Grain/Metals chips set FilterBar controls (no new schema). Playwright: Oil Desk 185 = manual Energy + Middle East; Grain `cat:agriculture`/region All 87; Metals XAUUSD 256.
- #107 follow-up Watchlist prefs-aware seed + user_preferences persist — shipped 2026-09-11 (`75d932c`). First-visit seed uses onboarding commodities ∪ forex when present (generic 8 only as fallback), still labeled “Suggested for you — remove anything you don't need.” List upserts to `user_preferences.watchlist_symbols` / `watchlist_suggested` (same `onConflict: "user_id"` path as #81); `bbr.watchlist.v1` stays a cache. Verified on standing test account romantannison: `commodities=['COPPER']` (set for this check — was empty) seeded the Copper card, not the generic 8, with the suggested banner; DB wrote `watchlist_symbols=['COPPER']`; `localStorage.clear()` + reload still showed Copper from the server row.
- #105 Map click-modal UI fix — shipped 2026-09-11 (`f6be851`)
- #107 Watchlist default-populated cards + one-click add — shipped 2026-09-11 (`f6be851`)
- #108 Backtesting Lab auto-apply filters + loading state — shipped 2026-09-11 (`f6be851`)
- #75 Vercel Fluid/SSE retirement — ac356ed
- #76 Telegram bot token + linking — re-verified 2026-09-06
- #79 Real usage/analytics tracking — 99975cc; ADMIN_EMAILS follow-up closed
  2026-09-07, live-verified on both Railway and Vercel (HTTP 200 + real data on
  /admin/metrics and /v1/admin/metrics)
- #80 Unsourced TAM figures fixed — 57a16b1
- #88 Telegram webhook secret-token hardening — 3dd675b
- #100 Vercel API_URL misconfiguration — fixed 2026-09-06
- #93 richfeed — FULLY RESOLVED 2026-09-07. Founder confirmed richfeed is his
  own separate, India-focused social-distribution project, not part of BBR's
  engineering scope. The Social Auto-Poster spec (docs 34–37 references) itself
  will not be picked up by BBR going forward — both because it's now a separate
  founder-owned project and because its own blockers (Meta Advanced Access,
  TikTok Content Posting API audit, Pinterest Standard Access) fall under the new
  permission-avoidance policy (ADR 014 / D18). No further BBR engineering
  follow-up on either.
- #94 Cost/waste "do now" batch — 59ccf2b, all 7 items closed
- #81 Personalization core (user_preferences extended, onboarding capture, feed
  filter) — 517f796, e4bcaf6, 817fdee
- #89 Watchlist preference-aware defaults — 598678e
- #82 Alerts rework + trust/differentiation — c0698fc (in-app card: Event → Why
  it matters → Which instruments → Alert threshold; prominent "alert only above
  this threshold" control; per-card "Built from" source links; one-time
  not-financial-advice line) + a269547 (same four-section reframe in the
  Telegram/Slack template). Verified 2026-09-07: Playwright screenshot of the
  reworked card against the test account + 3 real Telegram messages from a live
  dispatchAlertsForSignal() run (all delivered:1), identical structure in both,
  ai_analysis-present and ai_analysis-null branches both exercised. Threshold
  control DB round-trip confirmed (6→8).
- #83 Personalized daily digest — bc8f4e0 + 57516b0 (from-address). Migration
  adds user_preferences.digest_enabled (default true). digest-sender.ts selects
  each onboarded, digest-enabled user's own top-5 signals from the last 24h
  matched to their watched commodities/regions (no global fallback), same
  four-section email framing + trust line, scheduled via node-cron (DIGEST_CRON,
  default 06:00 UTC). Settings → Notifications opt-out toggle wired to
  digest_enabled (true→false→true round-trip confirmed). Verified 2026-09-07:
  SQL check — with test user prefs regions=[africa]/commodities=[CORN,WHEAT] the
  digest pulled 5 signals ALL matching CORN/WHEAT, only 1 of which was in the
  unfiltered global top-5 (Iran-dominated) → genuinely personalized. One real
  digest email delivered to romantannison@gmail.com via the existing Resend
  account (id e06df2b3-ea1d-410d-ac01-019fbbb678dc, status delivered).
  PROD CRON PATH — FULLY END-TO-END CONFIRMED 2026-09-07: founder added
  `RESEND_API_KEY` to the Railway `workers` service; then a one-off prod
  verification ran the real cron path (no code change): test account
  romantannison given `user_preferences.regions = ['middle-east']`, `DIGEST_CRON`
  on the `workers` service temporarily set to `15 3 * * *`, the deployed worker's
  own `cron.schedule` callback fired `runDigestOnce()` at 03:15:08 UTC →
  `[digest] sent to romantannison@gmail.com (5 signals) id=ffc24290-8ad1-4338-ac15-9c24707f60a1`,
  `digest-sender complete`. Resend confirms email `ffc24290-8ad1-4338-ac15-9c24707f60a1`
  (from `digest@send.bluebeaconresearch.com`, SES message-id, **status delivered**,
  created 03:15:02 UTC) — a new, distinct id from the earlier manual test send
  `e06df2b3-ea1d-410d-ac01-019fbbb678dc`. All 5 signals were Middle East, matching
  the test account's region pref → personalization path confirmed through the
  deployed worker. `DIGEST_CRON` reset to `0 6 * * *` afterwards; romantannison's
  region pref left in place (founder's own test account — keeps the daily cron
  exercising a real recipient). Resend still shows only the one pre-existing API
  key — same key reused for the digest's HTTP calls, which is fine.
- #86 Economic calendar — 30cf1f2. New `/calendar` page (this week + upcoming
  tables, 🔴/🟡/🟢 impact indicators, live countdown to the next high-impact
  event) backed by a **static, manually-curated** `apps/web/data/economic-calendar.json`
  — a deliberate v1 choice, not a gap: no new paid API/vendor credential before
  there's real usage to justify it. Dates pulled from each institution's own
  published schedule as of 2026-09-07 (federalreserve.gov, ecb.europa.eu,
  boj.or.jp, bls.gov, bea.gov, opec.org) — 10 events, Sept 10 → Oct 30 2026 (ECB
  x2, FOMC x2, BOJ x2, US NFP, US CPI, US GDP Q3 advance, OPEC Monthly Oil
  Market Report). Window runs ~7.5 weeks, slightly past the nominal 4-6 to avoid
  cutting the next FOMC/BOJ/ECB/GDP cluster in half. No OPEC+ ministerial
  production-quota meeting date has been published yet for this window, so only
  the confirmed Monthly Report date is listed — not guessed. Forecast/Previous/
  Actual are `null` → rendered as "—", never fabricated. Swapping to a live
  provider (e.g. Trading Economics) later is a data-source change to one JSON
  file, not a rebuild. Verified live via Playwright: real dates render, "This
  Week" correctly isolates just the Sept 10 ECB decision (today is Mon Sept 7),
  everything else falls into "Upcoming", and the countdown ticks down correctly
  against the real system clock (confirmed two reads 13s apart: 3d 09h 44m 04s
  → 3d 09h 43m 51s).

- #87 Forex pair taxonomy — **phase 1 of 3 (schema + classifier + price sync)
  CLOSED, verified 2026-09-09**, commit a15e2fd. Backend-only, no apps/web changes.
  - Migration `20260909035949_forex_pair_impacts.sql`: additive
    `signals.currency_pair_impacts jsonb not null default '[]'`. Nothing else
    touched; historical `commodity_impacts` rows with EURUSD/USDRUB left as-is.
  - `claude.service.ts`: new `ALLOWED_FOREX_PAIRS`
    (EURUSD|GBPUSD|USDJPY|USDCHF|USDRUB|USDCNY); EURUSD/USDRUB **removed** from
    `ALLOWED_COMMODITY_ASSETS` (the pre-existing mislabeling — other 6 commodity
    entries untouched); new `FOREX_PAIR_ALIASES` + `normalizeForexPair()` +
    `sanitizeForexImpacts()` mirroring the commodity equivalents; Claude prompt
    schema gains a `currencyPairImpacts` field; `ClassificationResult` gains
    `currencyPairImpacts`. Heuristic fallback: evidence-only USDRUB (Russia +
    sanctions/SWIFT/asset-freeze/price-cap regex) and USDCNY (China +
    tariff/trade-war/export-control/Taiwan regex); EURUSD/GBPUSD/USDJPY/USDCHF
    left **AI-only** on the heuristic path — no confident non-AI regex for
    Fed/ECB/BOJ/SNB events that wouldn't misfire.
  - `ai-classifier.ts`: `currencyPairImpacts` added to the zod schema and
    inserted into `signals.currency_pair_impacts`.
  - `price-syncer.ts`: new `FOREX_SYMBOLS` map (`<PAIR>=X` Yahoo format), synced
    in the same loop into the same `commodity_prices` table. All 6 tickers —
    incl. USDRUB=X / USDCNY=X — verified against a real `yf.quote()` call.
  - Verified: (1) information_schema shows the new column; (2) a real Claude
    classification of an EU/US-sanctions-on-Russia event returned USDRUB in
    `currencyPairImpacts` and **not** in `commodityImpacts`, and a real
    `signals` insert accepted it; (3) forcing `heuristicClassify()` on
    Russia/sanctions text returned a USDRUB entry (China/tariff text → USDCNY;
    neutral text → `[]`); (4) `runPriceSyncOnce()` wrote real non-null prices
    for all 6 forex symbols (EURUSD 1.163, GBPUSD 1.354, USDJPY 153.46,
    USDCHF 0.809, USDRUB 85.69, USDCNY 6.71).
  - ~~⚠️ Follow-up for phase 3: only the dormant `ai-classifier.ts` was wired;
    the live signal-creation paths still only write `commodity_impacts`.~~
    **CLOSED by phase 1B (commit abb2004), 2026-09-09.**

- #87 Forex pair taxonomy — **phase 1B (close the live-ingestion gap) CLOSED,
  verified 2026-09-09**, commit `abb2004`. Backend-only.
  - Added `currency_pair_impacts: classification.currencyPairImpacts ?? []` to
    the three real signal-creation inserts: `signal-merge.ts` `insertOrMergeSignal()`
    (the live rss/gnews/gdelt path per ADR 006), `reconciliation.ts`
    (orphan-recovery), `acled-collector.ts`. All three classify via
    `ClaudeService.classifyEvent()` → `classification` is `ClassificationResult`
    (already has `currencyPairImpacts` from phase 1); no narrower local type, no
    `any`. `ai-classifier.ts` untouched (already correct, still dormant).
  - Merge semantics (ADR 010): `insertOrMergeSignal()` writes impacts **once**,
    at signal creation — the duplicate and escalation branches never rewrite
    `commodity_impacts`, so `currency_pair_impacts` is left alone there too
    (exact parity; documented with a comment in the file).
  - Verified: a real Russia-sanctions classification pushed through the live
    `insertOrMergeSignal()` new-signal branch → stored `signals` row has
    `currency_pair_impacts` = `[{USDRUB…},{EURUSD…}]` **and** unchanged
    `commodity_impacts`; the row is matched by the same PostgREST `cs`
    (jsonb-contains) operator production commodity matching uses
    (`cs [{"asset":"USDRUB"}]` → hit; `cs [{"asset":"USDCNY"}]` → correctly no
    hit). `pnpm test` (backend) + `pnpm type-check` pass — commodity behavior
    unchanged.
  - Still pending: phase 2 (onboarding/watchlist UI), phase 3
    (alert_rules/dispatcher/digest forex matching + a real forex Telegram alert).

- #87 Forex pair taxonomy — **phase 2 of 3 (onboarding, feed filter, watchlist)
  CLOSED, verified 2026-09-09**, commit `55df380`. `apps/web` +
  `packages/shared` only. Wires the until-now-unused
  `user_preferences.forex_pairs` column into the existing #81/#89 mechanisms —
  no new onboarding path, no new feed-filter param, no separate watchlist toggle.
  - `packages/shared`: new `FOREX_PAIRS` constant (the same 6 the classifier
    emits — EURUSD/GBPUSD/USDJPY/USDCHF/USDRUB/USDCNY — slash-formatted labels,
    `unit`/`category` mirroring `COMMODITIES`); `Signal` gains optional
    `currencyPairImpacts?: CommodityImpact[]`.
  - `/onboarding` step 2: a "Currency pairs you follow" chip list reusing the
    same `chipStyle()`/`toggle()` helpers; `forex_pairs` added to the
    `user_preferences` upsert. **Fixed in passing:** that upsert lacked
    `onConflict: "user_id"` (PK is `id`, UNIQUE on `user_id`), so it 409'd and
    silently dropped *all* captured prefs for any user who already had a row;
    now names the constraint and throws on error instead of swallowing it.
  - `/api/signals?personalized=true`: the same `orParts` OR filter now also
    appends `currency_pair_impacts.cs.[{"asset":"<SYM>"}]` per preferred pair
    (one combined OR); `currencyPairImpacts` added to the row→`Signal` mapping.
  - `/watchlist`: `useMyPreferences()` returns `forexPairs`; the
    "My Commodities"↔"Show All" default seeds from `commodities ∪ forex_pairs`;
    all asset lookups run off `[...COMMODITIES, ...FOREX_PAIRS]`. `/api/prices`
    Tier-2 fallback `SYMBOLS` widened with the 6 pairs (Tier 1 already returned
    them).
  - Verified (Playwright + SQL): real onboarding wrote
    `forex_pairs=["EURUSD","USDCHF"]`; `?personalized=true&window=all` with only
    those two prefs returned exactly the one signal with a matching
    `currency_pair_impacts` and `?personalized=false` restored the full feed;
    `/watchlist` seeded EUR/USD + USD/CHF cards with live prices and the toggle
    round-tripped (13 assets under "Show All").
  - ~~Known limitation, out of scope: `/watchlist/[symbol]` drill-down still keys
    off `COMMODITIES`/`?commodity=` — a forex card links to a degraded drill-down
    (raw label, no matched signals).~~ **CLOSED in the phase-4 follow-up below.**
  - Still pending: phase 3 (alert_rules/dispatcher/digest forex matching + a real
    forex Telegram alert).

- #87 Forex pair taxonomy — **phase 3 of 3 (alert rules, dispatcher, digest)
  CLOSED, verified 2026-09-09**, commit `a102e68`. `apps/backend` + `apps/web` +
  one additive migration. Wires `forex_pairs` through the alert path the same way
  `commodities` already runs.
  - Migration `20260909044602_alert_rules_forex_pairs.sql`: additive
    `alert_rules.forex_pairs text[] not null default '{}'`, mirroring
    `alert_rules.commodities`. `min_severity` default untouched. Remote recorded
    the migration under the MCP's own timestamp `20260909044602`; local filename
    renamed to match (no slot mismatch).
  - `alert-dispatcher.ts`: instrument filter is now an OR of `commodities` and
    `forex_pairs` (a rule matches if the signal's `commodity_impacts` OR
    `currency_pair_impacts` overlap; a rule with neither list is still not
    instrument-filtered). `buildAlertBody()` "Which instruments" concatenates
    `currency_pair_impacts` after `commodity_impacts` — Telegram/Slack/in-app.
  - `digest-sender.ts`: `pref.forex_pairs` folds into the same combined
    containment `OR`; `currency_pair_impacts` added to the signal select +
    `SignalRow`; `whichWatchMatched()` credits forex hits; the "only forex_pairs
    set" case no longer early-returns; copy → "the regions, commodities, and
    forex pairs you follow"; `runDigestOnce()` prefs select gained `forex_pairs`.
  - `apps/web`: create-rule modal on `/alerts` + `/events/[id]` gained a 6-pair
    multi-select (persists `forex_pairs`); rule cards show a "Forex:" line;
    Alerts "Which instruments" renders `currencyPairImpacts`; `/api/alerts/recent`
    joins `currency_pair_impacts`.
  - Verified per doc 53's delivery standard: a forex-only rule (`regions=[]`,
    `commodities=[]`, `forex_pairs=["EURUSD"]`, sev 8) dispatched against live
    signal `4b96add1…` → `{attempted:1, delivered:1}`, one `alerts_sent` row, a
    **real Telegram message** with "WHICH INSTRUMENTS: … · EURUSD ↓ · USDJPY ↑ ·
    USDCHF ↑"; the two pre-existing rules were paused for the run (both
    reactivated, test rule deleted). `selectDigestSignalsForUser` with only
    `forex_pairs=["EURUSD"]` selected exactly that signal; `renderDigestEmail`
    text + HTML contain "forex pairs" and "EURUSD". Playwright: Alerts card
    renders EURUSD/USDJPY/USDCHF chips; modal multi-select round-tripped
    `["EURUSD","USDJPY"]` through the DB. (Real email send not exercised from
    local — no `RESEND_API_KEY` locally; set on Railway workers.)
  - No `equity_tickers` / `ticker_impacts` — equity stays gated (ADR 013 / D17).
  - #87 now fully shipped — all 3 phases done. ~~Carried-forward limitation:
    `/watchlist/[symbol]` drill-down still commodity-only.~~ **Closed in phase 4.**

- #87 Forex pair taxonomy — **phase 4 (watchlist drill-down forex support)
  CLOSED, verified 2026-09-09**, commit `accd468`. `apps/web` only, no
  migration. Closes the phase-2/3 carried-forward limitation: a followed forex
  pair now opens a working `/watchlist/[symbol]` drill-down instead of a
  degraded one (raw code, zero matched signals).
  - `/watchlist/[symbol]/page.tsx`: resolves `meta` against `COMMODITIES` then
    `FOREX_PAIRS` (so `EURUSD` shows "EUR/USD"); `isForex` flag; `isFollowed`
    now ORs `myPrefs.forexPairs.includes(symbol)`; the correlated-signals fetch
    sends `?forexPair=` instead of `?commodity=` for a forex symbol; the
    client-side impact lookup reads `ev.currencyPairImpacts` for a forex symbol.
  - `app/api/signals/route.ts`: new **separate** `?forexPair=` query param — a
    `.contains("currency_pair_impacts", JSON.stringify([{asset}]))` filter, the
    exact mirror of the existing `?commodity=` branch. `?commodity=` is
    untouched and still means `commodity_impacts` everywhere.
  - No `equity_tickers` / `ticker_impacts` — equity stays gated.
  - Verified (Playwright + SQL, per #87's standard): `/watchlist/EURUSD` renders
    "EUR/USD", "forex · Drill-Down", and lists test signal `4b96add1…` with an
    `EURUSD ↓` chip (its `currency_pair_impacts`); "You follow this" shows when
    `forex_pairs` contains `EURUSD`. `/watchlist/USOIL` unchanged ("WTI Crude",
    same commodity signals). API: `?forexPair=EURUSD&window=90d` → 1 signal;
    `?commodity=USOIL` → 429 (unchanged); `?forexPair=USOIL` → 0.

## Decisions confirmed 2026-09-07
1. Forex gate — softened, forex only, not equity. Desk-research-validated (see
   ADR amendment below).
2. India go-to-market — NO special treatment. Same as any other market unless a
   real signal appears later on its own.
3. Priya (SMB importer) persona — no more trader-community search time. If
   pursued opportunistically: NCBFAA (National Customs Brokers & Forwarders
   Association of America), weekly eBriefing reaching 250,000+ importers/exporters.
4. #77 (10-15 live interviews) — retired as scoped. Closed via desk research
   (Perplexity/Grok transcripts reviewed directly, plus independent web
   verification) instead of live interviews.
5. #78 (manual Stripe test) — deprioritized to last. Free-first strategy: no
   payment method added until real free-tier traction is observed.
6. #91 (distribution test) — no personal outreach; substituted with independent
   research.
7. #92 (concierge digest test) — dropped as a pre-build gate; digest builds now,
   corrected against real usage post-launch.
8. Validation checkpoint — CLEARED, on desk research plus the free-first launch
   strategy, not on live interviews or a payment test.

## Priority queue (updated 2026-09-07)
- #82, #83, and #86 closed 2026-09-07 (see "Closed, verified"). #83's prod
  cron path is now **fully end-to-end confirmed** — a one-off prod run of the
  deployed worker's own digest cron delivered a real email via the Railway
  `RESEND_API_KEY` (Resend id `ffc24290-8ad1-4338-ac15-9c24707f60a1`, delivered).
  No follow-ups outstanding.
- #87 forex taxonomy: **fully shipped 2026-09-09** — phase 1 (`a15e2fd`), phase
  1B (`abb2004`), phase 2 (`55df380`), phase 3 (alert_rules/dispatcher/digest
  forex matching + Alerts UI, `a102e68` — real forex-only Telegram alert
  verified), phase 4 (watchlist drill-down forex support, `accd468`). All
  closed — see "Closed, verified". Equity still gated.
- Gated on real free-tier traction, no fixed date: #84 (full billing), #78
- Parked: #90 (individual-stock-idea feature), #96 (Railway service merge —
  decided against)

## Priority queue update — 2026-09-10/11, founder idea batches + competitor research
(All items below are PLANS/RESEARCH ONLY, nothing here is built — do not mark any as done.)
- #104 Vercel Hobby→Pro upgrade — ready now, $20/mo, no gate.
- #105 Map click-modal UI fix — closed 2026-09-11 (see "Closed, verified").
- #106 5-year historical commodity charts — closed 2026-09-11 (see "Closed, verified").
- #107 Watchlist default-populated cards + one-click add — closed 2026-09-11 (see "Closed, verified"). Follow-up (prefs-aware seed + `user_preferences` persist) also closed 2026-09-11 (see "Closed, verified").
- #108 Backtesting Lab auto-apply filters + loading state — closed 2026-09-11 (see "Closed, verified").
- #109 Printable architecture/flowchart doc — scoped, own session.
- #110 Named-analyst content section — parked, gated on real evidence of demand.
- #111 AI chat on event page (premium) — scoped, RAG-grounded, same buy/sell-refusal
  discipline as the Sonnet briefing prompt (#103); sequence after the go-live checklist.
- #112 Push-notification connect UX — scoped; "dismissed" state must be server-side, not
  browser-only.
- #113 www/apex domain redirect — ready now, free, Vercel dashboard only.
- #114 Business continuity + legal registration — checklist ready; founder to pick a
  jurisdiction and register.
- #115 Signal-quality live-data audit — ready-to-run, read-only verification prompt exists.
- #117 Global marketing/ads compliance — researched, no blocker found; action folded into
  #102.
- #118 Premium news/AI tier — step 1 (GNews Essential) no gate; steps 2-3 gated on real
  revenue.
- #119 Onboarding GIF/video step — closed 2026-09-11 (see "Closed, verified"). Real GIF still
  needs recording.
- #120 Plain-language AI-writing rewrite (generateAnalysis() system prompt) — closed 2026-09-11
  (see "Closed, verified").
- #121 Real /accuracy page + outcome-tracker worker — spec'd, full build recommendation
  exists; gated on real signal history being long enough to be honest.
- #122 Quick-view slide-over panel — closed 2026-09-11 (see "Closed, verified").
- #123 Event pages in a new tab — closed 2026-09-11 (see "Closed, verified"). Scope
  settled: new-tab only on the quick-view "View full details" link; feed/map/alerts stay
  same-tab.
- #124 Feed filter bar (Commodity/Region/Severity/Time range) + shared FilterBar component —
  closed 2026-09-11 (see "Closed, verified").
- #125 Trader-role saved views (Oil Desk/Grain Desk/Metals Desk) — closed 2026-09-11 (see
  "Closed, verified").
- #126 Trust/freshness signals (coverage footer + "Fresh Xm" tag) — closed 2026-09-11 (see "Closed, verified").
- #127 Economic calendar filters (importance/country/category/timezone) on the existing
  /calendar page (#86) — calendar half closed 2026-09-11 (see "Closed, verified"). Map
  chokepoint/pipeline layers still gated on a real data-vendor cost check.
- #128 Human-review trust layer — Stage 1 is a founder action (stand up the real review
  process); Stages 2-3 become a normal prompt once Stage 1 is real. Do not add "human-
  reviewed" language to the product before Stage 1 is real.

## Behavioral event instrumentation — Phase 0 landed 2026-09-09 (not gated, not urgent)

Passive logging only, no scoring/ranking/UI change. Research doc
`docs/claude_project/64_*`. Three new recurring `event_type` values now write to
`public.events` via the existing `logUsageEvent` path in
`apps/web/lib/funnel-events.ts` (no migration — `public.events` has no event_type
constraint; NOT fire-once, no partial unique index):

- `signal_viewed` — a feed card (dashboard featured / secondary / stream row) or
  an Alerts-page match card is opened. metadata `{ signal_id, commodities[],
  regions[], forex_pairs[] }` (`regions` is a 1-element array — a signal has one
  region — for shape-uniformity with alert_rules). Fired via `dedupe: false`, so
  every open is a row.
- `signal_source_clicked` — the Alerts-page "Built from" (#82) source link is
  clicked. Same metadata shape. `dedupe: false`.
- `watchlist_symbol_viewed` — `/watchlist/[symbol]` drill-down mount. metadata
  `{ symbol, is_forex }`. `dedupe: "entity"` on `symbol` (collapses strict-mode
  double-mount / re-render; distinct symbols each count).

Nothing reads these yet. Data has been accumulating since **2026-09-09**. A
future Stage 2 ranking/personalization thread should treat this as the
engagement history to build on. Note: an unrelated PostHog `track("signal_viewed",
…)` with a different `{signalId, severity}` shape already fires from the
`/events/[id]` detail page — different destination (PostHog, currently dormant:
`NEXT_PUBLIC_POSTHOG_KEY` unset), different trigger point; don't conflate them.

## Killed 2026-09-07

### #85 WhatsApp alert channel — KILLED 2026-09-07, not paused.

**What was planned:** direct Meta Cloud API integration (not a BSP, to avoid
per-message markup and lock-in). Required: Meta Business Portfolio + Business
Verification (business registration/address docs submitted for Meta review,
reported 1–2+ week turnaround, sometimes stuck for weeks with no response), a
dedicated phone number never used on personal WhatsApp, and a pre-approved
utility-category message template before messaging any real user. Cost: ~₹0.136
per alert outside a 24-hour session window (free within it) — roughly $16 per
10,000 alerts. Recommended gating: Pro tier ($199+) only, given the per-message
cost. Linking flow was designed to mirror Telegram's `/connect <code>` pattern —
user messages BBR's number first, opening a 24-hr window and establishing real
opt-in, never a cold broadcast. Known risks flagged at the time: template
rejections for vague copy, Business Verification stalling with no response,
accidental number restriction from messaging non-consenting numbers.

**Why killed:** (1) Business Verification is exactly the "difficult permission"
category BBR now avoids by standing policy — see ADR 014 in
`docs/brain/10_DECISIONS.md` (D18 in `docs/claude_project/10_DECISIONS.md`).
(2) Independently, WhatsApp was already the weakest-evidenced of the three
notification channels for BBR's researched (Western-trader-weighted) audience —
Telegram/Discord dominate there; WhatsApp's edge only showed in India-specific
data, and BBR separately decided not to pursue India as a distinct go-to-market
push. Not a strong bet sacrificed for policy — a lower-confidence bet that also
fails the new gate.

**To resume later:** the draft message template, the DB schema (channel columns
mirroring `user_channels`' existing Telegram pattern), and the full cost/risk
research still exist and can be rebuilt into a fresh, self-contained prompt —
don't need to re-research the Meta requirements from zero.

## Known open technical item — RESOLVED 2026-09-07
Playwright MCP's browser profile had locked twice in this environment (orphaned
`ms-playwright-mcp/mcp-chrome-*` Chrome processes from a prior session holding
the profile's singleton lock), blocking the mandated visual-verification step
both times. Fixed by re-registering the server with `--isolated` (`claude mcp
remove playwright` / `claude mcp add playwright npx '@playwright/mcp@latest' --
--isolated`) and killing the orphaned processes so the live session could pick
up a clean profile. Confirmed working: full Playwright walkthrough of #81/#89
completed same day (fresh signup → onboarding steps 1-2 → SQL-confirmed
user_preferences row → dashboard "My Feed" toggle narrows 2622→816 and reverts
→ watchlist "My Commodities"/"Show All" toggle → drill-down "You follow this"
chip). Direct SQL/API verification remains the default per token-discipline
policy; Playwright is for visual/rendering/interaction checks specifically.
