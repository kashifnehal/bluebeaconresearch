# 14_CHANGELOG.md — Project Evolution & Chronological History

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

**Classification: Internal — CTO Level**

---

## PHASE 0 — ORIGINAL IDEA (Pre-project)

**Starting point:** The idea emerged from a simple frustration — commodity traders and importers consistently find out about geopolitical events AFTER markets have already moved. The Houthi Red Sea attacks in late 2023 were a perfect example: businesses that imported goods via that route found out about the disruption from their suppliers, not from any early-warning system.

**Original concept:** A news aggregation tool specifically for Indian commodity traders on MCX/NSE. India-focused. WhatsApp-native alerts. Simple severity scoring.

**Original name:** GeoSignal (later renamed Blue Beacon Research)

**Why India-first was discussed:** India has a large, underserved retail commodity-derivatives trader base (the "2.5M+" figure cited at the time was not independently sourced — see ADR 012 / D16). WhatsApp penetration is near-universal.

---

## PHASE 1 — CONCEPT EXPANSION

**Decision: Go global, not India-specific**
After evaluating the product-market fit more carefully, restricting to India was seen as a ceiling. GDELT, ACLED, Guardian API — all the data sources are global. Artificially restricting to India wastes the pipeline. Geopolitical intelligence is inherently global — "the Bloomberg for India" is weaker positioning than "the affordable Bloomberg for the world."

**Name change: GeoSignal → Blue Beacon Research**
- GeoSignal: generic, technical, forgettable
- Blue Beacon Research: specific, institutional, distinctive
- "Beacon" directly maps to the product (a signal that warns ships of danger)
- "Research" positions as a research firm, not an AI tool
- This distinction is critical: "AI tool" = cheap wrapper. "Research firm" = trusted, expert, premium.

**Positioning crystallised:**
"AI-powered with a team of researchers continuously analyzing the severity of news and its implications on trades." The word "researchers" was a deliberate choice — never say "AI models," always say "our team."

---

## PHASE 2 — ARCHITECTURE DECISIONS

**Tech stack decided:**
- Turborepo monorepo (apps/web, apps/backend, apps/mobile, packages/shared)
- Next.js 16 App Router (not Pages Router — server components for SEO)
- Fastify 4 (not Express — 2-3x faster JSON serialization)
- Supabase (Postgres + Auth + RLS + PostGIS — one vendor for DB + auth)
- BullMQ + Upstash Redis (async AI classification pipeline)
- Railway (backend + workers hosting)
- Vercel (web hosting)
- Claude 3.5 Haiku + Sonnet (classification + briefings)

**AI cost problem identified early:**
At 350 raw events per 15-minute GDELT cycle = ~33,600 events/day. Without pre-filtering, every event sent to Claude costs ~$0.40/1000 tokens. Risk: $400/month with zero revenue. Solution identified: keyword pre-filter before AI classification. Implementation: STILL PENDING as of August 2026.

> ⚠️ UPDATED 2026-08-19 — this "still pending" note is stale; the keyword pre-filter (`isRelevantEvent()` with `HIGH_RELEVANCE_KEYWORDS`/`EXCLUDE_KEYWORDS`) has since been implemented and is confirmed operational in `gdelt-collector.ts` and `gnews-collector.ts`.

**Data sources decided:**
- GDELT: free, updates every 15 minutes, global coverage, machine-readable
- ACLED: structured conflict data with GPS coordinates, actor information
- GNews API: general news with API key
- Guardian API: policy/economics coverage (planned, not fully integrated)
- US Treasury RSS, Federal Reserve RSS: sanctions and policy (planned)

**Why GDELT was chosen as primary:**
- Free
- Updates every 15 minutes
- Covers 100+ countries
- Structured format with Goldstein scale (conflict severity built in)
- GPS coordinates for chokepoint proximity calculation
- The backbone of every academic geopolitical risk study

---

## PHASE 3 — PRODUCT DESIGN

**The 7-page product structure decided:**
1. Landing page (/)
2. Auth suite (/login, /signup, /verify, /forgot-password)
3. Onboarding (/onboarding)
4. Intelligence Feed (/dashboard)
5. Global Map (/map) — BONUS, not originally planned
6. Watchlist (/watchlist)
7. Alerts (/alerts)
8. Backtesting (/backtesting)
9. Settings (/settings)
10. Event detail (/events/[id])

**The "research terminal" aesthetic decided:**
Every design choice reinforces "professional intelligence terminal":
- Dark backgrounds, green accent, monospace fonts for data
- "Node: BB-ALPHA-09" cosmetic branding
- "SECURE NODE: BB-ALPHA-09 • V4.22.0" on login
- "Terminal Sentinel v2.4.0-STABLE" in dashboard
- All caps section labels, military/operator language

**Pricing decided:**
- Free (Monitor): delayed 4 hours
- $49/month (Analyst): real-time + Telegram
- $199/month (Pro): API + backtesting + multi-seat
- $499/month (API/Institutional): full REST/WS API + webhooks

**Stripe decision: stub completely**
Building Stripe before first paying customer adds complexity with no revenue benefit. All users hardcoded to 'pro'. Implement Stripe only when first person asks to pay.

---

## PHASE 4 — INITIAL BUILD (Cursor/Antigravity sessions)

**What was built:**
- Full Turborepo monorepo with all 4 packages
- Complete Supabase schema: 15+ tables with RLS policies
- GDELT collector worker (every 15 min)
- ACLED collector worker (every 30 min)
- GNews collector worker (every 30 min)
- AI classifier worker (BullMQ, Claude 3.5 Haiku)
- Signal generator worker (Claude 3.5 Sonnet for severity ≥ 7)
- Alert dispatcher worker (Telegram + Slack + Webhook + Expo Push)
- Price syncer worker (Alpha Vantage — later found to be exhausted)
- Sanctions syncer worker (daily OFAC/EU/UN sync)
- All 10 pages of the web terminal
- Mapbox global conflict map
- BullMQ queue system with 4 queues
- Fastify API with 12 route groups
- Complete auth suite with Supabase SSR
- Onboarding flow (partial — missing region/commodity/severity steps)
- AccessLimitedModal (scarcity/waitlist gate)
- lib/flags.ts PROJECT_READY gate

**What was NOT built correctly:**
- Google OAuth: button exists, /auth/callback route missing
- Railway Root Directory: never set → backend never deployed
- Railway workers service: never created → workers never ran
- Signal pre-filter: never implemented → FIFA news as top signal
- Country extraction: broken → all signals show UNKNOWN
- Alpha Vantage: free tier exhausted immediately → watchlist blank
- Error boundaries: never created → crashes show white screen
- Settings tabs: only Account tab works, 4 tabs empty
- Telegram webhook: never set after deployment

---

## PHASE 5 — COMPETITOR RESEARCH UPDATE (July/August 2026)

**WorldMonitor grew:**
- From 41K to 59K GitHub stars (fastest growing open-source OSINT tool)
- Launched paid Pro tier with AI analyst chat, daily digests, MCP connectors
- Added sub-sites: finance.worldmonitor.app, commodity.worldmonitor.app, energy.worldmonitor.app
- This is the biggest competitive update since the project started

**New entrant: Earthian AI**
- Purpose-built geopolitical risk model for financial institutions
- Enterprise-only, API-first
- Not a direct competitor but validates the market

**Strategy confirmed: don't compete on breadth**
WorldMonitor wins on raw data breadth (500+ feeds, 21 languages, webcams). BBR wins on personalized alerts, commodity-specific backtesting, trader-first framing, economic calendar integration.

**Competitor gap identified: Economic Calendar**
Every tool traders use (ForexFactory, TradingEconomics, InvestingLive) has an economic calendar showing scheduled events (CPI, NFP, Fed decisions). BBR has none. This is the largest single competitive gap. Added to S1 (Should Have) backlog.

**New feature identified: Price-at-signal display**
Stocknews.ai shows "signal fired at $84.20 | now: $87.31 +3.7%" on every card. Traders immediately know if they're early or late. Added to backlog.

---

## PHASE 6 — CURRENT STATE (August 2026)

> ⚠️ UPDATED 2026-08-19 — this "current state" snapshot is itself an early, now-superseded point in the changelog (predates even the "9 migrations" / Railway-operational state described elsewhere in this doc tree). By the 2026-08-18/19 ground truth, Railway backend+workers are operational, the signal pre-filter and Google OAuth are fixed, Yahoo Finance replaced Alpha Vantage, and the alert-dispatch pipeline (a separate, later-discovered bug) has also been fixed. Treat this section as a historical snapshot, not current status.

**The app is live at bluebeaconresearch.com but:**
- Backend API has never deployed (Railway misconfiguration)
- Workers have never run in production
- All signals are from initial test ~4 months ago
- Signal quality is poor (FIFA Vancouver as top signal)
- Watchlist is blank (Alpha Vantage exhausted)
- Google OAuth broken
- 6 critical issues blocking real launch

**Next immediate steps:**
1. Add Railway billing ($1.00 credit left)
2. Set Root Directory in Railway Settings → deploy API
3. Create second Railway service for workers
4. Fix signal quality pre-filter
5. Replace Alpha Vantage with Yahoo Finance
6. Fix Google OAuth
7. Wire all non-functional UI elements
8. Open to public users

---

## PHASE 7 — RELIABILITY, VERIFICATION & DOCUMENTATION HARDENING (2026-08-18 to 2026-08-19)

**Everything in "PHASE 6 — CURRENT STATE"'s blocker list above is now resolved.** See `docs/brain/14_CHANGELOG.md` v0.19.0 through v0.23.0 for the full technical record — this entry is a narrative summary for this tree, not a replacement for that log.

- **Alert dispatch found completely non-functional and fixed**: every collector was inserting signals correctly, but nothing had ever triggered dispatch to any channel (Telegram/Slack/webhook/push) — a wiring gap upstream of credentials, not a config problem. Fixed by calling the dispatch logic inline from each collector right after insert, mirroring the pattern already used for inline classification. The dormant BullMQ queue this bypassed was kept in code, not deleted, and clearly commented as reserved/inactive.
- **Password reset, login-redirect, and Tailwind styling bugs** across the most-rendered dashboard components (SignalCard, SeverityBadge, CommodityChip, PriceTicker, Logo, and the auth pages) fixed. A related, deeper Tailwind token-naming fragmentation was found still open in the shadcn UI primitives and two other pages — flagged, not yet fixed.
- **Observability wired for the first time**: Sentry (web app had zero wiring despite the dependency being installed), PostHog (signup → first-signal-view → first-alert-rule funnel), a CI gate (`type-check` on every push/PR, previously nothing ran automatically).
- **Database cleanup**: a stale, actively-misleading `production_schema.sql` (described 4 of 17 real tables) deleted; RLS policy consolidation, six missing indexes, and a duplicate-signal guard shipped in a new migration, applied to the live database and verified via Supabase's own Security/Performance Advisors — not just assumed from a clean `git commit`.
- **Auth & UX items re-verified live**, not just re-read from code: Watchlist's "Select All," the price-history sparkline, dropdown styling consistency across three pages, and the onboarding walkthrough were all driven through a real browser session with a throwaway test account to confirm they actually work, after a prior report on these had gone unconfirmed for several days.
- **The `signal-generation` dormant-queue bug** (severity ≥7 briefings never actually generating — confirmed 0 of 423 qualifying signals had one, ever) found and fixed the same way alert-dispatch was.
- **Geocoding investigated and explicitly deferred past launch by founder decision** — confirmed still using region-centroid-plus-jitter, not real per-article coordinates; not fixed, not forgotten, a deliberate scoping call pending either a geocoding API integration or a much larger gazetteer.
- **This documentation pass itself**: both `docs/brain/` and `docs/claude_project/` annotated in place — additive only, nothing deleted or reworded — to close the gap between what these planning docs said and what's actually true as of 2026-08-19. Also surfaced, as a decision point for the founder rather than something resolved here: several filenames exist in both doc trees as either true forks (same origin, diverged) or entirely different documents that happen to share a name — and separately, `docs/claude_project/22_IMPLEMENTATION_LOG.md` was found to be a content-identical copy of `docs/brain/CLAUDE_CONTEXT.md` under a different filename, missed by the filename-based duplicate check until read directly.

---

## PHASE 8 — PERSONALIZATION, ALERTS REWORK, DAILY DIGEST (2026-09-07)

> Narrative summary for this tree. Full technical record: `docs/brain/14_CHANGELOG.md` v0.34.0 and `docs/brain/LIVE_TODO.md`.

- **Personalization core (#81)** — `user_preferences` (which already existed since the init schema) extended by an additive migration: `onboarding_completed_at`, `created_at`, and reserved `forex_pairs`/`equity_tickers` columns. `/onboarding` became a 2-step wizard whose second step captures the commodities and regions a user follows. A new `/api/signals?personalized=true` mode (default **off**) narrows the feed to signals overlapping those saved preferences; the dashboard shows a "My Feed / Full Feed" toggle. Personalized responses are never written to the shared response cache.
- **Watchlist preference-awareness (#89)** — `/watchlist` now seeds its default commodity list from the user's saved preferences instead of a hardcoded pair, with a "My Commodities / Show All" toggle and a "You follow this" chip on the per-commodity drill-down.
- **Alerts reframe (#82)** — every alert on `/alerts` and every Telegram/Slack alert message is now structured into four labelled sections: **Event → Why it matters → Which instruments → Alert threshold**. When the deeper analyst briefing isn't available (no Anthropic credit that cycle) the card shows the plain event summary with an honest note rather than inventing a rationale — consistent with the no-fabricated-data rule. Each alert links back to the source article(s) it was built from, and the page carries one non-intrusive "informational only, not financial advice, never a buy/sell recommendation" line. The existing per-rule severity threshold (`alert_rules.min_severity`) is now surfaced as a prominent "alert only above this threshold" control instead of being buried in the rule-creation modal.
- **Personalized daily digest (#83)** — a new once-daily email (06:00 UTC, `node-cron` in the workers service) sends each onboarded user their own top 5 signals from the last 24 hours, filtered to the regions and commodities they follow (not a global top-5), in the same four-section framing as the in-app card. Sent through the **existing Resend account** (verified domain `send.bluebeaconresearch.com`) — no new email provider. A "Daily Digest" opt-out toggle was added to Settings → Notifications, backed by a new `user_preferences.digest_enabled` column (default on). ~~**Open production step:** `RESEND_API_KEY` still needs to be set on the Railway `workers` service~~ — **resolved same day**, and the **full production cron path is now end-to-end confirmed**: a one-off verification (no code change) briefly re-pointed `DIGEST_CRON` at a near-term time, and the deployed `workers` service's own cron callback ran `runDigestOnce()` and delivered a real personalized digest via the Railway key (Resend id `ffc24290-8ad1-4338-ac15-9c24707f60a1`, status delivered, distinct from the earlier manual test send `e06df2b3-…`). `DIGEST_CRON` was reset to `0 6 * * *`.
- **Verification** (founder-mandated, done): Playwright screenshot of the reworked alert card; three real Telegram messages from a live dispatch; a direct SQL check proving the digest pulled a test user's preference-matched signals rather than the global top-5; one real digest email delivered through Resend; and (2026-09-07) a one-off production run of the deployed worker's own digest cron delivering a real email via the Railway `RESEND_API_KEY`. No billing/payment code touched; the anti-fatigue `min_severity` default left unchanged.
- **Economic calendar (#86), same day** — a new `/calendar` page: this week's events and a longer upcoming list (Fed, ECB, BOJ, US CPI/NFP/GDP, the OPEC oil market report), a live countdown to the next high-impact release, and 🔴/🟡/🟢 impact indicators. Ships on a **static, manually-curated data file** rather than a paid calendar API, by deliberate choice — every date was pulled from the relevant institution's own published schedule, not guessed, and no OPEC+ ministerial meeting date is shown for this window because none has been published yet. Forecast/Previous/Actual are intentionally blank (no live feed exists yet) rather than invented. A live provider can replace the static file later without touching the page itself. Full detail: `docs/brain/14_CHANGELOG.md` v0.35.0.

---

## PHASE 9 — FOREX PAIR TAXONOMY #87 (2026-09-09)

> Narrative summary for this tree. Full technical record: `docs/brain/14_CHANGELOG.md` v0.36.0 / v0.36.1 / v0.36.2 and `docs/brain/LIVE_TODO.md` (#87). Cleared by ADR 013's forex-only softening — equity stays separately gated.

- **Phase 1 — schema + classifier + price sync (`a15e2fd`, backend-only).** New additive `signals.currency_pair_impacts jsonb` column (migration `20260909035949_forex_pair_impacts.sql`), mirroring `commodity_impacts`. `claude.service.ts` gained `ALLOWED_FOREX_PAIRS` (EURUSD|GBPUSD|USDJPY|USDCHF|USDRUB|USDCNY), a forex alias map, `normalizeForexPair()`, `sanitizeForexImpacts()`, and a `currencyPairImpacts` field in the Claude prompt / `ClassificationResult`. `EURUSD`/`USDRUB` were **removed** from `ALLOWED_COMMODITY_ASSETS` — they were never commodities; historical `commodity_impacts` rows were left as-is, not backfilled. Heuristic fallback covers USDRUB (Russia + sanctions) and USDCNY (China + tariff/Taiwan) only; the other four pairs are AI-only on that path. `price-syncer.ts` now also syncs 6 Yahoo `<PAIR>=X` forex tickers into the (misnamed) `commodity_prices` table.
- **Phase 1B — close the live-ingestion gap (`abb2004`, backend-only).** Phase 1 only wired the dormant `ai-classifier.ts`, so no production signal actually carried `currency_pair_impacts`. Added it to the three real signal-creation inserts — `signal-merge.ts` `insertOrMergeSignal()` (the live rss/gnews/gdelt path), `reconciliation.ts`, `acled-collector.ts`. ADR 010 merge semantics preserved: impacts are written once at row creation and never rewritten on a duplicate/escalation merge, exactly as `commodity_impacts` always has been.
- **Phase 2 — onboarding, feed filter, watchlist (`55df380`, `apps/web` + `packages/shared`).** Wires the until-now-unused `user_preferences.forex_pairs` column into the **existing** #81/#89 mechanisms — no second onboarding flow, no new feed-filter param, no separate watchlist toggle. New shared `FOREX_PAIRS` constant. `/onboarding` step 2 gained a "Currency pairs you follow" chip list using the same helpers as the commodities list. `/api/signals?personalized=true` now also matches each saved pair against `currency_pair_impacts`, folded into the same single `OR` filter, and returns `currencyPairImpacts` in the payload. `/watchlist` seeds its "My Commodities / Show All" default from `commodities ∪ forex_pairs` and lists all 13 assets; `/api/prices`' Redis-fallback symbol list was widened. **A latent bug was fixed in passing:** the onboarding `user_preferences` upsert lacked `onConflict: "user_id"` (the table's PK is `id`, with a separate UNIQUE on `user_id`), so for any user who already had a preferences row it 409'd and silently dropped every captured preference — commodities and regions included, not just the new forex field.
- **Verification (Playwright + SQL).** Phase 1: `information_schema`, a real Claude classification (USDRUB landed in `currency_pair_impacts`, not `commodity_impacts`), a forced heuristic run, a real price-sync run. Phase 1B: a real Russia-sanctions event through the live path stored a row matchable by the same jsonb-contains operator production commodity matching uses. Phase 2: real login → onboarding wrote `forex_pairs=["EURUSD","USDCHF"]`; a personalized feed with only those two prefs returned exactly the one signal carrying a matching `currency_pair_impacts` and turning personalization off restored the full feed; `/watchlist` showed both pairs with live prices and the "My Commodities" ⇄ "Show All" toggle round-tripped.
- **Not done:** phase 3 (alert_rules / dispatcher / digest forex matching + a real forex Telegram alert). Known limitation carried forward: the `/watchlist/[symbol]` drill-down still keys off `COMMODITIES`/`?commodity=` only, so a forex card links to a degraded drill-down.
