# Live Task Tracker

Status icons: 🔴 blocking · 🟡 ready · ⚪ not started · 🤔 needs founder decision · ✅ done, verified.
[founder-led] = founder's own action, no engineering needed.

## Closed, verified
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
