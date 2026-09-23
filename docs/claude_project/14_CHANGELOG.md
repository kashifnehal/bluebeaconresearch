# 14_CHANGELOG.md — Project Evolution & Chronological History

> **📍 Doc status — live changelog as of 2026-09-23 (PHASE 53).** Full technical record: `docs/brain/14_CHANGELOG.md`. `claude/23_TODO.md` is not in this repo.

**Classification: Internal — CTO Level**

---

## PHASE 63 — #186: REAL OVERFLOW BUGS FOUND AFTER FOUNDER REPORT, VERIFICATION METHOD FIXED (2026-09-23)

`apps/web` only, `className`-only. Founder reported still seeing horizontal-scroll issues on `localhost:3100` despite PHASE 59-62's "0px overflow" claims. Investigated with real screenshots (not just JS metrics) and found the gap: **every prior phase's overflow check used only `document.documentElement.scrollWidth`, which cannot see a real, spec-defined CSS quirk** — any container with `overflow-y: auto` (the main scroll wrapper on 7+ pages) auto-computes `overflow-x: auto` too, creating an invisible nested scroll region.

**Two real bugs found and fixed, both pre-existing (confirmed via `git log`, neither caused by this session's earlier tap-target commits):**
1. `/dashboard`'s feed rows — up to 150px of content (including the trailing "go to event" chevron) pushed off-screen, reachable only by an undiscoverable swipe inside one row, because the headline `<div>` had no `min-w-0` and couldn't shrink. Fixed with `min-w-0 truncate` on the headline, hid two supplementary badges (`MediaImpactTag`, source-confirmation) on mobile (both remain fully visible on the event's own detail page — nothing deleted), and tightened row spacing. Also fixed in the same investigation: `FilterBar.tsx`'s non-stacked field layout (dashboard-only) never stacked label-above-control on mobile — now does, matching the pattern `/map`'s sidebar already used safely.
2. `/settings`'s section tabs — `TABS` has 5 entries but PHASE 61's tap-target pass only ever measured the 4 visible at 360px; `DATA` was already off-screen. Fixed with `overflow-x-auto` + `shrink-0` per tab, the same intentional horizontal-scroll-region pattern already used by `/accuracy` and `/calendar`'s data tables.

**Full 24-page re-sweep with the corrected method** (walks every element, not just the document): clean everywhere else — the only other hits were `/accuracy`'s and `/calendar`'s own tables, confirmed as the correct, intentional mobile-table pattern, not bugs. Verified per the new two-check standard (size AND interaction): dashboard's buttons/select still fire correctly, settings' tabs still switch content, both re-confirmed pixel-identical on desktop. `tsc --noEmit` clean.

**Process fix:** `09_BACKLOG.md`'s manual pre-merge checklist now requires the nested-overflow walk, not just the document-level check, for all future #186 phases.

---

## PHASE 62 — #186 PHASE 5B (TAP-TARGET): PER-PAGE DENSE CONTROLS, SWEEP FULLY CLOSED (2026-09-23)

`apps/web` only, 16 files, all `className`/CSS-only. Closes the ~13-item deferred list from PHASE 61. One shared fix (`lib/utils.ts`'s `SELECT_CLASSES` constant) cleared every filter `<select>` across 5 pages at once. Per-page: dashboard (desk buttons, My Feed toggle), alerts (nav buttons, New Alert Rule), watchlist (commodity chips, remove buttons, Force Refresh), calendar (UTC/Local), `/watchlist/[symbol]` (back button, chart-range buttons), `/backtesting` (horizon buttons), `/settings` (section tabs), `/help` (Send Feedback), admin (back links, service-status tabs/Load data). `/map`'s MapLibre zoom controls fixed via a mobile-scoped CSS override (not touching library internals) — desktop untouched since they're already desktop-hidden by design.

**New verification standard applied this pass** (founder instruction, mid-session): every fix checked two ways — size AND an actual interaction (click/select and confirm the resulting state change), not size alone. Two elements were deliberately left un-fixed after investigation: a Driver.js onboarding-hint beacon (third-party, transient, self-dismissing) and MapLibre's own attribution link (required third-party attribution).

**Hit and resolved a real dev-environment issue mid-pass:** after editing all 16 files, several pages served stale pre-edit markup (one, `/backtesting`, threw a hydration-mismatch error on every load) even on hard reload — root-caused to Turbopack returning `304 Not Modified` for changed files' JS chunks on a **freshly-started** server (not the earlier orphaned-process issue — this was a fresh restart still missing some file-watch events). Fixed by killing the server, clearing `.next/cache/{webpack,turbopack}`, and restarting; confirmed resolved via `read_network_requests` (chunks recompiled) and a flat console-error count across repeat navigations. Full detail: `docs/brain/LIVE_TODO.md`.

`tsc --noEmit` clean. **#186 Phase 5b (tap-target sweep) is now fully closed** — all 24 pages, shared components and per-page dense controls alike.

---

## PHASE 61 — #186 PHASE 5B (TAP-TARGET): SHARED-COMPONENT FIXES + FULL 24-PAGE DISCOVERY SWEEP (2026-09-23)

`apps/web` only. Ran the 44×44 JS-snippet sweep (from the handoff) across all 23 remaining pages at 360px, corrected to exclude off-canvas elements (the first pass falsely flagged the closed mobile sidebar drawer's links — they're `translate`d off-canvas, not `display:none`, so they report real but unreachable bounding-box sizes). Found violations on ~20 of 24 pages. Founder scoped this pass to the shared components that clear the most pages per fix:

- `TopBar.tsx` notification bell + avatar (24×30, 32×32 → 44×44 hit area on every authenticated page) — restructured so the unread-badge dot stays anchored to the icon and the visible avatar size is unchanged; verified correct at 360px and reverting exactly at 1440px.
- `PublicHeader.tsx` logo link (17×20 → 44px tall on `/status`/`/accuracy`).
- 5 auth pages (login/signup/verify/forgot-password/reset-password): password eye-toggle buttons, "Forgot password?" link, "Resend email"/"Send reset link" CTA buttons.

Deliberately left alone: "Sign up"/"Sign in"-style links embedded in a sentence (WCAG 2.5.5 exempts inline text links from the 44×44 minimum).

**Deferred, not forgotten:** ~13 per-page dense controls (filter `<select>`s, desk-toggle buttons, commodity chips, range-window buttons, etc.) across dashboard/alerts/watchlist/calendar/watchlist-symbol/map/backtesting/settings/help/admin — full itemized list in `docs/brain/LIVE_TODO.md`. All 24 routes reconfirmed 0px horizontal overflow — no new overflow regressions. `tsc --noEmit` clean.

---

## PHASE 60 — #186 PHASE 5B (TAP-TARGET): HOMEPAGE FOOTER LINKS FIXED TO 44×44PX (2026-09-23)

`apps/web/app/page.tsx` only, `className`-only. Continuation of PHASE 59's paused tap-target work. The handoff document claimed the footer's shared className occurred 9 times; re-counted at session start and found **10** — the `/terms` link carries the same string as a prefix of a longer className, undercounted by a naive `grep -c`. Fixed all 10 with `min-h-[44px]` (plus `inline-flex items-center` on the 9 simple links). Verified live in-browser: all 10 links measured 44px tall at 360px (were 15px), 0px horizontal overflow at 360px and 1440px, no visual regression on desktop, `tsc --noEmit` clean.

**Environment note, not a product bug:** verification was initially blocked by a stale orphaned `next dev` process (leftover from the prior session) whose file watcher had stopped picking up edits — confirmed via both live DOM measurement and a raw `curl` of its server HTML. Killed and restarted; fix then verified correctly.

Remaining: the same 44×44 sweep across the other 23 pages, and Phase 6 (768px tablet pass). See `docs/brain/LIVE_TODO.md` for full detail.

---

## PHASE 59 — #186 PHASE 5B (PARTIAL): `/events/[id]` TAB-CLIPPING BUG (2026-09-23)

`apps/web` only. A genuine functionality-loss bug, not a design-fit question: the event detail page's ANALYSIS/HISTORICAL/MAP/SOURCES tab row had no responsive handling, and at 360–390px its content width exceeded the viewport — the "sources" tab was silently clipped out of reach, not scrollable, not visible, completely unusable on a phone. Fixed with `overflow-x-auto` on the tab list; verified by actually scrolling to and clicking the previously-unreachable tab and confirming its content panel switched.

Also fixed: the PUBLISHED/VERIFICATION/LOCATION meta row crammed 3 columns into ~100px each at 360px, wrapping badly — now `grid-cols-1 sm:grid-cols-3`.

`/admin/metrics` and 4 overlay components (`ProductTour`, `FeatureHints`, `NotificationConnectPrompt`, `NotificationConnectModal`) checked and confirmed already mobile-safe — no changes needed.

**Session paused for a context handoff before Phase 5b finished.** In progress, not yet applied: a 44×44 tap-target fix for the homepage footer links (identified, same `min-h-[44px]` pattern used elsewhere this phase). See `docs/brain/LIVE_TODO.md` and the handoff doc for exact continuation point.

---

## PHASE 58 — #186 PHASE 5A: 4 MORE PAGES WITH THE SAME CRITICAL BUG (2026-09-23)

`apps/web` only. Grepped the whole codebase for the exact bug pattern that caused Phase 2's `/alerts`/`/calendar` overflow (`fixed`/margin values in raw pixels, unguarded by `md:`) instead of re-auditing file by file — found the byte-identical wrapper `fixed inset-0 left-[256px] right-[260px] top-16 ... p-10` unconditionally in `settings/page.tsx`, `backtesting/page.tsx`, `watchlist/WatchlistClient.tsx`, and `watchlist/[symbol]/page.tsx`.

**This was worse than the original bug**, not the same severity: screenshotted before the fix, content rendered in a narrow sliver with most text truncated and a large dead zone covering half the screen, because the fixed left/right offsets left near-zero usable width at 360px. Same fix as Phase 2 — gate every desktop value behind `md:` so `>=768px` is byte-identical to before.

Two more bugs in the same investigation: `WatchlistClient.tsx`'s header row had the same unwrapped title-vs-control shape as the original `/alerts` bug (fixed with `flex-wrap`), and its floating add button used a desktop-tuned offset that didn't account for the new mobile tab bar (screenshotted as a barely-visible sliver before the fix).

Also this batch: the `ALPHA` status badge removed from the sidebar (founder decision), and one genuine military-clearance-style string (`SEC_LVL: ALPHA`) replaced with copy that actually describes the modal. Confirmed six shadcn/ui primitives are dead code (zero importers) and six more files — including all 6 auth pages — are already mobile-safe despite carrying zero Tailwind breakpoint prefixes, so no changes were made to them.

Verified live at 360px and 1440px with real signed-in data on all four pages; full detail in `docs/brain/LIVE_TODO.md`.

---

## PHASE 57 — #186 PHASE 4: MAP BOTTOM SHEET — 0% → 100% MAP VISIBLE ON MOBILE (2026-09-23)

`apps/web` only. Fixes the single worst mobile bug in the product plus a real pre-existing bug found along the way.

**Founder-directed critical review before implementing:** did a full functional inventory of `/map` and checked the Stitch mock against it rather than reskinning blind. The mock omits the 24h tension sparkline (kept anyway — real functionality, not optional), invents a fabricated `LATENCY ~5M` stat (not included), and shows feed-card badges from a different page's design that don't match this page's real data shape (kept the real card format). Founder approved one deliberate addition beyond parity: mobile-only +/- zoom buttons (MapLibre `NavigationControl`), since phones have no scroll-wheel.

New `components/map/MobileTensionSheet.tsx` — `md:hidden`, tap-to-expand, owns no data (pure prop pass-through from `map/page.tsx`'s existing state). The two desktop panels, previously unconditional at *every* viewport (the actual cause of 0% map visibility on phones), now gate behind `hidden md:block`/`hidden md:flex`.

**Bonus fix, independent of the sheet work:** `MapSignalPopup.tsx` had a real bug — its width formula went negative below ~416px viewport, so tapping any map marker on a phone already did nothing. Fixed via a CSS custom property so desktop math is provably unchanged (verified the exact same `24rem+1rem` container-relative offset survives at 1440px).

Verified live at 390px with real signed-in data: map 0%→100% visible, zoom controls work, popup opens correctly with real signal data, cluster-zoom and point-tap handlers (untouched logic) confirmed still firing. Desktop 1440px confirmed byte-identical. Full detail + a verification-technique note (canvas click testing via the React fiber tree) in `docs/brain/LIVE_TODO.md`.

---

## PHASE 56 — #186 PHASE 3: MOBILE BOTTOM TAB BAR (2026-09-23)

`apps/web` only. First piece of the rework that actually looks like the Stitch design rather than a bug fix.

New `components/layout/MobileTabBar.tsx` — fixed bottom nav, `md:hidden`: FEED / MAP / ALERTS (unread badge) / WATCHLIST / MORE. MORE opens the existing off-canvas drawer (`Sidebar`'s, via `useUIStore.mobileSidebarOpen`) instead of a second nav surface — Calendar/Backtesting/Settings/Help/Logout are unchanged, still in the drawer. Icon names and active-route logic copied verbatim from `Sidebar.tsx` so mobile and desktop never drift independently. `TopBar.tsx`'s mobile hamburger removed as redundant with MORE. `<main>` gained mobile-only bottom padding to clear the fixed bar.

Verified live at 390px (correct active-state color per route, real unread badge, drawer opens/closes via the MORE button) and at 1440px (bar `display:none`, zero layout shift). Full detail + a tooling note (an input-simulation flake vs. a real bug, resolved by verifying the click handler directly) in `docs/brain/LIVE_TODO.md`.

---

## PHASE 55 — #186 PHASE 2: `/alerts` + `/calendar` MOBILE OVERFLOW FIXED (2026-09-23)

`apps/web` only, `className`-only edits (audited before commit — zero logic/handler/data changes).

The original diagnosis (TopBar search box `flex-1`/`min-width:auto`) was wrong — those `min-w-0` fixes measured zero effect. Real cause, found by scanning the live DOM for the actual rightmost-extending element: `alerts/page.tsx` and `calendar/page.tsx` both had a hardcoded `ml-[256px] mr-[260px]` on the page's own wrapper, duplicating the shared layout's sidebar margin, unconditionally on every viewport including phones with no sidebar at all. Gated both behind `md:`. A second bug in `alerts/page.tsx`'s header row (title + tab-switcher pill, no wrap) caused a narrow-band 33px residual at exactly 390px — fixed with `flex-wrap`.

`/alerts`: 0px overflow at 360/390/414/1024/1440; 183px at 768 is pre-existing (Phase 6 tablet-squeeze territory, not touched). `/calendar`: 0px at all six widths. `/dashboard` + `/watchlist` re-verified with no regression. Full detail + an honest workflow-correction note (repeated session sign-outs were self-inflicted by unnecessary server restarts, not real token expiry) in `docs/brain/LIVE_TODO.md`.

---

## PHASE 54 — #186 PHASE 1: COPY INTEGRITY + STITCH MOCKS ANALYSIS (2026-09-23)

`apps/web` + docs only. First ship of the re-planned #186 responsive rework (Stitch mobile mocks at `docs/stitch_mobile/`, commit `d10626b`, analyzed and adopted as **layout references only** — see D29/ADR 025).

- **Backtesting footer** (`app/(dashboard)/backtesting/page.tsx`) — dropped three fabricated claims (`SYSTEM HASH`, `LATENCY: 12ms`, `DATA INTEGRITY: 100% Verified`) that survived the earlier PHASE 49 cleanup of this same file.
- **Dashboard feed badge** (`app/(dashboard)/dashboard/page.tsx`) — the real-but-inconsistent `{n}% CONFIDENCE` pill replaced with the same source-confirmation label `MapSignalPopup` already uses, for one consistent language app-wide.
- **Design system declared.** Both `07_DESIGN_SYSTEM.md` files marked superseded (neither matched shipped reality). `docs/stitch_mobile/tactical_intelligence_terminal/DESIGN.md` is now canonical — verified token-identical to live `tailwind.config.ts`/`globals.css`.
- **New standing rule (D29/ADR 025):** Stitch mocks provide geometry, never copy, since they were generated from a pre-cleanup snapshot and reintroduce previously-removed fabrications. Also locked: drop `ALPHA` badge, drop military-roleplay copy, mobile tab bar is FEED/MAP/ALERTS/WATCHLIST/MORE.

Verified: `tsc --noEmit` + `next build` clean, full `apps/web` test suite passing, production build checked at 360px/1440px. Evidence + one honest verification gap: `docs/brain/LIVE_TODO.md`. Remaining phases (TopBar overflow, mobile tab bar, map bottom sheet, remaining screens, tablet pass) not started — founder decision: no Playwright/new test infra for this work, manual multi-width verification per phase instead.

---

## PHASE 53 — "LIVE"/"REAL-TIME" COPY HONESTY SWEEP (2026-09-23)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.86.0.

`apps/web` only, copy-only. Collectors check for new articles roughly every 30 minutes, not instantly, so every UI string that implied instant/real-time delivery was replaced with "updates roughly every 30 minutes" framing (or the misleading word dropped where it didn't fit): homepage hero badge and links, dashboard subtitle + "LIVE DATA FEED ON" signal-stream badge + sidebar "REAL-TIME SYNTHESIS", the map page's "Live Intelligence" panel and its labels, the Help modal, the onboarding tour, and the feed-degraded error banner.

The `/status` page's Intelligence Feed check also lost a fabricated "WebSocket" claim alongside the "live" fix — no WebSocket route exists anywhere in `apps/backend`.

Deliberately left unchanged: the Accuracy page's "live track record" link (different sense — ongoing, not instant), the pricing page's "Live signal feed" tier claim (business copy; whether the paid tier is actually undelayed vs. the ~30min baseline is unverified, not rewritten here), `/status`'s meta description (accurate — that page runs its checks fresh per request), and `IngestionStatusBanner`'s "Live ingestion" label (the one place in the product that's genuinely real-time-accurate).

**Known follow-up:** `apps/backend/src/lib/search-catalog.ts` still quotes the retired "LIVE DATA FEED ON" badge text — this task was explicitly scoped to `apps/web`.

## PHASE 52 — NEXT 16 `middleware.ts` → `proxy.ts` RENAME (2026-09-23)

`apps/web` only. Next 16.2.0 deprecated the `middleware` file convention in favour of `proxy`, and `next build` auto-applies the codemod — so the rename kept reappearing after every build and risked being committed accidentally inside unrelated work. Done deliberately instead, as its own commit.

`git mv apps/web/middleware.ts apps/web/proxy.ts` plus the exported function name. Supabase SSR session logic, the `isProjectReady` gate, and the `matcher` config are byte-identical. Backend `apps/backend/src/middleware/auth.ts` is a different thing entirely and is untouched.

**Verified both gate directions on the production build against a live signed-in session:** anonymous `/dashboard` + `/alerts` → 307 `/login` (identical to the pre-rename baseline); public `/`, `/login`, `/accuracy` → 200; signed-in `/dashboard`, `/watchlist`, `/alerts` all admitted with `sb-` cookies present. Build registers `ƒ Proxy (Middleware)`; deprecation warning gone. Held uncommitted until observed, because this file caused the 2026-08-28 site-wide outage. Brain changelog: v0.85.0.

---

## PHASE 51 — #186 RESPONSIVE FOUNDATIONS, PHASES 1+2 (2026-09-23)

`apps/web` only. First ship of the mobile/tablet responsive rework.

- **iOS input zoom fixed.** One `@media (max-width:767px)` rule in `globals.css` forces `input`/`select`/`textarea` to 16px. `!important` is required because the auth forms set `fontSize` via inline style objects. Mobile Safari zooms the viewport on focus below 16px.
- **Sub-12px type floor.** All 328 hardcoded arbitrary sub-12px Tailwind sizes across 36 files rewritten to `text-[12px] md:text-[Npx]` — 12px phone floor, desktop unchanged.
- **Table clipping.** `accuracy` and `admin/metrics` had `overflow-hidden` wrappers silently cutting off table columns on narrow screens → `overflow-x-auto` (+ `min-w-[520px]` on accuracy's 4-column table).
- **Public header overflow.** New shared `components/layout/PublicHeader.tsx` replaces the duplicated header in `accuracy` and `status`. `/accuracy` 111px → 0px, `/status` 117px → 0px at 360px.

Verified on the production build in a real browser at 360px, not on the dev server (which was serving a stale CSS chunk). Phases 3–6 — the 21 zero-responsive files, the map, the 768px tablet pass, tap targets, and the regression test — are **not** in this ship. Brain changelog: v0.84.0. Evidence: `docs/brain/LIVE_TODO.md`.

**Known worst remaining:** `/alerts` overflows **335px** at 360px and `/map` renders **0% map** on a phone (two `w-80` panels occlude the viewport; `overflow-hidden` hides it from scroll metrics).

---

## PHASE 50 — ACLED CLAIMS REMOVED FROM WEB COPY (2026-09-23)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.83.0.

- Homepage "How it works" card, dashboard coverage line, and `/status` pipeline-check detail no longer name ACLED as an active source — it's confirmed inactive in production (no credentials configured).
- `apps/backend`'s real ACLED integration code and the founder-only `/admin/service-status` page (already honest) are untouched.

## PHASE 49 — BACKTESTING FABRICATED-ENGINE + ACCURACY-STAT REMOVAL (2026-09-23)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.82.0.

- Removed the always-visible fabricated "GENESIS-X_V4" engine name and "15 years of geo-political volatility markers" claim from the Backtesting Lab panel — replaced with honest "Scenario Simulator" framing.
- Removed the fixed, never-varying 71% `accuracyPct` stat end to end (API + UI) — it implied a real track record next to the demo-mode disclaimer.
- A real backtesting engine over real historical data remains unbuilt (backlog C1 / #171) — this was a data-honesty fix, not new capability.

## PHASE 48 — #178 LIST MATERIALITY FIELDS + #179 MAP POPUP SOURCE CONFIRMATION (2026-09-21)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.81.0.

- List `GET /api/signals` now maps `novelty` / `sourceConfirmation` / `materialityReasoning` (same parsers as `:id`).
- Map popup shows a null-hidden source-confirmation label instead of `{n}% confidence`.

## PHASE 47 — HOMEPAGE STATS COUNT VIA RESPONSE BODY (2026-09-21)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.80.0.

- `getHomepageStats()` now uses a non-HEAD exact count (`select("id", { count: "exact" })`) so "N signals tracked" does not depend on a `Content-Range` header.
- Failures log the full Postgrest error object.

## PHASE 46 — HEADER SEARCH = CMD+K + LAST-RESORT FALLBACK (2026-09-20)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.79.0.

- Header search box is a button that opens the existing Cmd+K palette (`commandPaletteOpen` in `useUIStore`). Old in-page `searchQuery` / `searchSubmitted` filter path removed.
- Last-resort **"Not sure? Try"** row → Intelligence Feed when the palette has no matches. Keyword lists expanded; backend search-catalog page copy kept in sync.

## PHASE 45 — DOCS ONBOARDING CATCH-UP (2026-09-20)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.78.0.

- `21_PROJECT_BRIEFING.md` synced to 2026-09-20 (was August). Materiality gate, chat, accuracy, Help, Fuse/`sort=relevance`, and current open ops items are now in the file a new model is told to paste first.
- `00_CURRENT_BBR_CONTEXT.md` gained a shipped-since table and real repo paths.
- Historical files (`22_IMPLEMENTATION_LOG`, `CLAUDE_CONTEXT`, brain `13_PROMPTS`) marked as such. `19_ROADMAP` accuracy/outcome-tracker checked. Architecture §9 added.

## PHASE 44 — SEARCH-QUALITY FIX: CMD+K FUZZY MATCH + RELEVANCE SORT (2026-09-20)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.77.0.

- Command palette Pages/Watchlist/Alert-Rules matching is now Fuse.js fuzzy+keyword, not exact substring. Added a missing Economic Calendar page entry.
- New `sort=relevance` (recency+severity blend, application-code ranked) on both the Next.js BFF and Fastify signals routes; command palette's own Signals search now uses it. Intelligence Feed page's default sort unchanged.
- Corrected a stale doc claim that the BFF signals route proxies to Fastify — it reads Supabase directly and is the only one of the two with a `search` param.

## PHASE 43 — #174 HOMEPAGE SUBTEXT + #175 TENSION INDEX CLICK-OUTSIDE (2026-09-20)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.76.0.

- Landing hero `<p>` is now "Blue Beacon Research — Geopolitical Intelligence for Commodity Traders". Headline and meta unchanged.
- Map Tension Index info tooltip closes on outside click; hover preview and methodology sentence unchanged.

## PHASE 42 — HOMEPAGE COPY INTEGRITY (2026-09-20)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.75.0.

- Landing no longer claims 42ms / 100% Verified / 40yr archive / Encrypted Support / sub-second synthesis.
- Copy retone to research language; live `signals` count; `/accuracy` link without a homepage hit-rate %.
- Monitor / Analyst / Pro prices unchanged; Pro archive label is now 5-year price history.

## PHASE 41 — #143 LEFTOVER: EVENT-DETAIL MATERIALITY FIELDS (2026-09-20)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.74.0.

- Event-detail now surfaces already-stored `novelty` / `source_confirmation` / `materiality_reasoning` (null-hidden).
- `/api/signals/:id` mapping + MARKET IMPACT ASSESSMENT labels + ANALYSIS "Why this signal".
- SignalQuickView header drops raw `{n}% confidence`. Timeline / related-event clustering not built.

## PHASE 40 — #155 MINIMAL FAQ + FEEDBACK FORM (2026-09-19)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.73.0.

- Logged-in `/help` with 10 FAQ answers from current classifier / materiality-gate / accuracy / LIVE behavior.
- Feedback form writes `feedback_submissions` (chose table over Resend: web app has no `RESEND_API_KEY`). No live chat.
- Discoverable from Sidebar Help, Settings, TopBar avatar, Cmd+K. Search-assist FAQ catalog filled.

## PHASE 39 — FASTIFY /DOCS NO LONGER PUBLIC (2026-09-19)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.72.0.

- Production `GET /docs` was unauthenticated Swagger UI + OpenAPI JSON for the full `/v1` surface.
- Swagger now registers only for `NODE_ENV=development|test`. Auth hook no longer skips `/docs` in production.

## PHASE 38 — CMD+K SEARCH ASSIST (2026-09-19)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.71.0.

- Existing Cmd+K Pages/Signals/Watchlist/Alert Rules search kept. Suggested group is a separate, labeled fallback when that search returns fewer than 2 hits.
- `POST /v1/search/assist` retrieves real page copy via pgvector, then one Haiku sentence on the chat daily budget. FAQ copy indexed as of #155.

## PHASE 37 — DRIVER.JS FEATURE HINTS (2026-09-19)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.70.0.

- First-time pulsing hints (not a guided tour) on Watchlist chips/dropdown, dashboard FilterBar, and event-detail RECORD.
- Seen state is per-browser `localStorage` (`bbr_hint_seen_<id>`). RECORD hover tooltip matches what `handleRecord()` actually writes.

## PHASE 36 — #146 PROSPECT/DEMO ACCOUNTS EXCLUDED FROM USAGE NUMBERS (2026-09-19)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.69.0.

- 10 Admin-API-created, pre-confirmed demo accounts. Confirm Email stays ON globally.
- `profiles.is_test_account` is filtered out of founder-console usage metrics and digest eligibility.
- No `apps/web` signup/login bypass. `/v1/accuracy` sample size is pipeline `signal_outcomes`, not a user count.

## PHASE 35 — #142 INDIVIDUAL_SOCIAL_MEDIA WATCHLIST DATA (2026-09-19)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.68.0.

- Data-only. Live `media_impact_watchlist` is 8 sourced rows (was 7). Classifier, cache, and `[Media-Impact]` tag unchanged.
- Elon Musk evidence is now the August 2018 "funding secured" tweet / SEC settlement record. `markets` still empty (TSLA and BTC are not on BBR's allowlist).
- New `Compromised official social-media account` row for the April 2013 AP Twitter hack (~$136B S&P 500 drop). Not a named individual's credibility. No Trump-named individual row.

## PHASE 34 — #123 REMAINDER: EVENT DETAIL IN A NEW TAB (2026-09-19)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.67.0.

- Every click that opens `/events/{id}` now uses `target="_blank" rel="noopener noreferrer"` (same pattern as the 2026-09-11 quick-view "View full details" link).
- Live Intelligence Feed is inline in `dashboard/page.tsx`; `SignalCard.tsx` is unused on web.
- ProductTour handoff to the event page stays same-tab so Joyride can continue.

## PHASE 33 — #145 WATCHLIST EMPTY-STATE DEFAULTS + SINGLE RANGE CHART (2026-09-19)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.66.0.

- `/watchlist` first-paints shared `COMMODITIES` cards when the user has no selections; category chips add/remove (dropdown kept). Live prices only.
- `/watchlist/[symbol]` is one chart with 1M / 6M / 1Y / 3Y / 5Y. 1M from the 90-day DB series; longer ranges from the existing Yahoo weekly 5y fetch. The two honest 5Y fallback sentences are unchanged.

## PHASE 32 — SIDEBAR LOGO HOME LINK + LANDING SUBTEXT (2026-09-18)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.65.0.

- Sidebar brand name links to `/dashboard`.
- Landing hero subtext (the `<p>` under the h1) was set to a short brand line (later replaced by #174). Headline and meta description unchanged.

## PHASE 31 — #144 MULTI-HORIZON OUTCOME CHECKPOINTS (2026-09-13)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.64.0.

- `outcome-tracker.ts` writes a `signal_outcomes` row for each of 1h / 4h / 24h / 48h once a signal is that old. 48h stays in the list with the same thresholds and 24h price-distance guard. A 5-minute checkpoint was not added (price sync is 15 minutes).
- `GET /v1/accuracy` still aggregates only `checkpoint_hours = 48`. No `/accuracy` time-horizon selector.
- Unique key on `signal_outcomes` widened from `(signal_id, asset)` to `(signal_id, asset, checkpoint_hours)` so multiple horizons can coexist. Existing 48h rows were not rewritten.

## PHASE 30 — #143 MARKET IMPACT ASSESSMENT (2026-09-13)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.63.0.

- Relabels the event-detail / SignalQuickView "PROJECTED IMPACT" box to **MARKET IMPACT ASSESSMENT**. Not a new product surface.
- Named parts from #141/#142 fields: market mechanism, affected markets (CommodityChip, confidence-free since #140), direction, event category display names, reused `[Media-Impact]` tag. Empty mechanism + empty impacts → exact Caldara & Iacoviello (2022) fallback sentence. `is_preview` → `/calendar` note.
- Next.js BFF maps `eventCategory` / `marketMechanism` / `isPreview`; `/api/signals/:id` also returns `currencyPairImpacts`.

## PHASE 29 — #142 LIVE MEDIA-IMPACT WATCHLIST (2026-09-13)

> Narrative summary for this tree. Full technical detail: `docs/brain/14_CHANGELOG.md` v0.62.0.

- Replaces #141's temporary hardcoded 7-entry watchlist in `classifyEvent()` with `public.media_impact_watchlist` (public-read / service-role write, same RLS shape as `signal_outcomes`). Seeded with the 7 sourced communicators only — no Saylor, no Wood. Elon Musk markets omitted because BBR does not track BTC.
- New `signals.media_impact_entity` populated from a new `mediaImpactEntity` classify field (exact watchlist `entity_name`, or null). Backend caches the active list for 10 minutes.
- `apps/web` shows a distinct `[Media-Impact]` tag on dashboard cards / stream, quick-view, and the event detail page whenever the field is set, with the entity name and a short caveat. Copy describes a sourced historical reaction pattern — not a forecast, not a buy/sell.

## PHASE 28 — #141 MATERIALITY GATE: THE PIPELINE'S FIRST REAL "DOES THIS MEAN ANYTHING?" REJECT STEP (2026-09-13)

> Narrative summary for this tree. Full technical detail (prompt text, sanitization, per-call-site wiring, real verification output): `docs/brain/14_CHANGELOG.md` v0.61.0.

- **The problem, confirmed by direct DB audit (#139):** 63% of signals in a 14-day window sat at severity 1-4, many with empty commodity impacts and, per Claude's own summary, "no market impact" — because classification and materiality (should this even become a signal) were never separated. Once `classifyEvent()` returned anything, it became a `signals` row, full stop.
- **The fix:** a second, independent gate Claude (and the heuristic fallback) must clear after classifying — BBR's own materiality principle, inspired by (not literally applying) the reasonable-investor standard from US securities law. It asks: taking the story's own claims at face value, would a trader/import-export business/fund analyst actually change a decision because of this? It deliberately does NOT gate on whether the underlying claim is likely to be true — BBR assesses market impact of what's reported, fast, not outcome-prediction — but does gate hard on genuine novelty (new claim vs. a reminder of an already-known schedule) plus a real transmission mechanism (a stated market mechanism, a hit on a hardcoded 7-entity watchlist of market-moving figures/institutions, or a genuine armed-conflict/security event).
- **New `signals` columns:** `relevance`, `novelty` (0-1 floats), `event_category` (9-value enum), `market_mechanism` (plain-language string or null), `is_preview` (true only for a pure calendar-reminder with no new claim), `source_confirmation` (official/reported/speculative — sourcing *type*, not truth), `materiality_pass` (the actual gate — existing rows backfill true, does not retroactively hide anything already live), `materiality_reasoning`.
- **Enforced at all five live classify-then-insert call sites** (GNews, GDELT, RSS, ACLED, reconciliation collectors); a `materialityPass: false` result skips the `signals` insert entirely (the `raw_events` row is kept regardless, for dedup/audit) and logs the rejection to the existing `service_health_events` health log. The dormant `ai-classifier.ts` worker got a comment, not the gate, since nothing enqueues jobs onto it today.
- **Verified live against production, real numbers:** a routine-administrative junk story correctly failed the gate (`materialityPass: false`, specific reasoning naming the failed criterion); a pure "Fed meets next Wednesday" calendar-reminder story correctly scored `isPreview: true, novelty: 0, materialityPass: false`; a real Red Sea tanker-strike story correctly passed with a genuine, non-invented market mechanism and populated every new field. All three ran through the real Claude API (not the heuristic fallback) and were cleaned up after.
- **Known, documented v1 limitation:** novelty scoring uses a coarse "was a same country+event_type signal logged in the last 48h" hint, not real semantic/paraphrase duplicate detection — that's separate future work, not attempted here. The watchlist is a hardcoded array pending #142's live database table.

## PHASE 27 — #140 HIDE RAW CLASSIFIER CONFIDENCE ON COMMODITYCHIP (2026-09-13)

> Narrative summary for this tree. Per-commit evidence: `docs/brain/LIVE_TODO.md`. Technical record: `docs/brain/14_CHANGELOG.md` v0.60.0.

- `CommodityChip` visible text is ticker + direction arrow on `sm` and `md`.
- Classifier confidence stays on the API/prop and in an unambiguous screen-reader label; it is not shown as a percent next to the arrow.

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

> Narrative summary for this tree. Full technical record: `docs/brain/14_CHANGELOG.md` v0.36.0 / v0.36.1 / v0.36.2 / v0.36.3 and `docs/brain/LIVE_TODO.md` (#87). Cleared by ADR 013's forex-only softening — equity stays separately gated.

- **Phase 1 — schema + classifier + price sync (`a15e2fd`, backend-only).** New additive `signals.currency_pair_impacts jsonb` column (migration `20260909035949_forex_pair_impacts.sql`), mirroring `commodity_impacts`. `claude.service.ts` gained `ALLOWED_FOREX_PAIRS` (EURUSD|GBPUSD|USDJPY|USDCHF|USDRUB|USDCNY), a forex alias map, `normalizeForexPair()`, `sanitizeForexImpacts()`, and a `currencyPairImpacts` field in the Claude prompt / `ClassificationResult`. `EURUSD`/`USDRUB` were **removed** from `ALLOWED_COMMODITY_ASSETS` — they were never commodities; historical `commodity_impacts` rows were left as-is, not backfilled. Heuristic fallback covers USDRUB (Russia + sanctions) and USDCNY (China + tariff/Taiwan) only; the other four pairs are AI-only on that path. `price-syncer.ts` now also syncs 6 Yahoo `<PAIR>=X` forex tickers into the (misnamed) `commodity_prices` table.
- **Phase 1B — close the live-ingestion gap (`abb2004`, backend-only).** Phase 1 only wired the dormant `ai-classifier.ts`, so no production signal actually carried `currency_pair_impacts`. Added it to the three real signal-creation inserts — `signal-merge.ts` `insertOrMergeSignal()` (the live rss/gnews/gdelt path), `reconciliation.ts`, `acled-collector.ts`. ADR 010 merge semantics preserved: impacts are written once at row creation and never rewritten on a duplicate/escalation merge, exactly as `commodity_impacts` always has been.
- **Phase 2 — onboarding, feed filter, watchlist (`55df380`, `apps/web` + `packages/shared`).** Wires the until-now-unused `user_preferences.forex_pairs` column into the **existing** #81/#89 mechanisms — no second onboarding flow, no new feed-filter param, no separate watchlist toggle. New shared `FOREX_PAIRS` constant. `/onboarding` step 2 gained a "Currency pairs you follow" chip list using the same helpers as the commodities list. `/api/signals?personalized=true` now also matches each saved pair against `currency_pair_impacts`, folded into the same single `OR` filter, and returns `currencyPairImpacts` in the payload. `/watchlist` seeds its "My Commodities / Show All" default from `commodities ∪ forex_pairs` and lists all 13 assets; `/api/prices`' Redis-fallback symbol list was widened. **A latent bug was fixed in passing:** the onboarding `user_preferences` upsert lacked `onConflict: "user_id"` (the table's PK is `id`, with a separate UNIQUE on `user_id`), so for any user who already had a preferences row it 409'd and silently dropped every captured preference — commodities and regions included, not just the new forex field.
- **Verification (Playwright + SQL).** Phase 1: `information_schema`, a real Claude classification (USDRUB landed in `currency_pair_impacts`, not `commodity_impacts`), a forced heuristic run, a real price-sync run. Phase 1B: a real Russia-sanctions event through the live path stored a row matchable by the same jsonb-contains operator production commodity matching uses. Phase 2: real login → onboarding wrote `forex_pairs=["EURUSD","USDCHF"]`; a personalized feed with only those two prefs returned exactly the one signal carrying a matching `currency_pair_impacts` and turning personalization off restored the full feed; `/watchlist` showed both pairs with live prices and the "My Commodities" ⇄ "Show All" toggle round-tripped.
- **Phase 3 — alert rules, dispatcher, digest (`a102e68`, backend + web + one additive migration).** New additive `alert_rules.forex_pairs text[]` column (migration `20260909044602_alert_rules_forex_pairs.sql`), mirroring `alert_rules.commodities`; `min_severity`'s conservative default untouched. The alert dispatcher now matches a rule when its `forex_pairs` overlap a signal's `currency_pair_impacts`, OR'd with the existing commodity match; the Telegram/Slack/in-app "Which instruments" line lists forex pairs alongside commodities. The daily digest folds each followed pair into the same single containment `OR` against `currency_pair_impacts`, credits forex hits in the "matched" reason, and its copy now reads "regions, commodities, and forex pairs you follow". The create-rule modal (on `/alerts` and each event page) gained a 6-pair multi-select; rule cards show a "Forex:" line; the Alerts page renders currency-pair chips in "Which instruments". No `equity_tickers` — equity stays gated (ADR 013 / D17).
- **Phase 3 verification (real delivery + Playwright + SQL, per the alerts/digest standard).** A forex-only rule (no regions, no commodities, `forex_pairs=["EURUSD"]`) dispatched against a live EURUSD signal produced a real Telegram message whose "Which instruments" line showed `EURUSD ↓ · USDJPY ↑ · USDCHF ↑`, with the two pre-existing rules paused so the forex rule was provably the sole match. A forex-only digest preference selected exactly that signal and rendered "forex pairs" + "EURUSD" into both text and HTML. Playwright confirmed the Alerts card renders currency-pair chips and the new modal multi-select round-tripped `["EURUSD","USDJPY"]` through the DB.
- ~~**Known limitation carried forward:** the `/watchlist/[symbol]` drill-down still keys off `COMMODITIES`/`?commodity=` only, so a forex card links to a degraded drill-down.~~ **Closed in phase 4, below.**
- **Phase 4 — watchlist drill-down forex support (`accd468`, `apps/web` only, no migration).** Closes the phase-2/3 carried-forward limitation. `/watchlist/[symbol]/page.tsx` resolves the symbol against `COMMODITIES` then `FOREX_PAIRS` (so `EURUSD` renders "EUR/USD"), ORs `forexPairs` into the "You follow this" check, and — for a forex symbol — fetches correlated signals with a **new, separate** `?forexPair=` query param and reads `currencyPairImpacts` for the per-signal impact chip. `/api/signals` gained that `?forexPair=` param: a `currency_pair_impacts` jsonb-containment filter that exactly mirrors the existing `?commodity=` branch. `?commodity=` keeps its `commodity_impacts`-only meaning everywhere. No `ticker_impacts` — equity stays gated. Verified with Playwright + SQL: `/watchlist/EURUSD` shows "EUR/USD" and lists the real EURUSD signal with a currency-pair chip; `/watchlist/USOIL` behaves exactly as before; `?forexPair=EURUSD` returns the matching signal while `?forexPair=USOIL` returns none. Full technical record: `docs/brain/14_CHANGELOG.md` v0.36.4.

---

## PHASE 10 — DOCS SYNC: COWORK RESEARCH #104–#128, D19, CURSOR PRO SETUP (2026-09-11)

> Narrative summary for this tree. Full technical record: `docs/brain/14_CHANGELOG.md` v0.38.0 and `docs/brain/LIVE_TODO.md`. Docs-only; no application code.

- **D19 / ADR 015** — "Established research company" positioning: never state or imply how recently BBR's real data history began. Framing rule only; does not relax D16 or "build it before you claim it" (#128).
- **LIVE_TODO** — #104–#128 recorded as plans/research only. None marked done. #129 left unmarked until a follow-up Closed, verified line can carry this commit's SHA.
- **Cursor Pro setup** — repo-root `AGENTS.md` and `.cursor/mcp.json`. Live Supabase project ref confirmed as `evavcgfmemwryggdkjmx`.
- **Briefing** — standing decision #15 + matching "never do" line.

---

## PHASE 13 — STALE SUPABASE PROJECT-REF DOCS PURGE (2026-09-11)

> Docs-only; no application code. Technical record: `docs/brain/14_CHANGELOG.md` v0.45.0.

- Unused Supabase project-ref string removed from remaining markdown. Live ref is `evavcgfmemwryggdkjmx`. Archived `CLAUDE_CONTEXT.md` env URLs now match that live project. No code or config files contained the unused ref.

## PHASE 12 — 5-YEAR WATCHLIST CHART #106 (2026-09-11)

- **#106 (`this commit`).** Watchlist symbol drill-down adds a "5-year history" panel below the 90-day chart. Fastify `GET /v1/prices/history-5y/:symbol` calls yahoo-finance2 `chart()` (weekly, 5-year `period1`), cached 15 minutes in memory. Not stored, not scheduled; `price-syncer.ts` untouched. Per-commit evidence: `docs/brain/LIVE_TODO.md`. Technical record: `docs/brain/14_CHANGELOG.md` v0.44.0.

## PHASE 11 — TONIGHT'S SHIPPING BATCH #105–#127 (2026-09-11)

> Narrative summary for this tree. Per-commit evidence: `docs/brain/LIVE_TODO.md`. Technical record: `docs/brain/14_CHANGELOG.md` v0.39.0–v0.43.0. Do not treat PHASE 10's "none marked done" line as current — that was the plan-parking commit.

- **Map / watchlist / backtesting (`f6be851`, then `75d932c`).** #105 map click-modal (wrapping, scrollable React dialog). #107 watchlist first-visit seed of the 8 instruments, then prefs-aware seed + `user_preferences` persist. #108 Backtesting Lab auto-apply + loading state.
- **Auth timeout (`a561690`).** #116 — middleware `getUser()` timeout raised 3s→8s so Vercel no longer aborts a slow Auth call as "temporarily unavailable."
- **Feed filters (`74b815b`).** #124 shared FilterBar (commodity/region/min-severity/time range, incl. 30d) on feed and map. #125 Oil/Grain/Metals desk chips (feed-only, no new schema).
- **Tour + briefing copy.** #119 welcome GIF/video step before Joyride (placeholder asset; real recording still outstanding). #120 plain-language / 4-part / keep-hedging block on `generateAnalysis()` alongside the #103 buy/sell prohibition.
- **Quick-view.** #122 desktop slide-over on Intelligence Feed stream rows. #123 new-tab only on that panel's "View full details"; feed/map/Alerts stay same-tab.
- **Trust + calendar.** #126 `Fresh Xm` tag + live last-24h outlet coverage line. #127 importance/country/category/timezone filters on `/calendar`. Map chokepoint/pipeline layers still gated.

---

## PHASE 12 — #111 AI SIGNAL CHAT, BACKEND HALF (2026-09-11)

> Narrative summary for this tree. Per-commit evidence: `docs/brain/LIVE_TODO.md`. Technical record: `docs/brain/14_CHANGELOG.md` v0.46.0.

- **`apps/backend` only** — the frontend chat panel on the event page is a separate, still-open piece of #111.
- New `GET/POST /v1/signals/:id/chat` (`signal-chat.routes.ts`), registered in `app.ts` the same way as the other route plugins.
- New `ClaudeService.chatAboutSignal()` reuses the same `claude-sonnet-5` model and the same buy/sell/position-sizing/entry-exit prohibition wording as `generateAnalysis()` (#120), plus a chat-specific rule that recognizes and declines personalized position/portfolio-advice questions with a fixed redirect instead of attempting to answer.
- New `signal_chat_messages` table (migration `20260911180000_signal_chat_messages.sql`), same user-owns-their-rows RLS convention as `alert_rules`/`watchlist_entries`/`saved_signals`.
- POST gates on plan tier (`403 premium_required` below `pro`, passes for everyone today) and a custom 30-messages/24h per-user counter (`429 rate_limited`) — no rate-limit dependency added.
- Verified live on the standing test account against a real signal: an on-topic question returned a grounded answer citing that signal's actual severity/confidence figures; a personalized-position question ("I hold 200 barrels of WTI...") was declined with the exact specified redirect, not answered. Both turns confirmed written to `signal_chat_messages` via direct SQL, then removed (test data).

---

## PHASE 13 — #111 AI SIGNAL CHAT, FRONTEND HALF — FEATURE COMPLETE (2026-09-11)

> Narrative summary for this tree. Per-commit evidence: `docs/brain/LIVE_TODO.md`. Technical record: `docs/brain/14_CHANGELOG.md` v0.47.0.

- **`apps/web` only** — completes #111 (backend shipped in PHASE 12 above).
- New `SignalChatPanel` (`components/signals/SignalChatPanel.tsx`), file-location convention matched to `SignalQuickView.tsx` (#122). Wired into the event detail page directly below the existing Full Analyst Briefing / Impact Breakdown sections, which are untouched. Styling reuses the page's own CSS-variable tokens rather than inventing a new visual language; the loading spinner reuses the exact pattern already shipped for #108's Backtesting Lab.
- New same-origin proxy routes `app/api/signals/[id]/chat/route.ts` (GET+POST), following the exact auth-forwarding pattern already used by `api/telegram/connect-code/route.ts` — resolve the session server-side, forward the access token as a Bearer header to `apps/backend`, pass the backend's status/body straight through so `403 premium_required` / `429 rate_limited` reach the panel unchanged.
- Panel behavior: fetches history on mount with an explicit empty state, optimistic user-message append with rollback on send failure, plain-language copy for the 403/429 cases, and an always-visible (non-dismissible) disclaimer under the input.
- Playwright-verified end-to-end on the standing test account: empty state, a real grounded reply to an on-topic question, the disclaimer visible throughout, and the same conversation still present after a full page reload (proves it reads from the backend, not local state).
- Also uncovered and worked around an unrelated Next.js 16 Turbopack dev-mode bug during verification: the dev server would not hydrate at all when reached via `127.0.0.1` (Chromium's Origin header on the HMR WebSocket gets treated as cross-origin, stalling the React debug channel). Using `localhost` instead resolves it for local Playwright runs; no application code was changed for this.

---

## PHASE 14 — #53 COMMODITY_IMPACTS HISTORICAL BACKFILL (2026-09-11)

> Narrative summary for this tree. Per-commit evidence: `docs/brain/LIVE_TODO.md`. Technical record: `docs/brain/14_CHANGELOG.md` v0.48.0. The production UPDATE already ran; this commit ships the one-time script for reproducibility.

- One-time `apps/backend/src/scripts/backfill-commodity-impacts.ts` (not a cron) reuses `ClaudeService.classifyEvent()` (Haiku) and writes only `commodity_impacts`.
- Before: 767 filled / 2,057 empty. After: 1,634 filled / 1,195 empty. 201 remaining because Anthropic credit exhausted mid-run (not written; re-run after credit restore).

## PHASE 15 — #121 BACKEND HALF: SIGNAL_OUTCOMES + OUTCOME-TRACKER WORKER (2026-09-11)

> Narrative summary for this tree. Per-commit evidence: `docs/brain/LIVE_TODO.md`. Technical record: `docs/brain/14_CHANGELOG.md` v0.49.0.

- New table `signal_outcomes` (migration `20260911190000_signal_outcomes.sql`) + daily worker `apps/backend/src/workers/outcome-tracker.ts` (cron `0 5 * * *`) permanently record predicted-vs-actual commodity direction 48h after each signal's `event_date`, so a future `/accuracy` page reads stored results instead of live-recomputing against the 90-day-retained `commodity_prices` table. Public read, service-role write only.
- Backfilled to 2,965 rows against production (1,586 signals, 298 pairs skipped for missing price data, 0 errors).
- Caught and fixed a real bug before committing: legacy pre-#87 `EURUSD`/`USDRUB` `commodity_impacts` entries have no forex price history before 2026-09-09, so an unbounded closest-price search was clamping to a distant point and fabricating false "flat" outcomes (349 of a first-pass 3,263 rows). Fixed with a 24h max-distance guard; data wiped and re-run clean.
- Frontend `/accuracy` page itself is still open — not part of this half.

## PHASE 16 — #121 FRONTEND HALF: GET /V1/ACCURACY + PUBLIC /ACCURACY PAGE (2026-09-11)

> Narrative summary for this tree. Per-commit evidence: `docs/brain/LIVE_TODO.md`. Technical record: `docs/brain/14_CHANGELOG.md` v0.50.0.

- New public (no-auth) `GET /v1/accuracy` aggregates `signal_outcomes` (never live-recomputes) into overall + per-asset hit rate, avg move when correct, and sample size, always returned together; per-asset rows below 20 scored predictions ("not enough history yet") instead of a misleading percentage. A separate `volatile_neutral_summary` reports how often volatile/neutral calls saw a real (≥2%) move, kept fully apart from hit rate.
- New public `/accuracy` page — no login required, matches the existing `/status`-style dark terminal aesthetic — renders all of the above together plus a permanent, non-dismissible past-performance disclaimer and the plain-language date range. Deliberately has no "top signals"/"best calls" highlight list anywhere, per a hard product rule.
- Found and fixed a real latent bug while verifying: Supabase `.in()` filters with real UUIDs throw past ~400 items (a URL-length limit, not flakiness) — this had also silently broken part of last session's `outcome-tracker.ts` backfill. Both now chunk at 200.
- Verified against production: overall and per-asset (USOIL) numbers hand-checked against direct SQL and matched exactly; real rendered page screenshotted with real, non-placeholder numbers.

## PHASE 17 — CLASSIFICATION TRUST/RELIABILITY FIXES (2026-09-12)

> Narrative summary for this tree. Per-commit evidence: `docs/brain/LIVE_TODO.md`. Technical record: `docs/brain/14_CHANGELOG.md` v0.51.0. Decision record: `10_DECISIONS.md` ADR 016 / D20.

- Direct production investigation found `ClaudeService.heuristicClassify()` assigning severity 8/9 on bare keyword matches with no relevance judgment. Two confirmed real false positives (both confidence 0.76, matching only the heuristic formula's output set): an Oregon military-radar-site permitting story scored 8 on "military"; a personal Navy memoir scored 9 on "war".
- Heuristic severity now hard-capped at 6 — severity 7/8/9 can only come from a real, successful Claude classification going forward.
- New `signals.classification_method` column (`claude`|`heuristic`) set by `classifyEvent()` at write time, written by every live signal-creation path, and surfaced in the signals API responses. Historical rows best-effort backfilled via a separate `classification_method_inferred` flag (confidence-pattern match, not an authoritative reclassification): 1,722 marked `heuristic`, 1,124 left unknown.
- `isRelevantEvent()` pre-filter investigated and confirmed to run uniformly before `classifyEvent()` regardless of which path classifies the event — not implicated in this bug, no change made.
- Claude/Anthropic API calls now logged to `service_health_events` — previously only ingestion sources had health tracking.
- `POST /v1/signals/:id/chat` now wraps `chatAboutSignal()` in try/catch, returning `503 ai_temporarily_unavailable` instead of a generic 500 on an unexpected error.

## PHASE 18 — SIGNALCHATPANEL VISUAL PASS + HEURISTIC FLAG + 503 COPY (2026-09-12)

> Narrative summary for this tree. Per-commit evidence: `docs/brain/LIVE_TODO.md`. Technical record: `docs/brain/14_CHANGELOG.md` v0.52.0.

- Visual/layout pass on `SignalChatPanel` after Prompt O's `classification_method` column and `503 ai_temporarily_unavailable` shipped. Same component, same backend contract.
- Step 0 real screenshots (1440 / 768 / 390) found dead Tailwind tokens, 9–10px type, a truncated tablet composer, and 503 falling through to a generic error. 390px remaining crush is the dashboard's fixed 256px sidebar, not changed this pass.
- Heuristic signals now show "This signal was auto-classified — Claude analysis is temporarily unavailable." 503 renders "BBR's AI service is temporarily unavailable — try again shortly."

## PHASE 19 — #111 AI USAGE GOVERNANCE + CITED CHAT (2026-09-12)

> Narrative summary for this tree. Per-commit evidence: `docs/brain/LIVE_TODO.md`. Technical record: `docs/brain/14_CHANGELOG.md` v0.53.0. Decision: D23 / ADR 019.

- Two independent UTC-day Anthropic ceilings (ingestion vs chat). Chat gated by `CHAT_ALLOWED_EMAILS` (fail closed). Daily 30-msg cap fails closed; 5/5min burst. Cheap relevance pre-check before Sonnet. Cited replies may only use handed source URLs. Mocked tests only — no live Anthropic calls.

## PHASE 20 — #111 CHAT QUALITY FIXES: MID-SENTENCE CUTOFF + MARKDOWN RENDERING (2026-09-12)

> Narrative summary for this tree. Per-commit evidence: `docs/brain/LIVE_TODO.md`. Technical record: `docs/brain/14_CHANGELOG.md` v0.54.0.

- Live testing after #134's governance audit found two quality bugs: replies could cut off mid-sentence, and markdown wasn't rendered. `max_tokens` stays 600.
- `chatAboutSignal()` trims a reply back to its last complete sentence only when Anthropic reports `stop_reason === "max_tokens"`. System prompt adds a ~180-word length instruction and a markdown-formatting instruction, and strengthens (does not replace) the sources-section instruction to fire reliably. #134's budget breakers, allowlist, relevance check, burst limiter, and `sanitizeCitedChatReply()` untouched.
- `SignalChatPanel` now renders the assistant answer text through `react-markdown`, restricted to paragraphs/emphasis/lists — no links or images, so the real Sources list stays the only clickable-link surface.

## PHASE 26 — #138 FULLY CLOSED: VOICE GUIDE + REMAINING LEAKS (2026-09-13)

> Narrative summary for this tree. Per-commit evidence: `docs/brain/LIVE_TODO.md`. Technical record: `docs/brain/14_CHANGELOG.md` v0.59.1. Standing rule: D24 / ADR 020.

- Empty/error copy must be a fixed honest sentence; never interpolate provider strings.
- Next.js BFF `apiErrorLogged()` logs the raw detail and returns a generic `message`.
- Settings, auth env-leak, confirm bridge, feed `fallbackReason`, mutation toasts, admin service-status.

## PHASE 25 — #138 PHASE 2 ERROR-COPY INTEGRITY (2026-09-13)

> Narrative summary for this tree. Per-commit evidence: `docs/brain/LIVE_TODO.md`. Technical record: `docs/brain/14_CHANGELOG.md` v0.59.0.

- Missing-client toasts on alerts / event-detail / DiscordConnect use honest account-connect copy; technical `"Supabase client not available"` is `console.error` only.
- Ingestion degraded banner no longer interpolates the internal Upstash `reason`. Accuracy/metrics pages no longer interpolate `{error.message}`.
- Middleware "Authentication is temporarily unavailable" left as-is (fires only on the 8s `getUser()` timeout). TelegramConnect / CommandPalette load errors stay query-internal.

## PHASE 24 — #137 EVENT-PAGE TRUST/UX COPY (2026-09-13)

> Narrative summary for this tree. Per-commit evidence: `docs/brain/LIVE_TODO.md`. Technical record: `docs/brain/14_CHANGELOG.md` v0.58.0.

- Chat history load uses typed `HistoryErrorCode` copy (401 / early-access / server / network) instead of one "please reload" sentence.
- PROJECTED IMPACT no longer shows "(+0.0%)" on a flat live refresh; "CREATE SEVERE ALERT" is gated on severity ≥7.
- ANALYSIS-tab "Confirmed by N source(s)" box removed. Full-briefing empty state is severity-gated, not "restoring capacity."

## PHASE 23 — #53 COMMODITY_IMPACTS REMAINDER BACKFILL COMPLETE (2026-09-12)

> Narrative summary for this tree. Per-commit evidence: `docs/brain/LIVE_TODO.md`. Technical record: `docs/brain/14_CHANGELOG.md` v0.57.0.

- Historical `commodity_impacts` backfill finished. Final: 2,891 signals, 1,678 filled / 1,213 Haiku-classified empty. No application code changed.

## PHASE 22 — DISCORD ALERT CHANNEL (2026-09-12)

> Narrative summary for this tree. Per-commit evidence: `docs/brain/LIVE_TODO.md`. Technical record: `docs/brain/14_CHANGELOG.md` v0.56.0.

- Discord is a webhook-URL paste, not a bot. `user_channels` gains `discord_webhook_url` + `discord_connected_at`; existing `user_channels_all_own` covers them. Dispatcher POSTs `{ content }` (2000-char cap) on `channel === "discord"`.
- Settings NOTIFICATIONS: `<DiscordConnect />` (Save / Test / Disconnect) immediately after Telegram. Test goes through authenticated `POST /api/discord/test`.
- `/alerts` create-rule modal now has Telegram / Discord / Slack checkboxes, defaulting to connected channels.

## PHASE 21 — #133 MOBILE DASHBOARD SHELL + #112 TELEGRAM CONNECT UX (2026-09-12)

> Narrative summary for this tree. Per-commit evidence: `docs/brain/LIVE_TODO.md`. Technical record: `docs/brain/14_CHANGELOG.md` v0.55.0.

- Dashboard shell at 390px is no longer crushed by a hardcoded 256px sidebar. Below `md` the sidebar is an off-canvas drawer (hamburger in TopBar, backdrop dismiss). At `md`+ the 256px push is unchanged.
- Telegram connect UX: header `forum` icon + contextual prompt after 3 signal-detail views. Dismissed state is `profiles.notification_prompt_dismissed_at` (server-side). Existing Settings `<TelegramConnect />` stays the manage/disconnect home. Discord not built.
