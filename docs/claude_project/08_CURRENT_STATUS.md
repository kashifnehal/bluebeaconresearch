# 08_CURRENT_STATUS.md — Repository Status & System Audit Matrix

> **📍 Doc status — live status banners as of 2026-09-26 (ingestion pipeline cleanup, closed — see the banner immediately below).** Full technical matrix: `docs/brain/08_CURRENT_STATUS.md`. `claude/23_TODO.md` / `22_SESSION_HANDOFF.md` are not in this repo. **Open items left in #186: the Quick View modal design decision; 5 remaining not-yet-approved "new functionality" ideas written up as a Claude Artifact detail sheet, not a repo doc (calendar day-picker strip is now shipped, see below); and #206's uptime-sparkline half (row-crowding half closed 2026-09-25).**

> ⚠️ UPDATED 2026-09-26 (ingestion pipeline cleanup, closed, claude/237) — `apps/backend` only, commit `3d5e244`. Heuristic-fallback classifier no longer flags bare "gold"/"corn" as commodity signals without market context; `reconciliation.ts` no longer re-asks Claude about an already-rejected row forever (new `materiality_checked_at` column, was every 30min for 12h); RSS collector fixed to stop mislabeling its own rows with GNews's `source` value; GDELT request size raised to its documented max. Also confirmed live: the Anthropic account is currently hitting its own usage limit (regains access 2026-10-01) — heuristic fallback is the only classifier running right now, making fix (1) immediately load-bearing. Verified against production DB + Railway logs post-deploy. Full detail: `docs/brain/08_CURRENT_STATUS.md`, `docs/brain/14_CHANGELOG.md` v0.100.0.

> ⚠️ UPDATED 2026-09-25 (event-detail Timeline + Related Events, tightened signal merge, closed) — `apps/backend` + `apps/web`, commit `d67ae2b`. Closes the "Spec items 12/14 not built" gap left open by the 2026-09-20 #143-leftover entry. `signal-merge.ts`'s cross-source Jaccard threshold lowered 0.55 → 0.33 after a real missed merge (two same-event "US strikes Iranian oil tankers" signals scored 0.333); a live 4,343-pair backtest against `evavcgfmemwryggdkjmx` showed a naive drop to 0.33 would also merge unrelated low-materiality signals sharing only boilerplate disclaimer text ("no geopolitical or financial market implications"), fixed by stopwording that boilerplate instead of raising the threshold — no Anthropic API call added to the matching path. `/api/signals/:id` now returns sources ordered oldest-first with `domain` (powers a renamed "timeline" tab) and a new `relatedEvents[]` (same country + overlapping commodity, 7-day placeholder window anchored to the event's own date, reinforcing/conflicting/mixed label — powers a new "related events" tab). Both the 0.33 threshold and the 7-day window are explicit placeholders, not tuned constants. Full detail: `docs/brain/14_CHANGELOG.md`, `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-09-25 (calendar export / map recenter / dashboard price chips, closed) — `apps/web` only, commit `a8bace3`. Three independent new features, not parity fixes: an "Export to Calendar" `.ics` download on `/calendar` (respects the day strip + all existing filters, one-time download not a sync, client-side only); a recenter control next to `/map`'s zoom buttons (same `map.easeTo()` method already used elsewhere on the page, shown on both mobile and desktop unlike the mobile-only zoom buttons); and a 24h price-move chip on every `/dashboard` Recent Signal Stream row (reuses the existing `/api/prices` lookup, no new price logic or endpoint). `tsc --noEmit` clean; full test suite passes; Playwright-verified at 375px and desktop on the standing test account. Full detail: `docs/brain/14_CHANGELOG.md` v0.98.0/PHASE 75, `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-09-25 (alerts per-rule match-trend chart, closed) — `apps/web` only, commit `f019cb9`. `/alerts` gained a small chart under each rule's name showing real matched-signal counts per day over a fixed 14-day window plus a "N matches this week" summary. New `GET /api/alerts/rule-stats` (RLS-scoped, same pattern as the existing alert-rules routes) runs two column-only `alerts_sent` aggregation queries instead of pulling full match records, deduped by `signal_id` per rule/day. Confirmed first that the Fastify `/v1/alerts/*` routes aren't used by the frontend at all, so this follows the existing Next.js/RLS pattern rather than extending Fastify. Rules with fewer than 3 all-time matches or under 7 days old show "Not enough history yet" instead of a near-empty chart. `tsc --noEmit` clean; aggregation logic hand-verified against direct SQL on the live standing test account (27-match and 4-match rules both reproduced exactly). No live rule currently qualifies for the empty state, so that path was verified by code inspection only — an honest gap, not glossed over. Full detail: `docs/brain/14_CHANGELOG.md` v0.97.0/PHASE 74, `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-09-25 (calendar day-strip filter, closed) — `apps/web` only, `calendar/page.tsx`, commit `82257fc`. `/calendar`'s "This Week" section could show "No events in this range" while real events sat in "Upcoming" just past the Mon-Sun window boundary. Added a 7-button day strip above the event list, built from the same `getWeekRangeUTC()` boundary "This Week" already uses — no second week-boundary definition. Tapping a day filters the already-loaded event list to that date (This Week/Upcoming replaced by a single "Events on <date>" section); tapping the active day again, or "Show all", restores the normal split. No new backend query. This closes the "calendar day-picker strip" item from the 2026-09-24 Stitch-inspired-builds list (`09_BACKLOG.md`) — built directly on task instruction, not via the pending Artifact sheet. `tsc --noEmit` clean; Playwright-verified at 375px (day swap, count badges, both ways back to the full list); seeded data has zero events in the current week, so the filtered-with-results row rendering wasn't visually observed, only the empty-day and toggle paths. Full detail: `docs/brain/14_CHANGELOG.md` v0.96.0/PHASE 73, `docs/brain/LIVE_TODO.md`.

> ⚠️ UPDATED 2026-09-25 (homepage headline replaced, closed) — `apps/web` only, copy-only. Hero headline "High-fidelity geopolitical intelligence → actionable trading signals." replaced with "Geopolitical intelligence for markets that matter." — flagged live/unfixed by the 2026-09-24 mobile audit despite standing docs claiming it was already rejected. Root-layout SEO meta description updated to match; homepage's own separate page-level meta description was already different, untouched. Subtext line unchanged. Full detail: `docs/brain/14_CHANGELOG.md` v0.95.0, PHASE 72.

> ⚠️ UPDATED 2026-09-25 (#202/#203/#204/#205/#206/#199, six independent mobile-polish fixes, closed) — `apps/web` only, commit `0701bf8`. Labeled the event-detail predicted-direction chip vs. the live price-move sentence beside it (#202, no value changed); restyled `/alerts`' Feed/Watchlist/Lab row from misleading pill/tab styling to plain breadcrumb nav links, since it navigates rather than filters (#203); added a mobile "Swipe →" hint to `/backtesting`'s Popular Simulations row (#204); labeled signup's password-strength bar with its existing computed score (#205); fixed `/status` subsystem rows crowding their badge against 2-line-wrapped text at 375px, row-crowding half only — the uptime-sparkline idea stays open (#206); removed a dead demo-GIF reference that fired a console 404 on every Replay Tour open, in favor of the fallback text path that was already there (#199). `tsc --noEmit` clean; unit tests pass. Full detail: `docs/brain/LIVE_TODO.md`, PHASE 71.

> ⚠️ UPDATED 2026-09-25 (#186 `/watchlist` mobile FAB-overlap fix, closed) — the `claude/MOBILE_AUDIT_FULL_2026-09-24.md` re-verification pass's real finding (floating "+" `position:fixed` overlapping scrolling card content) is fixed: mobile FAB removed outright, replaced by a header "+ Add Asset" button (both breakpoints, 44px target) matching `docs/stitch_mobile/mobile_commodity_watchlist` placement; desktop FAB kept. Also collapsed the page's 3 overlapping add-commodity mechanisms (My Commodities/Show All toggle, ADD COMMODITY dropdown, per-category chip rows) down to the single dropdown, which already covered commodities and forex. Playwright-verified at 375/1440px: header button visible without scroll, no fixed overlap while scrolling, full add/remove round trip, 44px measured. `tsc --noEmit` clean.

> ⚠️ UPDATED 2026-09-24 (#186 Phase 6, 768px tablet pass closed) — Swept 22 of 23 verifiable routes at 768px (onboarding excluded per standing policy). Found one shared bug on 6 pages (`backtesting`/`settings`/`watchlist`/`watchlist/[symbol]`/`alerts`/`calendar`): each built a redundant wrapper reserving an unjustified `right-[260px]` gap with no matching content — invisible at 1440px, but left as little as ~190px real width at 768px. `alerts` additionally doubled its left margin on top of the shared layout's own. Also explains `calendar`'s previously-assumed-normal 777px table scroll (container was pathological, not the table). Fixed all 6; also repositioned `watchlist`'s stranded floating "+" button and widened `alerts`' source-citation link's tablet max-width. One near-miss caught pre-ship: a copy-pasted class would have broken `alerts`' desktop TopBar clearance (it stays normal-flow, unlike the other 4 pages which switch to fixed positioning) — caught by checking `TopBar.tsx`'s actual positioning before trusting the pattern. `tsc --noEmit` clean; all 6 re-verified at 375/768/1440px, no desktop regression. This tree: PHASE 69 (brain changelog v0.91.0).

> ⚠️ UPDATED 2026-09-24 (#186 button/link parity audit, 3/4 gaps fixed) — Founder pivot away from Stitch-mock comparison: verify every control on desktop also exists and works on mobile, no new functionality. Grepped every `hidden md:/lg:/sm:` instance app-wide (16 total, all traced to source). Fixed: Replay Tour had no mobile trigger (added to `Sidebar.tsx`'s mobile drawer), map's tension-index explainer tooltip was desktop-only (added to `MobileTensionSheet.tsx`), `MediaImpactTag`+source-confirmation badge hidden on mobile dashboard stream rows despite being on desktop (un-hid both, `flex-wrap` added so the badge drops to its own line instead of overflowing). Quick View modal (desktop-only, mobile substitutes full navigation) flagged as a design call, not auto-fixed. Also corrected a prior-session mistake: the map's Kinetic/Cyber/Diplomatic tension breakdown was reported "needs building" when it was already shipped, just behind a tap-to-expand sheet that pass hadn't opened. `tsc --noEmit` clean; all 3 fixes verified by live interaction (not DOM presence) and desktop equivalence confirmed by computed style at 1440px. This tree: PHASE 68 (brain changelog v0.90.0).

> ⚠️ UPDATED 2026-09-24 (#186 Phase 7 + Phase 8, all closed; plus 4 unrelated bugs found while testing) — Phase 7's 3 readability regressions (dashboard stream-row truncation, alerts rule-name truncation, calendar event-name-off-screen) are fixed and verified — see `docs/brain/LIVE_TODO.md` for full diagnosis/fix/verification per bug. A second, more rigorous review pass (full scroll-through + named component-vs-mock measurements, not screenshot spot-checks — new standing rule, see `feedback_mobile_verification_rigor` memory) then found the identical "technically fine, not actually good" pattern on 3 more pages, all now also fixed: the homepage (hero/cards/pricing/footer density, plus a real CTA-overlap regression caught mid-fix and corrected in the same commit), `/backtesting` (6 stacked cards → horizontal swipe row), and `/accuracy` (its "By asset" table had the exact same off-screen-column bug as the old calendar table — found fresh this pass, not previously known). Also fixed: `/events/[id]`'s oversized mobile headline and an `/admin/metrics` copy typo. **Unrelated bugs found while testing, fixed separately (not #186 scope):** alerts "[object Object]" source-citation bug, 4 remaining "Sentinel"/AI-branding instances (dashboard sidebar widget, 2 duplicate alert-modal titles, TopBar fallback — two independent sessions partially duplicated this work, reconciled, see `docs/brain/LIVE_TODO.md`), MapLibre's hardcoded-white zoom control, and a completely dead "Day Mode" settings toggle (removed rather than built out for real — ADR 027/D31). All commits on `main`, pushed. `tsc --noEmit` clean throughout. This tree: PHASE 65-69 (brain changelog v0.87.0-v0.89.0 plus the 8 untagged #186 Phase 7/8 commits).

> ⚠️ UPDATED 2026-09-24 (#188, classifier-extraction country fix) — `apps/backend` only. GDELT-sourced signals were showing the publishing outlet's country (GDELT's `sourcecountry` field) as if it were the event's location — a US outlet covering a Middle East story showed "United States" on the signal card/map pin. `classifyEvent()` now also returns a classifier-derived `country` (Claude's own read of the article), which `geo-resolver.ts` and the collectors prefer over the raw source-country value for both the displayed country and the map pin. `acled-collector.ts` deliberately left unchanged — its own country/lat/lng are real per-incident ACLED data, not an outlet's country (same conclusion this codebase already reached for lat/lng geocoding — see `docs/brain/14_CHANGELOG.md` v0.30.0). No DB migration. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.87.0.

> ⚠️ UPDATED 2026-09-24 (#186 Phase 7, correction + new findings) — Real screenshots (not just overflow measurements) plus a full 14-mock Stitch review found that PHASE 63's `/dashboard` overflow fix, previously reported closed, produces a nearly-unreadable result: headlines truncate to ~8-10 characters. The same harder look found two more instances of the identical pattern: `/alerts` rule names truncate ("News — Middle East — Severity 6+" → "News ..."), and `/calendar`'s event table shows Date/Time/Country by default with the event name scrolled off as the 4th column. **None of these are fixed** — a reverted, non-working attempted fix on `/dashboard` is documented in `docs/brain/LIVE_TODO.md` so it isn't retried. New standing rule (D30/ADR 026): mobile verification requires both a nested-overflow check and visual inspection of a real screenshot — "0px overflow" alone does not mean "readable." Also: three specific Stitch-inspired UI builds recommended (dashboard price-impact chip, alerts match-count sparkline, calendar day-picker strip), grounded in `21_PROJECT_BRIEFING.md`'s positioning and competitor table — not yet approved or built. This tree: PHASE 64.

> ⚠️ UPDATED 2026-09-23 (#186, real overflow bugs + verification fix) — Founder reported still seeing horizontal-scroll issues despite prior "0px overflow" claims. Root cause: every prior phase's check (`document.documentElement.scrollWidth`) has a real blind spot — any `overflow-y-auto` container auto-computes `overflow-x: auto` too (CSS spec), hiding overflow inside it from the document-level number. Found and fixed two real, pre-existing bugs this exposed: `/dashboard`'s feed rows (up to 150px pushed off-screen, headline had no `min-w-0`; also fixed `FilterBar.tsx`'s non-stacked field layout) and `/settings`'s tabs (a 5th "DATA" tab was already off-screen, missed by PHASE 61's measurement). Full 24-page re-sweep with the corrected method: clean everywhere else. `09_BACKLOG.md`'s pre-merge checklist updated so future phases check both ways. `tsc --noEmit` clean. This tree: PHASE 63.

> ⚠️ UPDATED 2026-09-23 (#186 Phase 5b, tap-target) — Homepage footer links (`app/page.tsx`) fixed to 44×44px tap targets. The handoff doc said 9 occurrences of the shared className; re-counted and found **10** (the `/terms` link's className has the same string as a prefix plus extra classes, missed by a naive count) — all 10 fixed. Verified live at 360px (all measured `height:44`, was 15px) and 1440px (0px overflow, no visual regression). `className`-only, `tsc --noEmit` clean. A stale orphaned dev-server process from the prior session (broken file watcher) briefly blocked verification — restarted, not a product bug. Remaining: the same sweep across the other 23 pages, and Phase 6. Evidence: `docs/brain/LIVE_TODO.md`. This tree: PHASE 60.

> ⚠️ UPDATED 2026-09-23 (#186 Phase 5b, tap-target sweep fully closed) — Finished the 44×44 sweep: after the shared-component pass (PHASE 61), fixed all ~13 remaining per-page dense controls (filter selects via one shared `SELECT_CLASSES` constant, desk/toggle/range buttons, watchlist chips + remove buttons, MapLibre zoom controls via CSS override, admin tabs) across dashboard/alerts/watchlist/calendar/watchlist-symbol/map/backtesting/settings/help/admin. New verification standard applied: every fix checked by both size AND actual interaction (click/select, confirm state changes) — founder instruction mid-session, see `docs/brain/LIVE_TODO.md`. Hit and resolved a Turbopack stale-chunk issue on the dev server (304s for edited files) via a clean restart + cache clear. `tsc --noEmit` clean. #186's tap-target item is done; Phase 6 (768px tablet pass) is the only open item left in #186. This tree: PHASE 62.

> ⚠️ UPDATED 2026-09-23 (#186 Phase 5b, tap-target sweep) — Ran the full 44×44 tap-target discovery sweep across all 24 pages at 360px, then fixed the highest-leverage shared components: `TopBar.tsx` bell/avatar (visible size unchanged, unread badge stays correctly anchored), `PublicHeader.tsx` logo link, and 5 auth pages' eye-toggle/CTA/forgot-password elements. Deliberately left inline sentence links alone (WCAG 2.5.5 exemption). ~13 per-page dense controls found (selects, chips, toggles) but scoped out of this pass by founder decision — itemized in `docs/brain/LIVE_TODO.md`. All 24 routes reconfirmed 0px overflow. `tsc --noEmit` clean. This tree: PHASE 61.

> ⚠️ UPDATED 2026-09-23 (#186 Phase 5b, partial) — `/events/[id]`'s ANALYSIS/HISTORICAL/MAP/SOURCES tab row was silently clipping the "sources" tab out of reach on phones (real functionality loss, verified by scroll+click before and after) — fixed with `overflow-x-auto`. 3-column meta row also fixed (`grid-cols-1 sm:grid-cols-3`). `/admin/metrics` + 4 overlay components confirmed already mobile-safe. A tap-target fix for the homepage footer was identified but not applied before the session paused — see the handoff doc. Evidence: `docs/brain/LIVE_TODO.md`. This tree: PHASE 59.

> ⚠️ UPDATED 2026-09-23 (#186 Phase 5a) — A codebase-wide grep for the exact Phase-2 bug pattern found it unconditionally in 4 more pages: `settings`, `backtesting`, `watchlist`, `watchlist/[symbol]`. Worse severity than Phase 2 — screenshotted before the fix, most content rendered in a narrow sliver with truncated text and a dead black zone covering half the screen at 360px, not just extra scroll. Fixed identically (gate desktop values behind `md:`). Also: `ALPHA` badge removed from the sidebar, one military-clearance-style string replaced. 6 shadcn/ui primitives confirmed dead code; 6 more files (including all 6 auth pages) confirmed already mobile-safe with zero changes. Evidence: `docs/brain/LIVE_TODO.md`. This tree: PHASE 58.

> ⚠️ UPDATED 2026-09-23 (#186 Phase 4) — `/map` went from 0% to 100% visible on a phone: the two desktop side panels were previously unconditional at every viewport (that was the actual bug), now gated `hidden md:block`/`hidden md:flex` behind a new `md:hidden` `MobileTensionSheet`. Real pre-existing bug also fixed: `MapSignalPopup`'s width formula went negative below ~416px, so tapping a marker on any phone already did nothing — verified desktop positioning math is provably unchanged (same container-relative offset at 1440px). New mobile-only zoom buttons added (founder-approved addition beyond parity — no scroll-wheel on phones). A founder-directed critical review of the Stitch mock against real page functionality preceded implementation — caught a fabricated latency stat and a mismatched feed-card style in the mock, neither was copied. Evidence: `docs/brain/LIVE_TODO.md`. This tree: PHASE 57.

> ⚠️ UPDATED 2026-09-23 (#186 Phase 3) — New `MobileTabBar.tsx` (`md:hidden`): FEED/MAP/ALERTS/WATCHLIST/MORE. MORE opens the existing `Sidebar` drawer — no new nav surface, nothing duplicated. `TopBar`'s mobile hamburger removed as redundant. This is the first #186 phase that changes what the app looks like, not just fixes an overflow bug. Verified at 390px and 1440px (desktop bar `display:none`, zero shift). Evidence: `docs/brain/LIVE_TODO.md`. This tree: PHASE 56.

> ⚠️ UPDATED 2026-09-23 (#186 Phase 2) — `/alerts`' 335px mobile overflow and `/calendar`'s equivalent are fixed. Root cause was **not** the TopBar (the original theory) — both pages had a hardcoded `ml-[256px] mr-[260px]` on their own wrapper, duplicating the shared layout's sidebar margin unconditionally on every viewport. Gated behind `md:`; desktop unchanged. `/alerts` is 0px overflow everywhere except a pre-existing, tracked 183px at exactly 768px (Phase 6 territory). `/calendar` is 0px at all widths. All edits are `className`-only — audited before commit, zero logic changed. Evidence + a workflow-correction note: `docs/brain/LIVE_TODO.md`. This tree: PHASE 55.

> ⚠️ UPDATED 2026-09-23 (#186 re-planned around Stitch mobile mocks; Phase 1 shipped) — `docs/stitch_mobile/` (commit `d10626b`) analyzed and adopted as **layout reference only** (D29/ADR 025): the mocks reintroduce copy already deliberately removed for being false (fabricated engine name, invented accuracy stat, false latency/SLA claims, ACLED-as-active), plus new fabrications (price targets, directional calls, military-roleplay copy). Palette is verified token-identical to live code, so `docs/stitch_mobile/tactical_intelligence_terminal/DESIGN.md` is now the canonical design-system doc; both `07_DESIGN_SYSTEM.md` files marked superseded. Phase 1 (copy integrity: backtesting footer, dashboard confidence badge) shipped. The #186 phase numbering was reset for this re-plan — see `09_BACKLOG.md` for the mapping. `/alerts` still overflows 335px at 360px; `/map` still renders 0% map on a phone — both unfixed, next up. Evidence: `docs/brain/LIVE_TODO.md`. This tree: PHASE 54.

> ⚠️ UPDATED 2026-09-23 (Next 16 proxy rename) — `apps/web/middleware.ts` is now **`apps/web/proxy.ts`** (Next 16 deprecated the `middleware` file convention; `next build` auto-applies the codemod, so this was done deliberately rather than left to reappear in every build). Logic byte-identical — same Supabase SSR session handling, same `isProjectReady` gate, same all-paths matcher. Backend `apps/backend/src/middleware/auth.ts` is unrelated and unchanged. Both gate directions verified on the production build against a live signed-in session. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.85.0. This tree: PHASE 52.

> ⚠️ UPDATED 2026-09-23 (#186 responsive foundations, Phases 1+2) — iOS form-input zoom fixed globally (16px under 768px), 328 sub-12px type occurrences given a 12px phone floor, two clipping table wrappers fixed, and the public `/accuracy` + `/status` header extracted to a shared `PublicHeader` component (111px / 117px horizontal overflow at 360px → 0px). **The app is still not responsive overall:** only 19 of 81 `.tsx` files carry any breakpoint prefix. `/alerts` overflows **335px** at 360px and `/map` renders **0% map** on a phone. Claude Design (`DesignSync`) is **not authorized here** — needs a one-time `/design-login` from an interactive terminal session. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.84.0. This tree: PHASE 51.

> ⚠️ UPDATED 2026-09-23 (ACLED claims removed from web copy) — ACLED is confirmed inactive in production (no credentials configured — see `ACLED collector requires credentials | Open` row below). Homepage "How it works" copy, the dashboard coverage line, and the `/status` pipeline-check detail no longer claim it as an active source. Backend integration code and the founder-only `/admin/service-status` page (already honest) are untouched. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.83.0. This tree: PHASE 50.

> ⚠️ UPDATED 2026-09-23 (backtesting fabricated-engine + accuracy-stat removal) — Backtesting Lab no longer shows the fabricated "GENESIS-X_V4" engine name / "15 years" claim, and the fixed 71% `accuracyPct` stat is gone end to end (API + UI). `isDemo` disclaimer and `Math.sin`-based demo math unchanged; a real backtesting engine is still backlog C1 / #171, not started. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.82.0. This tree: PHASE 49.

> ⚠️ UPDATED 2026-09-21 (#178 + #179) — list `GET /api/signals` maps `novelty` / `sourceConfirmation` / `materialityReasoning` (same as `:id`). Map popup shows null-hidden source-confirmation label instead of `{n}% confidence`. Still unread: `relevance` / `materiality_pass`. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.81.0. This tree: PHASE 48.
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

> ⚠️ UPDATED 2026-09-12 (Discord alert channel) — webhook-URL-paste Discord delivery: `user_channels.discord_webhook_url` / `discord_connected_at`, dispatcher `discord` branch, Settings `<DiscordConnect />` + `POST /api/discord/test`, alert-rule Telegram/Discord/Slack checkboxes. No bot/OAuth. RLS unchanged. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.56.0. This tree: PHASE 22.

> ⚠️ UPDATED 2026-09-12 (#53 remainder complete) — historical `commodity_impacts` backfill finished. Final: 2,891 signals, 1,678 filled / 1,213 Haiku-classified empty (all remaining empties checkpointed). No application code changed. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.57.0. This tree: PHASE 23.
>
> ⚠️ UPDATED 2026-09-13 (#137) — four event-page trust/UX bugs fixed in `apps/web` only: typed chat-history errors, flat-price subtext (diagnosed as a real 0% move, not a stale fetch) + severity-gated alert CTA, ANALYSIS Verification box removed, briefing empty-state is severity-gated rather than an outage story. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.58.0. This tree: PHASE 24.
>
> ⚠️ UPDATED 2026-09-13 (#138 Phase 2) — `apps/web` only: missing-client toasts no longer show `"Supabase client not available"`; IngestionStatusBanner no longer interpolates the Upstash `reason`; accuracy/metrics pages use a fixed fallback sentence. Middleware auth-unavailable copy unchanged (8s timeout only; longer outage not distinguishable). Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.59.0. This tree: PHASE 25.
>
> ⚠️ UPDATED 2026-09-13 (#138 fully closed) — voice guide D24 / ADR 020; `apiErrorLogged()`; remaining settings/auth/feed/confirm leaks. Brain changelog: v0.59.1. This tree: PHASE 26.
>
> ⚠️ UPDATED 2026-09-13 (#140) — `CommodityChip` no longer shows a raw classifier-confidence percent next to the direction arrow (`apps/web` only). Confidence stays on the API/prop and in "model classification confidence {n}%" aria-label. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.60.0. This tree: PHASE 27.

> ⚠️ UPDATED 2026-09-13 (later, #141 — the most consequential ingestion change to date) — `apps/backend` + migration only. Direct answer to the #139 audit's finding that 63% of signals in a 14-day window were severity 1-4 "no market impact" junk: classification never had a reject step, so everything Claude classified became a `signals` row. Adds a materiality gate — 8 new `signals` columns (`relevance`, `novelty`, `event_category`, `market_mechanism`, `is_preview`, `source_confirmation`, `materiality_pass`, `materiality_reasoning`) and a second question `classifyEvent()` (and the heuristic fallback, conservative-consistently) must answer after classifying: does this story clear BBR's own reasonable-investor-inspired materiality bar (genuine new information AND a real market mechanism / watchlist-entity hit / genuine armed-conflict relevance)? Enforced at all 5 live classify-then-insert call sites; a fail skips the `signals` insert (raw_events kept for audit) and logs to `service_health_events`. Verified live against production with 3 real Claude-classified test stories (junk administrative story correctly rejected, a pure calendar-reminder correctly flagged `isPreview: true` and rejected, a real Red Sea tanker-strike story correctly passed with a genuine mechanism) — all test rows deleted after. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: `docs/brain/14_CHANGELOG.md` v0.61.0. This tree: PHASE 28.
>
> ⚠️ UPDATED 2026-09-13 (#142) — #141's hardcoded 7-entity watchlist is now `public.media_impact_watchlist` (live on `evavcgfmemwryggdkjmx`) plus `signals.media_impact_entity`. `classifyEvent()` reads active rows through a 10-min in-memory cache; the UI shows a `[Media-Impact]` tag (historical pattern, not a forecast) when the field is set. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.62.0. This tree: PHASE 29.
>
> ⚠️ UPDATED 2026-09-13 (#143) — event-detail / SignalQuickView "PROJECTED IMPACT" box relabeled **MARKET IMPACT ASSESSMENT** and populated from #141/#142 columns (`market_mechanism`, `event_category`, `is_preview`, `media_impact_entity`, plus existing impacts). Empty-match fallback is the sourced Caldara & Iacoviello (2022) sentence, not a live GPR number. No raw classifier-confidence percent in the box. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.63.0. This tree: PHASE 30.

> ⚠️ UPDATED 2026-09-13 (#144) — `outcome-tracker.ts` writes `signal_outcomes` at 1h/4h/24h/48h (eligible per horizon once that many hours old). 48h thresholds and the 24h price-distance guard are unchanged. `GET /v1/accuracy` filters `checkpoint_hours=48` so the new rows do not change the public headline. Unique key widened to `(signal_id, asset, checkpoint_hours)` — no new column. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.64.0. This tree: PHASE 31.
>
> ⚠️ UPDATED 2026-09-18 — Sidebar brand name links to `/dashboard`. Landing hero `<p>` was a short brand line later replaced by #174; h1 and meta descriptions unchanged. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.65.0. This tree: PHASE 32.

> ⚠️ UPDATED 2026-09-19 (#123 remainder) — every event-detail click opens a new tab (`target="_blank" rel="noopener noreferrer"`), not only SignalQuickView. Live feed is inline in `dashboard/page.tsx`. ProductTour handoff stays same-tab. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.67.0. This tree: PHASE 34.

> ⚠️ UPDATED 2026-09-19 (#142 data) — `media_impact_watchlist` is 8 sourced rows. Musk evidence is the 2018 "funding secured" / SEC record (`markets` still empty: TSLA/BTC not tracked). New compromised-official-account row for the 2013 AP Twitter hack. Classifier/UI path unchanged. No Trump-named individual row. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.68.0. This tree: PHASE 35.

> ⚠️ UPDATED 2026-09-19 (#145) — watchlist list page first-paints `COMMODITIES` cards when there are no selections, plus category chips to add/remove (dropdown kept). Drill-down is one price chart with 1M/6M/1Y/3Y/5Y (90-day DB for 1M, Yahoo weekly 5y fetch for longer). Honest 5Y empty/incomplete copy unchanged. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.66.0. This tree: PHASE 33.

> ⚠️ UPDATED 2026-09-19 (#146) — 10 pre-confirmed prospect/demo accounts (`demo01@`–`demo10@bluebeaconresearch.com`) with `profiles.is_test_account`. Confirm Email stays ON for real signups. Founder-console usage metrics and digest eligibility exclude the flag. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.69.0. This tree: PHASE 36.

> ⚠️ UPDATED 2026-09-19 (Driver.js feature hints) — first-time pulsing hints on Watchlist chips/dropdown, dashboard FilterBar, and event-detail RECORD (`driver.js` Feature Hints, `bbr_hint_seen_<id>`). RECORD also has a persistent hover tooltip matching `handleRecord()` (browser localStorage only). Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.70.0. This tree: PHASE 37.

> ⚠️ UPDATED 2026-09-19 (Fastify /docs no longer public) — production Swagger UI at `/docs` was unauthenticated. Now `development`/`test` only. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.72.0. This tree: PHASE 39.
>
> ⚠️ UPDATED 2026-09-19 (Cmd+K search assist) — existing palette search kept; Suggested group is a RAG fallback when that search returns <2 hits. `POST /v1/search/assist`, `search_content_embeddings`, Haiku on the chat daily budget. FAQ indexed as of #155. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.71.0. This tree: PHASE 38.
>
> ⚠️ UPDATED 2026-09-19 (#155 minimal FAQ) — `/help` FAQ + `feedback_submissions` (table, not Resend; no live chat). Sidebar/Settings/TopBar/Cmd+K. `SEARCH_FAQ_ENTRIES` filled. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.73.0. This tree: PHASE 40.
>
> ⚠️ UPDATED 2026-09-20 (#143 leftover) — event-detail surfaces already-stored `novelty` / `sourceConfirmation` / `materialityReasoning` (null-hidden). `/api/signals/:id` mapping only. Quick-view header no longer prints raw `{n}% confidence`. Timeline / related-event clustering not built. Still unread: `relevance` / `materiality_pass`. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.74.0. This tree: PHASE 41.

> ⚠️ UPDATED 2026-09-20 (homepage copy integrity) — `apps/web/app/page.tsx` drops fabricated 42ms / 100% Verified / 40yr / Encrypted Support / sub-second claims; retone to research language; live `signals` count + `/accuracy` link (no homepage hit-rate %). Prices unchanged. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.75.0. This tree: PHASE 42.

> ⚠️ UPDATED 2026-09-20 (#174 + #175) — landing hero `<p>` is "Blue Beacon Research — Geopolitical Intelligence for Commodity Traders" (headline unchanged). Map Tension Index info tooltip closes on outside click; hover preview and methodology sentence unchanged. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.76.0. This tree: PHASE 43.

> ⚠️ UPDATED 2026-09-20 (search-quality fix) — Cmd+K `CommandPalette.tsx` Pages/Watchlist/Alert-Rules matching moved from exact-substring to Fuse.js fuzzy+keyword; added a missing Economic Calendar page entry. New `sort=relevance` (recency+severity blend, computed in application code) on both the Next.js BFF `GET /api/signals` and Fastify `GET /v1/signals`; command palette's own Signals search now uses it. Corrected a stale `05_API.md` claim that the BFF signals route proxies to Fastify — it reads Supabase directly. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.77.0. This tree: PHASE 44.

> ⚠️ UPDATED 2026-09-20 (docs onboarding catch-up) — `21_PROJECT_BRIEFING.md` brought to 2026-09-20 (was August). `00_CURRENT_BBR_CONTEXT.md` shipped-since table + real file paths. `22_IMPLEMENTATION_LOG` / `CLAUDE_CONTEXT` / brain `13_PROMPTS` marked historical. `19_ROADMAP` accuracy/outcome-tracker checked. Architecture §9. Dead `claude/23_TODO.md` pointer removed from the files a new model hits first. This tree: PHASE 45.

> ⚠️ UPDATED 2026-09-20 (header search = Cmd+K + last-resort fallback) — TopBar search opens `CommandPalette`; in-page `searchQuery`/`searchSubmitted` path removed. Palette last-resort **"Not sure? Try"** → `/dashboard` when every other source is empty. Keywords expanded; backend `SEARCH_PAGE_ENTRIES` kept in sync. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.79.0. This tree: PHASE 46.

> ⚠️ UPDATED 2026-09-21 (homepage stats count via response body) — `getHomepageStats()` uses a non-HEAD exact `signals` count so "N signals tracked" is in the response body; failures log the full Postgrest error. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.80.0. This tree: PHASE 47.

> ⚠️ UPDATED 2026-09-23 ("LIVE"/"real-time" copy honesty sweep) — `apps/web` copy-only. Every UI string implying instant updates (collectors run roughly every 30 minutes, not instantly) now says so: homepage hero badge/links, dashboard subtitle + signal-stream badge + sidebar label, map page's "Live Intelligence" panel, HelpModal, ProductTour, the feed-degraded error banner. `/status` page also lost a fabricated "WebSocket" claim (no such route exists). Left unchanged: the Accuracy page's "live track record" link, the pricing page's "Live signal feed" tier claim (business copy, not rewritten), `/status`'s meta description (accurate), `IngestionStatusBanner`'s "Live ingestion" (the one genuinely real-time-accurate label). `apps/backend/src/lib/search-catalog.ts` now has a stale quote of the retired badge text — flagged as a follow-up, out of this task's `apps/web`-only scope. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.86.0. This tree: PHASE 53.

> ⚠️ UPDATED 2026-09-24 (Day Mode dead-control removal) — `apps/web` only. Settings > Appearance's "Day Mode" card was a permanent no-op: `useTheme()` (`next-themes`) had no `<ThemeProvider>` mounted anywhere in the app, so `setTheme("light")` did nothing. Real light mode would need more than a provider anyway — `tailwind.config.ts`'s hardcoded-hex color tokens (used across ~50 files) are disconnected from the unused `[data-theme="light"]` CSS variables already sitting in `globals.css`. Founder chose to remove the dead card rather than build an app-wide light theme; Appearance now shows one static, always-selected "Trader (Default)" card. See D31 / ADR 027 in `10_DECISIONS.md`. Backlog C4 rejected, see `09_BACKLOG.md`. Evidence: `docs/brain/LIVE_TODO.md`. Brain changelog: v0.88.0.

Last updated: 2026-09-24 (Day Mode dead-control removal, Settings > Appearance)

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

Repeated `credit balance too low` (2026-08-19; #53 backfill 2026-09-11, 201 rows skipped; 2026-09-12 ingest, every classify call). Credit topped up 2026-09-12; #53 remainder completed the same day. Ops problem, not a code path to "fix" by retrying the API.

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
