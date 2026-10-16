# 09_BACKLOG.md — Complete Product Backlog

> **📍 Doc status — live numbered-ticket queue as of 2026-10-16.** Per-commit evidence: `docs/brain/LIVE_TODO.md`. `claude/23_TODO.md` is not in this repo.

> ⚠️ UPDATED 2026-10-16 — Public pages hide the collection schedule (`apps/web`). Dashboard, map, and alerts no longer show the ingestion status box. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-16 — Docs only. Sources monitored is 30 (28 RSS feeds plus GDELT and GNews). The homepage signal count uses a head request with an exact count. Web functions run in `iad1` and the database is in `ap-south-1` (Mumbai), measured 2026-10-16 from the `Server-Timing` header. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-16 — Event price quotes overlap the raw-event read (`apps/web`). Three queries per commodity impact. Flag time and latest start with the other optional reads. The report-time quote still waits for the earliest raw stamp. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-16 — Client fetches stop after 20 seconds (`apps/web`). Dashboard, map, watchlist, the symbol page, and alerts show a retry line when a fetch times out or fails. `GET /api/signals` adds `degraded: true` on an empty error body when there is no cached payload. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-16 — Row-security initplan and six foreign-key indexes (migration written, not applied). No other index is dropped. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-16 — Public pages and a closed daily cap (`apps/web`). When the daily budget is closed, the public status page and the dashboard show no pause wording. `budgetClosed` stays on the status API. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-16 — Service health retention (`apps/backend`). Sunday 03:00 UTC deletes rows older than 45 days. The 45-day window is an engineering choice. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-16 — Sanctions sync writes only changed rows (`apps/backend`, function written, not applied). Health detail is `fetched N, changed M`. A missing function falls back to the previous upsert for that run. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-16 — Price and sanctions indexes (migrations written, not applied). `commodity_prices_fetched_at_idx` records an index already created in production on 2026-10-16. `idx_sanctions_entities_name` is dropped. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-16 — Weekly gate pass rate (`apps/backend`, `d3aaa36`). Passed counts signals created in the week that include a raw event. Prefilter skips are left out. No cutoff. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-16 — Feed quiet-gap alarm after a pause (`apps/backend`, `e572d62`). Silence starts at the later of last_seen and the resume check. A degraded row waits for two quiet checks. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-16 — How-it-works signal counts (`apps/web`, `d165222`). Both counts are head-only. A total of 0 stays hidden. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-15 — P24 colour tokens (`apps/web`, `b00cfc0` and this commit, PHASE 172 / v0.195.0). Six hex colours now use existing CSS variables. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-15 — Collection gaps. 2026-10-11 08:00 UTC to 2026-10-14 07:30 UTC: no signals were created because the Anthropic Console monthly limit was reached; collection stored 96 rows a day; articles not stored in that window were not recovered. 2026-10-14: the $2 daily ingestion cap was reached at 12:31 UTC; collection pauses until 00:00 UTC; the dashboard and status page say so.

> ⚠️ UPDATED 2026-10-15 — Status check retry and cached homepage count (`apps/web`, `cdcccdd`). A slow database no longer drops the homepage total or leaves a timed-out check as Unknown without a retry.

> ⚠️ UPDATED 2026-10-15 — Share card (`apps/web`, `709827a`). Root metadata points at the www host for Open Graph and Twitter.

> ⚠️ UPDATED 2026-10-15 — Signup source without a cookie (`apps/web`, `9da1540`). Campaign tags and an external referrer host are saved on email signup.

> ⚠️ UPDATED 2026-10-15 — Singular count-line wording recorded (docs only, `04af752`). The wording shipped in `2c977d8`.

> ⚠️ UPDATED 2026-10-15 — Safety commits merged (`2c1406c`). Merge only.

> ⚠️ UPDATED 2026-10-15 — Materiality-gate health row (`apps/backend`, `3339434`). `service_health_events.raw_event_id` is written and not applied.

> ⚠️ UPDATED 2026-10-15 — Claude signals with no event category (`apps/backend`, `06d420d`). A missing category is guarded. A day with no Claude rows stays ok.

> ⚠️ UPDATED 2026-10-15 — Weekly materiality-gate counts (`apps/backend`, `34a5ca2`). No pass-rate target.

> ⚠️ UPDATED 2026-10-15 — RSS quiet-gap alarm (`apps/backend`, `5a04fcb`). View `public.feed_gap_p95` is written and not applied.

> ⚠️ UPDATED 2026-10-15 — Digest deferred window (`apps/backend`, `789d422`). Deferred digest signals must be created within 24 hours.

> ⚠️ UPDATED 2026-10-15 — Monthly Anthropic spend warning (`apps/backend`, `24b92ce`). Idle unless `ANTHROPIC_MONTHLY_LIMIT_USD` is set.

> ⚠️ UPDATED 2026-10-14 — Off-by-default retrieval terms (`apps/backend`, `32872dc`). `T2_PAIR_RULE`, `GNEWS_T2_QUERY`, and `GDELT_T2_QUERY` default off.

> ⚠️ UPDATED 2026-10-14 — Diagnostic tables and drop logging (`apps/backend`, `4cc10c2`). The two public diagnostic tables were applied 2026-10-14. GNews and GDELT log relevance drops. `GATE_SHADOW_ENABLED` stays off.

> ⚠️ UPDATED 2026-10-15 — Signal count line (`apps/web`, `2c977d8`, PHASE 171 / v0.194.0). "1 signal loaded" and "1 day" when the number is 1. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-15 — P13 region backfill (`320453f`, PHASE 170 / v0.193.0). Migration `20261015150000_signals_region_raw.sql` is written, not applied. The backfill was not run with `--apply`. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-15 — P12 region canon (`apps/backend` + `packages/shared`, `fc9113c`, PHASE 169 / v0.192.0). Eight canonical region ids. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-15 — Map locations (`apps/web`, `2c977d8`, PHASE 168 / v0.191.0). Country "Global" is not a place on the Locations list. "European Union" stays. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-15 — Watchlist pulse tiles (`apps/web`, `f2bf0f1`, PHASE 167 / v0.190.0). `/watchlist/[symbol]` counts signals published in the last 24 hours against the prior 24 hours, for priced and news-only assets. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-15 — Speed and timing claims (docs only, b9f7084, PHASE 166 / v0.189.0). A speed superlative stays off the site until a public benchmark exists. The tagline "Intelligence before markets move." is HOLD. Seven queue lines are not started. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-15 — UTC clock and open-budget badge (`apps/web`, 3071abb, PHASE 165 / v0.188.0). Signal Clock cells show UTC. The homepage badge says collection runs while the daily budget is open. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-15 — Homepage and dashboard check points (`apps/web`, 847e9ac, PHASE 164 / v0.187.0). Homepage and dashboard copy name the collection interval and where to check the clock, the sources, and the price baseline. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-15 — Signal clocks (`apps/web`, `379b782`, PHASE 163 / v0.186.0). Signal detail shows source time, fetch time, flag time, and delay. The price line is a timeline. Feed tags say "Reported" or "Flagged". No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-15 — GNews plan switch (`apps/backend`, b5b7be0, PHASE 162 / v0.185.0). `GNEWS_PLAN` is unset in production, so the collector still sends one query at `max=10`. Exactly `essential` sends every query at `max=25`. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-15 — Read-only news-delay probe (`apps/backend`, `303bbd7`, PHASE 161 / v0.184.0). GNews and Marketaux can be polled into a local file and compared with rss rows. No database writes. Poll was not run. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-15 — Breadth close (docs only, PHASE 160 / v0.183.0). Seven tier-2 assets are event-only. `DROP_SAMPLE_STORE` is on; `T2_PAIR_RULE`, `GNEWS_T2_QUERY`, `GDELT_T2_QUERY`, and `GATE_SHADOW_ENABLED` are off. Still open: the classifier mapping test, a tier-2 reference set, and switching the retrieval flags on one at a time. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-15 — Intelligence Feed pause sentence (`apps/web`, 0b8d1f0, PHASE 159 / v0.182.0). A closed daily classification budget puts a period before the pause sentence on the `/status` Intelligence Feed detail. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-15 — Underscore registry symbols (`apps/web`, 5345bdf, PHASE 158 / v0.181.0). `VEG_OILS`, `TTF_GAS`, and `HEATING_OIL` pass the driver-breakdown charset and still have to be a known symbol. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-15 — News-only symbols on the driver-breakdown route (`apps/web`, 95c13bd, PHASE 157 / v0.180.0). `COFFEE` and the other news-only symbols that pass the existing symbol pattern are no longer `400 unknown symbol`. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-15 — Signal detail step timings (`apps/web`, 5879fc5, PHASE 156 / v0.179.0). `GET /api/signals/:id` sends `Server-Timing` only when `SERVER_TIMING` is exactly `true`. Body, status codes, and queries are unchanged. This route does not call the rate limiter. The host variable is not set in 5879fc5. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-15 — Ingestion banner when the daily classification budget is closed (`apps/web`, fa40d4b, PHASE 155 / v0.178.0). The live-ingestion box no longer reads as a healthy cycle when every collector is budget-closed. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-14 — Map locations list (`apps/web`, cd1cf7f, PHASE 154 / v0.177.0). The map groups its current signals by country and lists each chokepoint with a count inside 500 km. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-14 — News-only watchlist cards and detail pages (`apps/web`, 5261650, PHASE 153 / v0.176.0). The seven news-only commodities can be added, followed, and opened without a price. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-14 — Daily limit on pair-only keeps (`apps/backend`, 53f2543, PHASE 152 / v0.175.0). At most 20 headlines a UTC day are kept only by the commodity-and-event pair rule, counted in memory, and the count also resets on process restart. No prior numbered backlog line — nothing struck. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-14 — Feed table hide-summaries and loaded-row count (`apps/web`, c206391, PHASE 151 / v0.174.0). Table mode can hide Summary. A line above the table counts loaded rows, UTC days, Up, Down, and Other. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-14 — Quick-view report count, unique sources, and headlines (`apps/web`, e20a43f, PHASE 150 / v0.173.0). The drawer fetches the signal detail route while open. `sources[].domain` falls back to the article URL hostname. No prior numbered backlog line. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-14 — News-only commodity tags (`packages/shared` + `apps/backend` + `apps/web`, e4a5409, PHASE 149 / v0.172.0). Vegetable oils, soybeans and soy oil, sugar, coffee, cocoa, aluminium, and nickel can be classified and filtered in the feed. They have no price. No prior numbered backlog line — nothing struck. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-14 — Faster USOIL market-impact reads (`apps/web`, ff8d968, PHASE 148 / v0.171.0). Outcome pages after the first are read together and a successful read is cached 5 minutes. No prior numbered backlog line — ad-hoc production latency, not a queued ticket. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-14 — Weekend-proof watchlist sparkline (`apps/web`, 874c216, PHASE 147 / v0.170.0). The list sparkline uses a 7-day, 14-point sample and states when the price did not change, instead of drawing equal bars from the last 12 identical snapshots. No prior numbered backlog line — ad-hoc closed-market display fix, not a queued ticket. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-14 — Replay gate (`apps/backend`, ad6651a, PHASE 146 / v0.169.0) now sends the live article excerpt, labels GNews publishers by `source.name`, draws its 150 rows with a printed seed, and accepts `--ids` / `--repeat`. No prior numbered backlog line — Run F follow-up, not a queued ticket. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-14 — Reconciliation recovered-signal alerts now honor the 24h intake window (`apps/backend`, 67d97ea, PHASE 145 / v0.168.0). No prior numbered backlog line — ad-hoc intake-policy gap on the 36h orphan recovery path, not a queued ticket. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-10 — Backend build fix (`244dd75`) + onboarding "request a market" field (`cfa4e54`) + ADR 041/D45 asset-admission-by-coverage-state docs. No prior numbered backlog line for any of the three — the build fix and onboarding field were ad-hoc, not queued tickets, and the ADR is a docs-only decision. Full detail: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-10-10 — W-REGISTRY: single `COMMODITY_REGISTRY` (`packages/shared`) now sources every per-commodity-asset fact (Yahoo ticker, Claude allowlist/alias, RSS filter anchor) that `price-syncer.ts`, `claude.service.ts`, `relevance-filter.ts`, and `price-history.ts` previously hand-duplicated (brain changelog v0.160.0 / PHASE 137). No asset or behavior changed. No prior numbered backlog line — this was an internal code-structure cleanup, not a queued ticket.

> ⚠️ UPDATED 2026-10-09 — W14-W: `PriceTicker` stale threshold now 60 min, `LegalDisclaimerFooter` links GDELT Project attribution, dashboard/map/watchlist show a "Data as of" stamp (`8edc57d`, brain changelog v0.159.0 / PHASE 136). No prior numbered backlog line — nothing struck.

> ⚠️ UPDATED 2026-10-09 — W14-1: RSS official-tier feeds (EIA/Fed/ECB/BoE/USTR/RBI/BoJ) get a 24h age window and skip the keyword gate; exclude keywords split hard/ambiguous; historical-year exclude is log-only; price sync decoupled to its own `PRICE_SYNC_CRON` (`96ff0e7`, brain changelog v0.158.0 / PHASE 135). No prior numbered backlog line — nothing struck.

> ⚠️ UPDATED 2026-10-09 — `/about` "01. Event Detection" sentence corrected to drop "ACLED and GNews" in favor of "GDELT, news APIs and RSS feeds" (`8025544`, brain LIVE_TODO, PHASE 134). No prior numbered backlog line existed for this — confirmed by grep for the old sentence, nothing struck.

> ⚠️ UPDATED 2026-10-09 — real logo/favicon shipped across `apps/web` + `apps/mobile` (brain changelog v0.157.0 / PHASE 133). Replaced Next's default scaffold favicon, a generic Lucide `Shield` icon stand-in on `login`/`signup`, and Expo's default mobile-icon scaffold with the founder's real logo. No prior numbered backlog line existed for this — confirmed by grep for a logo/favicon/branding ticket, nothing struck.

> ⚠️ UPDATED 2026-10-09 — homepage pricing buttons and `/terms` age line (`711aff8`, brain changelog v0.156.0 / PHASE 132). Analyst and Pro say "Paid plans opening soon"; Monitor stays "Get started". Accounts and access now requires age 18. No prior numbered backlog line — confirmed by grep for a pricing-button or age-gate ticket, nothing struck.

> ⚠️ UPDATED 2026-10-09 — `/privacy` payment and analytics sentences corrected to match the code (brain changelog v0.155.0 / PHASE 131). No prior numbered backlog line — the earlier privacy note below stays as the rewrite record.

> ⚠️ UPDATED 2026-10-09 — homepage step 02 and a seventh `/how-it-works` claim row now state what Claude does (market-impact classification) and does not do (no position, size, or entry/exit recommendation). Brain changelog v0.153.0 / PHASE 129. No prior numbered backlog line — confirmed by grep for a Claude-disclosure ticket, nothing struck.

> ⚠️ UPDATED 2026-10-09 — public `/about` page shipped (brain changelog v0.152.0 / PHASE 128). No prior backlog line existed for this page — confirmed by grep for `/about`, nothing struck.

> ⚠️ UPDATED 2026-10-09 — `/privacy` rewritten from verified code (brain changelog v0.151.0 / PHASE 127). No prior backlog line existed for this page — confirmed by grep for `privacy`, nothing struck.

> ⚠️ UPDATED 2026-10-09 — public `/terms` page rewritten from the "Legal Protocol" stub into a Terms of Service (brain changelog v0.150.0 / PHASE 126). Homepage footer no longer says "full docs coming soon." No prior numbered backlog line existed for this page (the only `/terms` mention below is the #186 "no Stitch mock" note, which is a layout note, not an open terms-copy ticket — left as-is). Subscriptions and billing was not added; there is no live checkout in `apps/web`.

> ⚠️ UPDATED 2026-10-07 — shipped 2026-10-06, recorded here with the commit: classifier defer `0c9b4b6`; budget-closed status copy `c468485`; classifier excerpt `cf0711f`; cap-closed email `41c19ce`; deferred classify on ACLED and the dormant classifier `5707819`; public copy `c0e1f60`; outcome tracker `a186404` (723 outcome rows written on 2026-10-06); citation cleanup `e51bb1e`; events POST moved out of the route file `6a88053`; view `feed_yield_daily` `b4b52f1` (written, not applied); GDELT DOC diagnosis `48f77ce` (list frozen 2026-10-05 12:00 to 2026-10-06 07:00 UTC, recovered at 10:00 UTC); keyword-fallback copy `7438ec9`. GDELT `maxrecords` is 250 (`3d5e244`, 2026-09-26). A GDELT HTTP 429 gets one retry then stops (`e677efc`, 2026-09-06). Merge threshold is 0.33 on summaries since 2026-09-25 (`d67ae2b`). None of these were numbered tickets in the table below.

**Classification: Internal — CTO Level**
**Priority method: MoSCoW (Must / Should / Could / Won't)**

> ⚠️ UPDATED 2026-08-19 — this backlog reflects a much earlier project phase (basic Railway deployment setup, Google OAuth setup, FIFA-appearing-as-a-signal quality bugs). Most items here (M1–M24, and most S-items) are long since resolved; it's kept as a historical record, not a current punch list. Note also that M23 ("Add PORT=8888 env var") was itself based on a since-corrected mistaken belief — the actual backend port default is 3001, not 8888.

> ⚠️ UPDATED 2026-09-11 — the #104–#128 queue (parked as plans on 2026-09-11) is now tracked in **NUMBERED TICKETS** below. Shipped items use this file's existing close-out convention (strikethrough + **Done DATE**, same as S1/#86 and C3/#83). Per-commit evidence lives in `docs/brain/LIVE_TODO.md`, not here.

> ⚠️ UPDATED 2026-09-23 — **#186 full responsive rework (mobile + tablet)** added. Phases 1+2 shipped (PHASE 51); Phases 0 and 3–6 remain open. Phase 0 is blocked on Claude Design authorization (`/design-login`). Live per-phase status: `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-09-29 — current-table signal archive/search page shipped at `/archive` (v0.126.0 / PHASE 103). Looks up the live `signals` table (no severity floor, no recency cutoff). **C17 (40-year GDELT historical archive) stays open** — this is not that work.

> ⚠️ UPDATED 2026-10-01 — public `/how-it-works` research-integrity page shipped (W2-TRUST, brain changelog v0.135.0 / PHASE 112). Claim/proof table (6 claims, each checked against code or live data, none quoting an accuracy percentage) + a 3-number live stats bar. No prior backlog line existed for this page — confirmed by grep, nothing struck.

> ⚠️ UPDATED 2026-10-07 — W12-C shipped: routine insider-trade and analyst-rating headlines are dropped in the shared relevance filter (`apps/backend`). No prior backlog line existed for this filter (nothing struck). Brain changelog v0.148.0 / PHASE 124.

> ⚠️ UPDATED 2026-10-02 — **PERS-Pn: alert match-reason** shipped (brain changelog v0.136.0 / PHASE 113), `apps/backend` + `apps/web` — `alerts_sent.match_reason` (tier 1/2/3 + the matched watchlist/commodity/region/forex values), surfaced as one plain line on both the chat delivery and the `/alerts` web card. **Migration written, not yet applied to the live DB** — see `16_MIGRATION_CHECKLIST.md`; treat as not fully live until a human applies it. No prior backlog line existed for this ticket (searched for `PERS-P` and `match_reason` — confirmed by grep, nothing struck).

---

## #186 — FULL RESPONSIVE REWORK (MOBILE + TABLET)

**Re-planned 2026-09-23** around the Stitch mobile mocks (`docs/stitch_mobile/`, commit `d10626b`) as layout references — see D29/ADR 025 in `10_DECISIONS.md`. **The phase numbers below replace an earlier plan's numbering** (an earlier "Phase 1+2" covered the iOS-zoom/type-floor/public-header work; that work is complete and is folded into "Foundations, already shipped" below rather than kept as Phase 1/2, to avoid two different things both being called "Phase 1" in this doc).

Design floor is **360px** (two of the top six real mobile resolutions worldwide). Test matrix: 360 / 390 / 414 / 768 / 1024 / **1440 desktop** (added — every phase is checked against desktop too, per founder instruction that desktop must not regress). Tailwind default breakpoints kept — the sidebar already breaks correctly at `md`.

**Foundations, already shipped (pre-dates the re-plan):** iOS input zoom, 328-occurrence sub-12px type floor, 2 table-clipping fixes, public `/accuracy`+`/status` header → shared `PublicHeader` (PHASE 51, `10ade7a`).

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Copy integrity (backtesting footer, dashboard confidence badge) + design-system declaration | ✅ Done 2026-09-23 (PHASE 54) |
| 2 | `/alerts` + `/calendar` mobile overflow fixed (root cause was page-level duplicate margins, not TopBar) | ✅ Done 2026-09-23 (PHASE 55) |
| 3 | Mobile bottom tab bar (FEED/MAP/ALERTS/WATCHLIST/MORE), new `MobileTabBar.tsx` | ✅ Done 2026-09-23 (PHASE 56) |
| 4 | Map → bottom sheet on mobile; fixed a real pre-existing popup bug too | ✅ Done 2026-09-23 (PHASE 57) |
| 5a | 4 pages with the same critical bug as Phase 2 (`settings`/`backtesting`/`watchlist`/`watchlist/[symbol]`, worse severity), `ALPHA` badge + 1 military-clearance string removed | ✅ Done 2026-09-23 (PHASE 58) |
| 5b | `/events/[id]` tab-clipping bug fixed; full 44×44 tap-target sweep complete — shared components + all per-page dense controls (selects, chips, toggles, range buttons) across all 24 pages; overflow verification method fixed (nested-overflow check, ADR 026) | ✅ Done 2026-09-23 (PHASE 59-63) — the `/dashboard` overflow fix shipped here was later found insufficient (readable ≠ overflow-free) and properly fixed under Phase 7, see row above |
| 6 | 768px tablet pass — 22 of 23 verifiable routes checked (onboarding excluded per standing policy). Found & fixed a shared root-cause bug on 6 pages (backtesting/settings/watchlist/watchlist[symbol]/alerts/calendar): each built its own redundant wrapper reserving an unjustified ~260px right gap with no matching content — invisible at 1440px desktop, but left as little as ~190px real width at 768px. Alerts additionally had a doubled left margin on top of it. Also fixed: watchlist's FAB was anchored to the old dead space; alerts' source-citation link needed a tablet-tier max-width. | ✅ Done 2026-09-24 (`e1b0942`) |
| 7 | Readability regressions found via real screenshots + full 14-mock Stitch review — `/dashboard` feed rows, `/alerts` rule-name truncation, `/calendar` table column order (→ mobile stacked cards) | ✅ Done 2026-09-24 (`ec3e6b4`/`1f44534`/`2c46df9`) |
| 8 | Same pattern found on 3 more pages by a stricter, full-scroll-through review: homepage density + CTA-overlap regression, `/backtesting` simulations row, `/accuracy` table (same off-screen-column bug as old `/calendar`); plus `/events/[id]` headline, `/admin/metrics` copy, `/dashboard` filter-bar density | ✅ Done 2026-09-24 (`473ac8d`/`0d2796c`/`5644617`/`2386b69`/`7500953`/`ec3e6b4`) |
| 9 | **Not a Stitch phase** — founder pivot 2026-09-24: stop comparing against mocks, verify every button/link that exists on **desktop** also exists and works on **mobile**. Grepped every `hidden md:/lg:/sm:` instance app-wide (16 total); 4 real gaps found. Fixed 3: Replay Tour had no mobile trigger, map's tension-index info tooltip was desktop-only, `MediaImpactTag`+source-confirmation badge hidden on mobile stream rows. Quick View modal (desktop-only, mobile substitutes full navigation) flagged as a design call, not auto-fixed. | ✅ 3/4 fixed 2026-09-24 (`38dfe8b`) |

**No Playwright / new test infra** (founder decision, 2026-09-23) — manual multi-width verification per phase instead. `DesignSync` (Claude Design) is authorized but unused for this work — the mocks already exist in-repo.

**Manual pre-merge checklist** (since there's no automated regression test): before any #186 commit, check every touched route at 360 / 390 / 414 / 768 / 1024 / **1440**. Two checks, not one — **`document.documentElement.scrollWidth - clientWidth` alone is NOT sufficient** (found 2026-09-23, PHASE 63, after the founder caught real overflow the document-level check had been missing across every prior phase): also walk every element and flag any with computed `overflow-x: auto`/`scroll` whose own `scrollWidth > clientWidth` — any container using `overflow-y-auto` auto-computes `overflow-x: auto` too per the CSS Overflow spec, creating an invisible nested horizontal-scroll region that never shows up in the document-level number. This is a process substitute for the declined Playwright suite, not new infra; it costs a few lines of JS per width and catches the class of regression the document-level check alone cannot see.

**7 routes have no Stitch mock**: `/verify`, `/confirm`, `/forgot-password`, `/reset-password`, `/privacy`, `/terms`, `/help`. Four sit directly in the signup/recovery flow a brand-new user walks first. No mocks will be commissioned for these — Phase 5 gives them the same treatment as their nearest mocked analog (`/verify`/`/confirm`/`/forgot-password`/`/reset-password` inherit `login`/`signup`'s layout; `/privacy`/`/terms`/`/help` just need single-column padding + the existing type floor, no new layout decision). Naming this explicitly so these 7 aren't silently skipped when the file-by-file phase wraps up.

`/map` is fixed (PHASE 57) — 0% → 100% map visible on a phone, plus a real pre-existing `MapSignalPopup` bug (negative width below ~416px) fixed along the way. `/alerts` is fixed (PHASE 55); its 183px overflow at exactly 768px is a known, tracked Phase 6 item, not a regression.

**All 24 routes under `apps/web/app` have been checked at least once** (fixed, or confirmed already mobile-safe) as of 2026-09-23 — see `docs/brain/HANDOFF_186_PHASE5.md` for the full per-page table. **44×44 tap-target sweep: fully closed 2026-09-23 (PHASE 59-62)** — homepage footer, `TopBar`, `PublicHeader`, all 5 auth pages, and every per-page dense control (filter selects via the shared `SELECT_CLASSES`, desk/toggle/range buttons, watchlist chips + remove buttons, map's MapLibre zoom controls, admin tabs) fixed — full breakdown in `docs/brain/LIVE_TODO.md`. Left alone on purpose: inline sentence links (WCAG 2.5.5 exempt), Driver.js's onboarding beacon, MapLibre's attribution link.

**Phases 7 and 8 are both closed as of 2026-09-24** — see the table above and `docs/brain/LIVE_TODO.md` for full diagnosis/fix/verification per bug, including the reverted, non-working attempted fix tried on `/dashboard` before the real one (kept in the record so it isn't retried). **What's actually still open in #186:** Phase 6 is now closed (see row above). What remains: the Quick View modal decision from Phase 9 (build a lightweight mobile equivalent, or accept full-navigation as the substitute — founder call, not guessed at); and 2 remaining not-yet-approved "new functionality" ideas (alerts match-count sparkline, status+accuracy merge) written up as detail sheets in a Claude Artifact, not yet founder-approved to build. **Calendar day-picker strip is done** — built directly (task-instructed, not via the Artifact sheet) 2026-09-25, commit `82257fc`: 7-button Mon-Sun strip reusing `getWeekRangeUTC()`, tapping a day filters the event list to that date. See `LIVE_TODO.md`, `14_CHANGELOG.md` PHASE 73/v0.96.0. **Calendar export, map recenter, and dashboard price-impact chip are also done** — built directly (task-instructed, not via the Artifact sheet) 2026-09-25, commit `a8bace3`: `/calendar` gained a one-time `.ics` export of the currently filtered view; `/map` gained a recenter control next to zoom (shown on both mobile and desktop, unlike zoom); `/dashboard` gained a 24h price-move chip per Recent Signal Stream row. Map's layer-toggle half is explicitly still not built — parked until backlog #127 (chokepoint/pipeline map overlays) ships, since there's currently only one map layer for a toggle to switch to. See `LIVE_TODO.md`, `14_CHANGELOG.md` PHASE 75/v0.98.0.

---

## NUMBERED TICKETS (#104–#128) — live queue

The MoSCoW tables below are the historical record. This section is the current punch list for the 2026-09-10/11 founder-idea batch. Closed items stay visible (struck through) so the queue is auditable; they are not open work.

### Shipped 2026-09-11

| # | Item | Effort | Why |
|---|------|--------|-----|
| ~~#106~~ | ~~5-year historical commodity charts~~ | — | **Done 2026-09-11** — on-demand Yahoo weekly `chart()`, watchlist panel. See `LIVE_TODO.md`. |
| ~~#105~~ | ~~Map click-modal UI fix~~ | — | **Done 2026-09-11** — wrapping/scrollable map dialog. See `LIVE_TODO.md`. |
| ~~#107~~ | ~~Watchlist default-populated cards + one-click add~~ | — | **Done 2026-09-11** — first-visit seed + prefs-aware persist to `user_preferences`. See `LIVE_TODO.md`. |
| ~~#108~~ | ~~Backtesting Lab auto-apply filters + loading state~~ | — | **Done 2026-09-11**. See `LIVE_TODO.md`. |
| ~~#116~~ | ~~"Authentication is temporarily unavailable"~~ | — | **Done 2026-09-11** (`a561690`) — middleware `getUser()` timeout 3s→8s. See `LIVE_TODO.md`. |
| ~~#119~~ | ~~Onboarding GIF/video step~~ | — | **Done 2026-09-11** — welcome modal before Joyride; real GIF still needs recording. See `LIVE_TODO.md`. |
| ~~#120~~ | ~~Plain-language AI-writing rewrite~~ | — | **Done 2026-09-11** — `generateAnalysis()` prompt only. See `LIVE_TODO.md`. |
| ~~#122~~ | ~~Quick-view slide-over panel~~ | — | **Done 2026-09-11**. See `LIVE_TODO.md`. |
| ~~#123~~ | ~~Event pages in a new tab~~ | — | **Done 2026-09-11** (quick-view "View full details" only) **+ remainder 2026-09-19** — every other event-detail click now also opens a new tab. See `LIVE_TODO.md`. |
| ~~#124~~ | ~~Feed filter bar + shared FilterBar~~ | — | **Done 2026-09-11** (`74b815b`). See `LIVE_TODO.md`. |
| ~~#125~~ | ~~Trader-role saved views~~ | — | **Done 2026-09-11** (`74b815b`) — Oil/Grain/Metals desk chips. See `LIVE_TODO.md`. |
| ~~#126~~ | ~~Trust/freshness signals~~ | — | **Done 2026-09-11** — `Fresh Xm` tag + live coverage line. See `LIVE_TODO.md`. |
| ~~#127~~ | ~~Economic calendar filters~~ | — | **Done 2026-09-11** (calendar half). Map chokepoint/pipeline layers still gated — see open list. |
| ~~#111~~ | ~~AI chat on event page (premium)~~ | — | **Fully done 2026-09-11 (backend `dcdc877` + frontend).** `POST/GET /v1/signals/:id/chat`, `ClaudeService.chatAboutSignal()` (same `claude-sonnet-5` model + buy/sell-refusal language as #120's `generateAnalysis()`, plus a personalized-position-advice refusal), `signal_chat_messages` table + RLS. Frontend `SignalChatPanel` on the event page, wired via same-origin `/api/signals/:id/chat` proxy routes. Playwright-verified end-to-end incl. reload-persistence. See `LIVE_TODO.md`. |
| ~~#53~~ | ~~Backfill missing `commodity_impacts` on historical signals~~ | — | **Ran 2026-09-11** — 767→1,634 filled via `classifyEvent()`; 201 left because Anthropic credit exhausted. See `LIVE_TODO.md`. |

### Shipped 2026-09-12

| # | Item | Effort | Why |
|---|------|--------|-----|
| — | Heuristic-classifier severity cap + `classification_method` flag + AI health logging + chat error handling | — | **Done 2026-09-12** (partial follow-through on #115's signal-quality audit direction) — direct production investigation found the keyword-only heuristic fallback classifier assigning severity 8/9 on bare keyword matches (real examples: an Oregon military-radar-site permitting story scored 8 on "military", a personal Navy memoir scored 9 on "war"). Severity now hard-capped at 6 on that path; new `signals.classification_method` column records `claude` vs `heuristic` going forward (historical rows best-effort backfilled); Claude/Anthropic calls now logged to `service_health_events`; signal-chat POST route now has error handling (`503 ai_temporarily_unavailable` instead of a generic 500). See `LIVE_TODO.md`, ADR 016/D20. **Follow-up backfill, #240, done 2026-09-26 (`314a501`):** the severity cap only applied to new classifications going forward — 462 pre-2026-09-12 `heuristic` rows still had `severity > 6` (400 of them also flagged `is_breaking`). Migration `20260926130000_backfill_heuristic_severity_cap.sql` set `severity = 6, is_breaking = false` on that set; verified 0 remaining via direct SQL count. |
| — | SignalChatPanel visual pass + heuristic note + 503 copy | — | **Done 2026-09-12** — contrast/type-size/composer wrapping on the existing #111 panel; `classification_method = heuristic` note; specific `ai_temporarily_unavailable` message. Same component and backend contract. See `LIVE_TODO.md`. |
| — | #111 AI usage governance + cited chat | — | **Done 2026-09-12** — dual daily Anthropic budgets, `CHAT_ALLOWED_EMAILS` fail-closed gate, fail-closed 30/day + 5/5min burst, Haiku relevance pre-check, cited sources. See `LIVE_TODO.md`. |
| — | #111 chat quality fixes (#134 follow-up): mid-sentence cutoff + no markdown rendering | — | **Done 2026-09-12** — `max_tokens` stays 600; a `stop_reason === "max_tokens"` safety net trims the reply to its last complete sentence instead of showing a dangling half-sentence. System prompt gains a ~180-word length instruction and a markdown-formatting instruction; the sources-section instruction is strengthened to fire reliably whenever the answer draws on the signal's stored data (not just "if convenient"). `SignalChatPanel`'s assistant-reply render is now `react-markdown` restricted to paragraphs/bold/italic/lists (`a`/`img` excluded — the real `<a>` Sources list stays the only clickable-link surface). #134's budget breakers/allowlist/relevance check/burst limiter/`sanitizeCitedChatReply` untouched. See `LIVE_TODO.md`. |
| ~~#133~~ | ~~Mobile dashboard shell (390px crush)~~ | — | **Done 2026-09-12** — off-canvas sidebar below `md`, hamburger in TopBar, content no longer has a hardcoded 256px left margin on phones. Desktop/tablet unchanged. See `LIVE_TODO.md`. |
| ~~#112~~ | ~~Push-notification connect UX~~ | — | **Done 2026-09-12** — Telegram-only. Header `forum` icon + contextual prompt after 3 signal views; dismissed state is `profiles.notification_prompt_dismissed_at` (server-side). Settings `<TelegramConnect />` stays the manage/disconnect home. See `LIVE_TODO.md`. |
| — | Discord alert channel (webhook-URL-paste) | — | **Done 2026-09-12** — `user_channels.discord_*` columns, dispatcher `discord` branch, Settings `<DiscordConnect />` + `/api/discord/test`, alert-rule Telegram/Discord/Slack checkboxes. No bot/OAuth. See `LIVE_TODO.md`. |
| ~~#137~~ | ~~Event-page trust/UX copy (four live-test bugs)~~ | — | **Done 2026-09-13** — typed chat history errors; flat price subtext + severity-gated alert CTA; ANALYSIS Verification box removed; briefing empty-state is severity-gated (not an outage). `apps/web` only. See `LIVE_TODO.md`. |
| ~~#138~~ | ~~Site-wide copy & error-state integrity pass~~ | — | **Fully done 2026-09-13** — Phase 2 candidates + remainder (voice guide D24/ADR 020, `apiErrorLogged`, settings/auth/feed leaks). See `LIVE_TODO.md`. |
| ~~#140~~ | ~~Hide raw classifier confidence on CommodityChip~~ | — | **Done 2026-09-13** — chip shows ticker + direction arrow only; `confidence` stays on the API/prop and in an unambiguous aria-label. `apps/web` only. See `LIVE_TODO.md`. |
| ~~#141~~ | ~~Materiality gate — acts on #139's audit findings~~ | — | **Done 2026-09-13** — the pipeline's first real "does this mean anything?" reject step. 8 new `signals` columns (`relevance`/`novelty`/`event_category`/`market_mechanism`/`is_preview`/`source_confirmation`/`materiality_pass`/`materiality_reasoning`); `classifyEvent()` + heuristic fallback both apply BBR's reasonable-investor-inspired materiality principle; enforced at all 5 live classify-then-insert call sites, logged to `service_health_events` on reject. Verified live against production with 3 real Claude-classified test stories. `apps/backend` + migration only. See `LIVE_TODO.md`, `14_CHANGELOG.md` v0.61.0/PHASE 28. |
| ~~#142~~ | ~~Live watchlist database table~~ | — | **Done 2026-09-13** — `media_impact_watchlist` (public-read / service-role write) replaces #141's hardcoded array; `signals.media_impact_entity` + `[Media-Impact]` tag on card/detail. Saylor/Wood not added. **Data update 2026-09-19** — 8 sourced rows (Musk evidence = 2018 funding-secured/SEC record, `markets=[]` because TSLA/BTC are not tracked; new AP-hack compromised-account row). See `LIVE_TODO.md`, `14_CHANGELOG.md` v0.62.0/PHASE 29 + v0.68.0/PHASE 35. |
| ~~#143~~ | ~~Frontend consumption of materiality-gate fields~~ | — | **Done 2026-09-13** — PROJECTED IMPACT → MARKET IMPACT ASSESSMENT on event detail + SignalQuickView. Named parts from `market_mechanism` / impacts / direction / `event_category` / reused Media-Impact tag; Caldara & Iacoviello fallback when there is no direct match; `is_preview` calendar note. No raw confidence percent in the box. See `LIVE_TODO.md`, `14_CHANGELOG.md` v0.63.0/PHASE 30. |
| ~~#144~~ | ~~1h/4h/24h/48h outcome checkpoints~~ | — | **Done 2026-09-13** (`9be929a`) — `outcome-tracker.ts` writes all four horizons; `GET /v1/accuracy` still aggregates 48h only. Unique key widened to `(signal_id, asset, checkpoint_hours)`. No `/accuracy` time-horizon UI. See `LIVE_TODO.md`, `14_CHANGELOG.md` v0.64.0/PHASE 31. |
| — | Sidebar logo → `/dashboard` + landing hero subtext | — | **Done 2026-09-18** — brand span in `Sidebar.tsx` is a Next.js `<Link href="/dashboard">`. Landing hero `<p>` was a short brand line later replaced by #174; h1 and meta descriptions unchanged. See `LIVE_TODO.md`, `14_CHANGELOG.md` v0.65.0/PHASE 32. |
| ~~#145~~ | ~~Watchlist empty-state defaults + single range chart~~ | — | **Done 2026-09-19** — `/watchlist` first-paints `COMMODITIES` cards + category chips; `/watchlist/[symbol]` one chart with 1M/6M/1Y/3Y/5Y. See `LIVE_TODO.md`, `14_CHANGELOG.md` v0.66.0/PHASE 33. |
| ~~#146~~ | ~~10 prospect/demo accounts that never count toward usage numbers~~ | — | **Done 2026-09-19** — `profiles.is_test_account`; Admin `email_confirm: true` for 10 accounts only (Confirm Email stays ON). Metrics + digest exclude the flag. See `LIVE_TODO.md`, `14_CHANGELOG.md` v0.69.0/PHASE 36. |
| — | Driver.js feature hints (watchlist / dashboard filters / RECORD) | — | **Done 2026-09-19** — Feature Hints mode, one beacon each, localStorage `bbr_hint_seen_<id>`. RECORD tooltip matches `handleRecord()` (browser localStorage only). See `LIVE_TODO.md`, `14_CHANGELOG.md` v0.70.0/PHASE 37. |
| — | Cmd+K search assist RAG fallback | — | **Done 2026-09-19** — existing palette search kept; Suggested group + `POST /v1/search/assist` when that search returns <2 hits. `search_content_embeddings` + pgvector; Haiku on the chat daily budget. FAQ indexed as of #155. See `LIVE_TODO.md`, `14_CHANGELOG.md` v0.71.0/PHASE 38. |
| — | Fastify `/docs` no longer public | — | **Done 2026-09-19** — production Swagger UI was unauthenticated; now `development`/`test` only. See `LIVE_TODO.md`, `14_CHANGELOG.md` v0.72.0/PHASE 39. |
| ~~#155~~ | ~~Minimal FAQ~~ | — | **Done 2026-09-19** — `/help` FAQ (10 live-behavior answers) + `feedback_submissions` form (table, not Resend; no live chat). Sidebar/Settings/TopBar/Cmd+K. `SEARCH_FAQ_ENTRIES` filled. See `LIVE_TODO.md`, `14_CHANGELOG.md` v0.73.0/PHASE 40. |
| — | Homepage copy integrity (fabricated claims + sci-fi register) | — | **Done 2026-09-20** — removed 42ms / 100% Verified / 40yr archive / Encrypted Support / sub-second synthesis; retone; live `signals` count; `/accuracy` link with no homepage hit-rate %. Prices unchanged. See `LIVE_TODO.md`, `14_CHANGELOG.md` v0.75.0/PHASE 42. |
| ~~#174~~ | ~~Homepage subtext~~ | — | **Done 2026-09-20** — landing hero `<p>` is "Blue Beacon Research — Geopolitical Intelligence for Commodity Traders". Headline unchanged. See `LIVE_TODO.md`, `14_CHANGELOG.md` v0.76.0/PHASE 43. |
| — | Search-quality fix: Cmd+K fuzzy match + relevance sort | — | **Done 2026-09-20** — command palette Pages/Watchlist/Alert-Rules now Fuse.js fuzzy+keyword (was exact substring); missing Economic Calendar entry added. New `sort=relevance` on both signals routes (BFF + Fastify), used by command palette's Signals search only. Corrected a stale doc claim that the BFF route proxies to Fastify. See `LIVE_TODO.md`, `14_CHANGELOG.md` v0.77.0/PHASE 44. |
| — | Docs onboarding catch-up | — | **Done 2026-09-20** — `21_PROJECT_BRIEFING` + `00_CURRENT_BBR_CONTEXT` + architecture/roadmap/historical-file banners. No application code. See `LIVE_TODO.md`, `14_CHANGELOG.md` v0.78.0/PHASE 45. |
| — | Header search = Cmd+K + last-resort fallback | — | **Done 2026-09-20** — TopBar search opens the existing command palette; in-page `searchQuery`/`searchSubmitted` path removed. Last-resort **"Not sure? Try"** → Intelligence Feed. Keywords expanded; backend catalog kept in sync. See `LIVE_TODO.md`, `14_CHANGELOG.md` v0.79.0/PHASE 46. |
| — | Homepage "N signals tracked" count via response body | — | **Done 2026-09-21** — `getHomepageStats()` dropped `head: true` so the exact count is in the body; failures log the full Postgrest error. See `LIVE_TODO.md`, `14_CHANGELOG.md` v0.80.0/PHASE 47. |
| ~~#175~~ | ~~Tension Index tooltip click-outside~~ | — | **Done 2026-09-20** — map `tensionInfoOpen` closes on outside mousedown; hover preview + methodology sentence unchanged. See `LIVE_TODO.md`, `14_CHANGELOG.md` v0.76.0/PHASE 43. |
| ~~#207~~ / ~~#228~~ | ~~Chart attribution — "why did this happen"~~ | — | **Phase 1 done 2026-09-26 (DB-only), revised 2026-09-27.** **Phase 2 (GDELT external-news fallback + classifier) code shipped 2026-09-28, migration blocked** — `GET /api/signals/attribution` now falls back to a new Fastify `GET /v1/signals/attribution-backfill` only on a zero-result DB-first miss: searches GDELT's historical archive for the asset/window, classifies top candidates, writes anything relevant through the normal ingestion path (`is_backfilled` tag, excluded from new-signal alerts only — ADR 030/D34). Not yet live — depends on a migration Claude Code's production-deploy gate denied this session; founder action needed. See `LIVE_TODO.md`, `14_CHANGELOG.md` v0.109.0/PHASE 86 (Phase 1), v0.115.0/PHASE 92 (Phase 2). |
| ~~#227~~ | ~~Market Impact Assessment — historical-pattern chart (Phase 2)~~ | — | **Done 2026-09-27** — small collapsed-by-default `recharts` bar chart (median % move at 1h/4h/24h/48h, only checkpoints clearing `MIN_SAMPLE_SIZE = 20`) added next to Phase 1's magnitude sentence on event detail's Affected-market chips; reuses the exact `signal_outcomes` rows Phase 1 already fetches, no new query. See `LIVE_TODO.md`, `14_CHANGELOG.md` v0.111.0/PHASE 88. |
| ~~#227~~ | ~~Economic Calendar integration — EIA/USDA entries + magnitude line + options-IV note~~ | — | **Done 2026-09-27** — 8 real EIA/USDA entries added to `data/economic-calendar.json`; qualifying events show a per-asset magnitude sentence via new asset-level `GET /api/market-impact` (reuses #227's exact functions/query, no duplication); one-time sourced options-IV educational note added. See `LIVE_TODO.md`, `14_CHANGELOG.md` v0.113.0/PHASE 90. |
| — | Signal archive/search page (`/archive`) | — | **Done 2026-09-29** — lookup of the live `signals` table by date/desk/region/keyword; no severity floor, no recency cutoff; keyset pagination. **Not C17.** See `LIVE_TODO.md`, `14_CHANGELOG.md` v0.126.0/PHASE 103. |

### Still open

| # | Item | Notes |
|---|------|-------|
| #104 | Vercel Hobby→Pro upgrade | Ready now, $20/mo, no gate. [founder-led] |
| #109 | Printable architecture/flowchart doc | Scoped, own session. |
| #110 | Named-analyst content section | Parked, gated on real evidence of demand. |
| #113 | www/apex domain redirect | Ready now, free, Vercel dashboard only. [founder-led] |
| #114 | Business continuity + legal registration | Checklist ready; founder picks jurisdiction. [founder-led] |
| #115 | Signal-quality live-data audit | Ready-to-run, read-only verification prompt exists. Partial follow-through 2026-09-12 — see "Shipped 2026-09-12" above (heuristic severity cap + `classification_method`); broader audit itself not re-run. |
| #117 | Global marketing/ads compliance | Researched, no blocker; action folded into #102. |
| #118 | Premium news/AI tier | Step 1 (GNews Essential) no gate; steps 2–3 gated on real revenue. |
| #121 | Real /accuracy page + outcome-tracker worker | ~~**Fully shipped 2026-09-11**~~ — `signal_outcomes` table + daily `outcome-tracker.ts` worker (backfilled to 2,965 rows) + public `GET /v1/accuracy` aggregation endpoint + public `/accuracy` page (per-asset breakdown, permanent disclaimer, no "top signals" list). #53 backfill completed 2026-09-12 (1,678 filled / 1,213 Haiku-classified empty of 2,891). **#144 (2026-09-13):** worker also writes 1h/4h/24h rows; `GET /v1/accuracy` still 48h-only. |
| #127 leftover | Map chokepoint/pipeline layers | **Chokepoint half done 2026-09-30, sourcing cleanup + grouped list panel done 2026-10-01 (doc claude/278 item 4.6)** — static, hand-sourced `CHOKEPOINTS` reference layer (`packages/shared`), no data vendor needed; re-verified sourcing removed 2 more chokepoints' commodity links (Panama Canal, Turkish Straits — `eia.gov`/`usda.gov` still unreachable this session, no guessing per task instruction), and the map gained a grouped "Chokepoints" list panel (count + direction split per chokepoint, click-to-fly). See `LIVE_TODO.md`. Pipeline layers still not started, still gated on a real data-vendor cost check. |
| #128 | Human-review trust layer | Stage 1 is a founder action; do not claim "human-reviewed" before Stage 1 is real. |
| #139 | Ingestion / filter / severity / confidence audit | Research written 2026-09-13 (`fba11ac`) — `claude/85_SIGNAL_INGESTION_FILTER_SEVERITY_AUDIT.md`. Acted on 2026-09-13 via #141 (materiality gate) — see Shipped above. |
| #143 leftover | Remaining materiality-gate fields still unread in the UI | `novelty` / `source_confirmation` / `materiality_reasoning` on event detail (2026-09-20) and now also on list `GET /api/signals` + map popup (#178/#179, 2026-09-21). Still unread: `relevance` / `materiality_pass` (`materiality_pass` is a write-time insert gate). |
| #142 leftover | Trump-named `individual_social_media` watchlist row | Peer-reviewed tweet-reaction papers exist; inclusion is a positioning decision, not just evidence. Office-level `US President` row already ships. Awaiting founder sign-off; do not add from a coding session. |

---

## MUST HAVE — Ship before any public launch

| # | Item | Effort | Why |
|---|------|--------|-----|
| M1 | Fix Railway: set Root Directory + start command, add billing | 1 hr | Backend offline — nothing works |
| M2 | Create Railway workers service (separate service, start:workers) | 30 min | No signals collected without this |
| M3 | Fix signal quality pre-filter (block FIFA/sports/celebrity) | 2 hr | Top signal is FIFA — product unusable |
| M4 | Fix country extraction from GDELT (UNKNOWN on all signals) | 2 hr | Every signal shows UNKNOWN |
| M5 | Fix duplicate signal detection | 1 hr | Same story appears 3x in feed |
> ⚠️ UPDATED 2026-08-19 — Done, and turned out to need more than 1 hour of design: a cross-source signal merge step now runs after classification in all 3 live collectors, matching on region + AI-classified summary similarity (not raw title text) within an 8h window. Classification is never skipped (an earlier design that pre-filtered before classifying was explicitly rejected as too risky — see `docs/brain/10_DECISIONS.md` ADR 010). A genuine duplicate merges and skips the Sonnet briefing call; a same-story escalation (severity rises) updates the existing signal instead of creating a new one. Full detail: `docs/brain/14_CHANGELOG.md` v0.27.0.
| M6 | Fix confidence calibration (all signals 40%) | 2 hr | Makes all signals look identical |
| M7 | Replace Alpha Vantage with Yahoo Finance (watchlist broken) | 2 hr | Watchlist shows skeleton forever |
| M8 | Fix Google OAuth (/auth/callback route + Google Cloud setup) | 2 hr | Most users want Google login |
| M9 | Set Telegram webhook after Railway deployment | 30 min | All Telegram alerts fail without this |
| M10 | Add error boundaries (ErrorBoundary.tsx) | 2 hr | Any crash = white screen |
| M11 | Add empty states to all pages | 2 hr | Blank pages look broken |
| M12 | Rename "DEPLOY COUNTERMEASURES" to "Set Alert for This Signal" | 30 min | Confusing, unprofessional |
| M13 | Wire search bar to filter signal feed | 2 hr | Renders but does nothing |
| M14 | Wire notification bell to open panel | 2 hr | Renders but does nothing |
| M15 | Wire ? icon to open help modal | 1 hr | Renders but does nothing |
| M16 | Wire user avatar to dropdown (Settings, Sign Out) | 1 hr | Click does nothing |
| M17 | Fix footer links on landing page (all 404) | 1 hr | Broken links on public page |
| M18 | Add Demo Mode banner to backtesting results | 30 min | Users may trust fake data |
| M19 | Add rate limiting verification to Fastify API | 1 hr | Security hole if backend goes live |
| M20 | Fix Telegram onboarding field (numeric ID, not username) | 1 hr | Confuses every user |
| M21 | Add loading.tsx for dashboard routes | 1 hr | Flash of empty content |
| M22 | Set NEXT_PUBLIC_PROJECT_READY env var from Vercel | 15 min | Controls waitlist gate |
| M23 | Add PORT=8888 env var to Railway (match domain config) | 15 min | Fastify can't start on wrong port |
| M24 | Verify Supabase new_user trigger works for OAuth users | 1 hr | OAuth users may not get profiles row |

---

## SHOULD HAVE — Ship within first 2 weeks

| # | Item | Effort | Why |
|---|------|--------|-----|
| ~~S1~~ | ~~Economic Calendar page (/calendar)~~ | — | **Done 2026-09-07 (#86)** — This Week/Upcoming tables, live countdown, 🔴/🟡/🟢 impact indicators, backed by a static manually-curated JSON (deliberate v1, not a live paid API). See `14_CHANGELOG.md`. |
| S2 | Price-at-signal display on signal cards | 1 day | Stocknews.ai killer feature, proves value |
| S3 | Central bank rates widget on /watchlist | 2 hr | InvestingLive feature traders love |
| S4 | Morning brief worker (07:45 UTC weekdays) | 1 day | Retention driver, daily habit |
| S5 | Public Telegram channel (@BlueBeaconResearch) | 2 hr | Free signal channel for lead gen |
| S6 | Add outcome-tracker worker (fill outcome_direction) | 1 day | Needed for accuracy tracking |
| S7 | Build /accuracy public page | 1 day | Most powerful marketing asset |
| S8 | Populate settings Notifications tab | 1 day | Tab is empty, users expect it |
| S9 | Populate settings Security tab (change password, sessions) | 1 day | Security feature expected |
| S10 | sitemap.xml and robots.txt | 1 hr | SEO basic requirement. **2026-10-09:** `/accuracy` and `/status` added (monthly, priority 0.5). `robots.ts` unchanged. |
| S11 | Guardian API as second news source | 1 day | Better policy/economics coverage |
| S12 | Pipeline health endpoint (/v1/health/pipeline) | 2 hr | Visibility into worker status |
| S13 | Severity 9+ audio alert (Web Audio API) | 2 hr | FinancialJuice-inspired, high impact |
| S14 | Map conflict pins from signal lat/lng | 1 day | Map is blank without this |
| S15 | All signal stream rows clickable → /events/[id] | 2 hr | Many rows may not navigate correctly |
| S16 | /status page (system status) | 2 hr | Trust signal for new users |

---

## COULD HAVE — Month 2-3

| # | Item | Effort | Why |
|---|------|--------|-----|
| C1 | Real backtesting with GDELT historical + Alpha Vantage paid | 2 weeks | Current mock data is misleading |
| C2 | Stripe billing integration (full, not stubbed) | 3 days | Revenue enabler |
| ~~C3~~ | ~~Email alerts via Resend~~ | — | **Done 2026-09-07 (#83)** — personalized daily digest worker (`digest-sender.ts`) via the existing Resend account, four-section framing, Settings opt-out toggle. One prod step left: set `RESEND_API_KEY` on the Railway `workers` service. See `14_CHANGELOG.md` PHASE 8. |
| ~~C4~~ | ~~Populate settings Appearance tab (theme toggle)~~ | — | **Rejected 2026-09-24 (ADR 027 / D31)** — the "Day Mode" control was dead (no `ThemeProvider` mounted) and real light mode would require re-pointing Tailwind color classes across ~50 files; founder chose to remove the dead control instead of building light mode. See `10_DECISIONS.md`. |
| C5 | Populate settings Data tab (export, delete account) | 2 days | GDPR compliance, user trust |
| C6 | Saved signals feature (bookmark icon) | 1 day | User engagement |
| C7 | Referral program ("1 month free per invite") | 2 days | Viral growth mechanism |
| C8 | Mobile app App Store submission (iOS) | 3 days | Mobile users |
| C9 | Mobile app Play Store submission (Android) | 2 days | Mobile users |
| C10 | Watchlist alert toggle → auto-creates alert rule | 1 day | Power user feature |
| C11 | Claude token usage logging to Supabase | 1 day | Cost monitoring |
| C12 | Daily spend cap enforcement for Claude | 1 day | Cost protection |
| C13 | PostGIS enable + shipping proximity calculation | 1 day | Map pins near chokepoints |
| C14 | Economic calendar → auto-generate signal when actual ≠ forecast | 2 days | Calendar intelligence integration |
| C15 | Sentry error monitoring | 2 hr | Catch production crashes |
| C16 | PostHog analytics | 2 hr | User behavior tracking |
| C17 | 40-year intel archive (historical signal search) | 2 weeks | Pro tier feature. **Still open** — 2026-09-29 shipped a current-table `/archive` lookup (v0.126.0), not this 40-year GDELT product. |
| C18 | Webhook test delivery button | 1 day | Developer UX |
| C19 | Multi-seat team feature (Pro tier, 3 seats) | 3 days | Pro tier requirement |

---

## WON'T HAVE (This Version) — Explicitly rejected

| Item | Reason for rejection |
|------|---------------------|
| Individual stock signals | Different customer (equity traders), out of scope |
| Technical analysis (RSI, MACD) | Not a TA platform, different product |
| Crypto tracking | Crowded market, different audience |
| Portfolio management / P&L tracking | Requires broker integration, securities licensing risk |
| WhatsApp alerts (#85) | **KILLED 2026-09-07, not paused.** Required Meta Business Verification — the "difficult third-party approval" category BBR now avoids by standing policy (D18 / ADR 014). Independently, it was the weakest-evidenced of BBR's three notification channels for its Western-trader-weighted audience (Telegram/Discord dominate; WhatsApp's edge was India-specific, and BBR isn't pursuing India as a distinct GTM). Full planning/cost/risk context preserved in `docs/brain/LIVE_TODO.md` (§ "Killed 2026-09-07") for a later resume. |
| Buy/sell recommendations | Legal liability, breaks positioning as intelligence platform |
| Social/community features | Out of scope for V1 |
| Public market data resale | Licensing complexity |
| India-only positioning | Rejected early — global product |

---

## IMMEDIATE PRIORITY (DO IN THIS ORDER — next 5 days)

```
DAY 1:
  - M1: Add Railway billing credit card
  - M1: Set Root Directory = apps/backend in Railway Settings
  - M1: Set Build = pnpm install && pnpm run build
  - M1: Set Start = pnpm run start:server
  - M23: Set PORT=8888 env var
  - M24: Verify SUPABASE_URL is set (not NEXT_PUBLIC_SUPABASE_URL)
  - M22: Set NEXT_PUBLIC_PROJECT_READY in Vercel

DAY 2:
  - M9: Create Railway workers service
  - M9: Set Telegram webhook (one curl command)
  - Verify: SELECT COUNT(*) FROM signals WHERE created_at > NOW()-INTERVAL '1 hour' > 0

DAY 3 (Cursor Prompt — Signal Quality):
  - M3: Add pre-filter (HIGH_RELEVANCE_KEYWORDS + EXCLUDE_KEYWORDS)
  - M4: Fix country extraction from GDELT ActionGeo_CountryCode
  - M5: Fix duplicate signal detection
  - M6: Fix confidence calibration in Claude prompt

DAY 4 (Cursor Prompt — UI Fixes):
  - M7: Replace Alpha Vantage with yahoo-finance2
  - M8: Google OAuth (+ Google Cloud manual setup steps)
  - M10: ErrorBoundary.tsx
  - M11: EmptyState.tsx on all pages
  - M12: Rename DEPLOY COUNTERMEASURES
  - M13-M16: Wire search/bell/?/avatar

DAY 5 (Cursor Prompt — Polish):
  - M17: Fix footer links
  - M18: Add Demo Mode banner to backtesting
  - M20: Fix Telegram onboarding field
  - M21: Add loading.tsx
  - S10: sitemap.xml + robots.txt
```
