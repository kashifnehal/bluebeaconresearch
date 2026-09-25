# 06_COMPONENTS.md — React & React Native Component Inventory

> **📍 Doc status — current as of 2026-09-20** for CommandPalette (header-unified + last-resort fallback), Help, MARKET IMPACT ASSESSMENT, landing copy. `claude/23_TODO.md` is not in this repo.

This document presents a complete inventory of all UI components in `apps/web/components` and `apps/mobile/components`, detailing component props, parent/child relationships, hooks, internal state, dependencies, and styling rules.

---

## 1. Top-Level Gate & Brand Components

### 1.1 `AccessLimitedModal.tsx`
- **Purpose**: Displays gated waitlist email capture modal when `isProjectReady` feature flag is false.
- **Props**: `{ isOpen: boolean; onClose?: () => void }`
- **Parent**: `AccessLimitedModalWrapper.tsx` or Root Layout.
- **Children**: `Dialog`, `Input`, `Button`.
- **Hooks Used**: `useState` (email input state, loading, success state).
- **Dependencies**: Lucide Icons (`Lock`, `CheckCircle2`, `Mail`), `sonner` toast.
- **Styling**: Dark glassmorphic modal with glowing blue border accent (`border-blue-500/30 bg-neutral-900/95`).

### 1.2 `Logo.tsx`
- **Purpose**: Renders the Blue Beacon Research brand identity icon and typography.
- **Props**: `{ className?: string; showText?: boolean }`
- **Parent**: `Sidebar.tsx`, `TopBar.tsx`, Landing Page header.
- **Styling**: Lucide `Shield` icon with cyan/blue gradient fill and crisp uppercase tracking.

---

## 2. Layout Components (`apps/web/components/layout`)

### `PublicHeader.tsx` — added 2026-09-23 (#186 Phase 2)

Server component. Props: `{ badge: string }`. Renders the logged-out public-page chrome (logo → wordmark → badge on the left, "Terminal →" link on the right) used by `app/accuracy/page.tsx` and `app/status/page.tsx`. Both files previously inlined an identical `h-16 … px-8 flex items-center justify-between` header; extraction removed the duplication and their now-orphaned `Link` / `Logo` imports.

Mobile-critical classes: `px-4 md:px-8` · `min-w-0` on the left group · `truncate` on the wordmark `<Link>` · `shrink-0` on `Logo` and the Terminal link · `hidden md:inline` on the badge span · `min-h-[44px] md:min-h-0` on the Terminal link. Measured 360px overflow before/after: `/accuracy` 111px → 0px, `/status` 117px → 0px.



### `MobileTabBar.tsx` — added 2026-09-23 (#186 Phase 3)

Client component, no props. `fixed bottom-0 left-0 right-0 z-40 md:hidden` — mounted once from `(dashboard)/layout.tsx` alongside `Sidebar`/`TopBar`. Five slots: FEED `/dashboard`, MAP `/map`, ALERTS `/alerts` (badge from `useUIStore.unreadCount`, same source `Sidebar` uses), WATCHLIST `/watchlist`, and a MORE button that calls `useUIStore.setMobileSidebarOpen(true)` — opens `Sidebar`'s existing off-canvas drawer rather than a second nav surface, so CALENDAR/BACKTESTING/SETTINGS/Help/Logout stay reachable without duplicating them. Active-route highlighting: `pathname === item.href || pathname.startsWith(`${item.href}/`)`, same pattern `Sidebar.tsx`'s `NAV.map` uses. Icon names (`rss_feed`/`public`/`notifications_active`/`visibility`) are copied verbatim from `Sidebar.tsx`'s `NAV` array so desktop and mobile iconography never drift independently. `<main>` in `(dashboard)/layout.tsx` gained `pb-[60px] md:pb-0` so page content clears the fixed bar's height. `TopBar.tsx`'s mobile hamburger (`md:hidden`, opened the same drawer) was deleted in the same change as now-redundant.

### 2.1 `Sidebar.tsx`
- **Purpose**: Primary vertical terminal navigation sidebar. Below `md` it is an off-canvas drawer (`useUIStore.mobileSidebarOpen`); at `md`+ always visible (#133). Brand text "Blue Beacon Research" is a `<Link href="/dashboard">` (2026-09-18). **The `ALPHA` badge next to the brand text was removed 2026-09-23 (#186 Phase 5, D29)** — did not reflect current product status. Footer Help goes to `/help` (#155), not the HelpModal. **2026-09-24 (#186 button/link parity audit):** footer gained a `md:hidden` "Replay Tour" button between Help and Logout — `TopBar.tsx`'s "Help & Guidance" icon (which opens `HelpModal`'s replay-tour action) is desktop-only, so mobile had no way to manually restart the guided tour after first completion. Calls the same `useUIStore.startTour()` + navigate-to-`/dashboard` logic as `HelpModal.tsx`'s `handleReplayTour`.
- **Props**: None.
- **Parent**: `(dashboard)/layout.tsx`
- **Children**: `Logo`, Lucide Nav Icons (`LayoutDashboard`, `Globe`, `Bell`, `BarChart3`, `Eye`, `Settings`).
- **Hooks Used**: `usePathname()` from Next.js navigation.
- **Styling**: `w-64 border-r border-neutral-800 bg-neutral-950/80 flex flex-col`.

### 1.3 `DiscordConnect.tsx`
- **Purpose**: Settings NOTIFICATIONS block for pasting a Discord incoming-webhook URL (Save / Test / Disconnect). No bot or OAuth.
- **Parent**: `(dashboard)/settings/page.tsx`, after `<TelegramConnect />`.
- **How**: browser-client upsert to `user_channels`; Test calls `POST /api/discord/test`. Linked badge matches `TelegramConnect`. Missing-client / save toasts use honest copy; no PostgREST interpolation (#138).
- **Related**: `/alerts` create-rule modal now has Telegram / Discord / Slack checkboxes, defaulting to connected channels.

### 2.2 `TopBar.tsx`
- **Purpose**: Header bar featuring a mobile hamburger (#133), search **button** (opens CommandPalette; 2026-09-20), Telegram-connect `forum` icon (#112), notification bell, help, and user auth dropdown. `left-0` below `md`, `md:left-[256px]` at desktop.
- **Props**: None.
- **Parent**: `(dashboard)/layout.tsx`
- **Children**: `PriceTicker`, `DropdownMenu`, `Avatar`.
- **Hooks Used**: `useMe()`, `useAuthStore()`.
- **Styling**: `h-14 border-b border-neutral-800 bg-neutral-950/60 backdrop-blur-md flex items-center justify-between px-4`.
- **Search (2026-09-20)**: button styled as the old bar, `aria-label="Open search"`, `setCommandPaletteOpen(true)`. No `searchQuery` / `searchSubmitted`.

### 2.2b `CommandPalette.tsx`
- **Purpose**: Global Cmd+K / Ctrl+K **and header-search** over Pages, Signals, Watchlist commodities, and Alert Rules (client-side + debounced `/api/signals`). `open` is `useUIStore.commandPaletteOpen`.
- **Parent**: `TopBar.tsx`.
- **Fuzzy keyword matching (2026-09-20)**: Pages / Watchlist commodities / Alert Rules now match via Fuse.js (`fuse.js@7`, threshold 0.3, extended-search) against label+keywords, not `.includes()` substring — logic lives in `lib/command-palette-search.ts` (unit-tested there, not inline) so e.g. "charts" finds Watchlist and "what are the commodity news" finds the Intelligence Feed. 8 `STATIC_PAGES` entries now (added Economic Calendar, previously missing from this list though already in the backend's AI-assist catalog). Keywords expanded the same day (oil price, world map, …). Signals search unchanged (still hits `/api/signals`) except its `sort` param moved from `severity` to `relevance` (recency+severity blend — see `05_API.md`) — command-palette search only, not the Intelligence Feed page's default.
- **Assist fallback (2026-09-19)**: when that search settles with fewer than 2 hits, POST `/api/search/assist` (debounced, not per keystroke). A separate **Suggested** group shows the one-line Haiku answer + page link. Never mixed into Pages/Signals. FAQ copy indexed as of #155.
- **Last-resort fallback (2026-09-20)**: if every source is empty after settle and assist is off or not `ok`, one static **"Not sure? Try"** item → `/dashboard`. No extra network call.

### 2.3 `PriceTicker.tsx`
- **Purpose**: Scrolling real-time 24h ticker bar displaying physical commodity prices (`USOIL`, `GOLD`, `NG`, `COPPER`).
- **Props**: None.
- **Parent**: `TopBar.tsx`
- **Hooks Used**: `useQuery` fetching `/api/prices` every 15 seconds.
- **Styling**: Monospaced font display (`font-mono text-xs`), green/red color deltas (`text-emerald-400` / `text-rose-400`).

### 2.4 `FeedbackForm.tsx` (#155)
- **Purpose**: Help-page bug/feedback form (message, optional email, read-only page context). POST `/api/feedback`. Not live chat.
- **Parent**: `(dashboard)/help/page.tsx`

---

## 3. Tactical Intelligence Components (`apps/web/components/signals`)

### 3.1 `SignalCard.tsx`
- **Purpose**: Main card rendering a single intelligence signal event with expandable AI summary.
- **Props**: `{ signal: Signal; onSelect?: () => void }`
- **Parent**: `(dashboard)/dashboard/page.tsx`
- **Children**: `SeverityBadge`, `CommodityChip`, `Button`, `MediaImpactTag` (#142).
- **Hooks Used**: `useState` for expand/collapse toggle.
- **Styling**: `p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:border-neutral-700 transition-all`.
- **#142**: `[Media-Impact]` when `mediaImpactEntity` is set. The live Intelligence Feed cards are inline in `dashboard/page.tsx` and render the same tag there.
- **`SignalRowPriceChip` (2026-09-25, `a8bace3`):** small local component (inline in `dashboard/page.tsx`, not `SignalCard.tsx` itself — the dashboard's Recent Signal Stream rows are hand-rolled JSX, not `SignalCard`) added after `MediaImpactTag` in each row's metadata line. Shows the 24h price move (`ASSET +N.N%`) for the row's primary asset (`commodityImpacts[0]` else `currencyPairImpacts[0]`), or a plain "—" when no asset can be matched — never a blank gap. Reuses the existing `/api/prices` `change_pct_24h`/`changePct24h` lookup (same `useQuery(["prices"])` pattern as `PriceTicker.tsx` and the watchlist pages) rather than adding a new price-lookup implementation; no new backend endpoint. Sits in the row's wrapping metadata `<div>`, not the headline row, so it can't affect the 2-line headline clamp at 375px.

### 3.1b `MediaImpactTag.tsx` (#142)
- **Purpose**: Distinct `[Media-Impact]` badge for a sourced watchlist communicator. Hover (card) or inline (event detail) shows entity + short caveat. Historical pattern only — not a forecast / not a buy/sell.
- **Props**: `{ entity?: string | null; caveat?: string | null; expanded?: boolean }`
- **Parents**: `SignalCard`, dashboard featured/secondary/stream, `SignalQuickView`, `events/[id]`.

### 3.2 `SeverityBadge.tsx`
- **Purpose**: Color-coded numerical badge indicator for conflict severity (1–10).
- **Props**: `{ severity: number }`
- **Styling Rules**:
  - Severity 1–4: Low (`bg-slate-800 text-slate-300 border-slate-700`)
  - Severity 5–6: Medium (`bg-amber-950 text-amber-400 border-amber-800`)
  - Severity 7–8: High (`bg-orange-950 text-orange-400 border-orange-800`)
  - Severity 9–10: Critical (`bg-rose-950 text-rose-400 border-rose-800 animate-pulse`)

### 3.3 `CommodityChip.tsx`
- **Purpose**: Small pill tag indicating affected physical commodity asset and market impact direction.
- **Props**: `{ asset: string; direction: Direction; confidence: number; size?: 'sm' | 'md'; label?: string }`
- **Styling**: Pill tag with directional arrow. Both sizes show ticker + arrow only (#140). Classifier `confidence` stays on the prop for gating / `aria-label` ("model classification confidence {n}%"); it is not visible text and is not a price-direction probability. **#202 (2026-09-25):** optional `label` prop renders a small uppercase caption above the pill (used as "Predicted" in `MarketImpactAssessment`'s Affected market(s) section, so the static classification-time chip reads distinctly from the live "Since signal" price-move sentence beside it) — omitted everywhere else, no visual change to alerts/watchlist/historical-tab usages.

### 3.3b `MarketImpactAssessment.tsx` (#143; #143 leftover 2026-09-20; #202 label 2026-09-25)
- **Purpose**: The event-detail / quick-view impact box, relabeled **MARKET IMPACT ASSESSMENT** (was PROJECTED IMPACT). Named parts from #141/#142 columns: source confirmation + novelty (2026-09-20; hidden when null), market mechanism, affected markets (CommodityChip, confidence-free since #140), direction, event category, reused `MediaImpactTag`. Empty mechanism + empty impact lists → exact Caldara & Iacoviello 2022 fallback sentence (no live GPR number). `is_preview` → calendar note + `/calendar` link. **#202:** the `CommodityChip` in Affected market(s) now passes `label="Predicted"`, and the `formatPriceSinceFiredSubtext` line right below it got a prefixed "Since signal:" caption — the two numbers can legitimately disagree (that's the point of tracking accuracy) and previously had nothing distinguishing which was the static prediction vs. the live measured move. Underlying values/logic untouched.
- **Parents**: `events/[id]/page.tsx`, `SignalQuickView.tsx`.

### 3.3c `AlertRuleTrendChart.tsx` (apps/web/components/alerts/AlertRuleTrendChart.tsx, new 2026-09-25, `f019cb9`)
- **Purpose**: 14-day real per-day match-count trend rendered under each rule's name on `/alerts`. `AlertRuleTrendChart` (Recharts `BarChart`, one bar/day + a "N matches this week" summary from the last 7 of the 14 days) and `AlertRuleTrendEmptyState` ("Not enough history yet", used when a rule fails the sparse-history gate).
- **Data**: `GET /api/alerts/rule-stats` (see `05_API.md`) — two column-only `alerts_sent` queries deduped by `signal_id` per rule/day, not the page's own full match-history fetch, which is capped at 100 rows across all rules and would undercount older/quieter rules.
- **Gate**: exported `isTrendSparse(totalMatches, ruleCreatedAt)` — true (renders the empty state instead of the chart) when `totalMatches < 3` or the rule is `< 7` days old. Both are fixed v1 constants (`MIN_MATCHES_FOR_TREND`, `MIN_RULE_AGE_DAYS`), not user-configurable.
- **Mobile**: keeps the bar shape + summary number at all widths; only the tooltip's per-day date label is desktop-only (hover/tap), per the mobile-verification bar that a fix/feature can't just look right at desktop width.
- **Parent**: `(dashboard)/alerts/page.tsx`, one instance per rule card, keyed off `ruleStatsById` (a `Map` built from the query result, looked up by `rule.id`).

### 3.4 `SignalQuickView.tsx` (#122)
- **Purpose**: Desktop-only right-half slide-over preview of a feed row.
- **Parent**: Intelligence Feed stream.
- **#123** (2026-09-11): "View full details" is `<a target="_blank" rel="noopener noreferrer">`. Remainder 2026-09-19: the same new-tab pattern is now on every other event-detail click (feed / map popup / watchlist / alerts / notifications / command palette / event Historical tab). ProductTour handoff stays same-tab.
- **#137**: empty analyst-briefing copy is severity-gated (`emptyBriefingCopy(..., "compact")`), not "restoring capacity."
- **#143**: "Commodity impacts" section replaced by `MarketImpactAssessment`.
- **2026-09-20**: header no longer shows a raw `{n}% confidence` badge (#140 leftover). Source confirmation, when present on the Signal, is already in `MarketImpactAssessment` below.

### 3.5 `SignalChatPanel.tsx` (#111, `9f2aada`; visual pass 2026-09-12)
- **Purpose**: Follow-up questions about **this** signal only, on the event detail page.
- **Props**: `{ signalId: string, classificationMethod?: 'claude' | 'heuristic' | null }`
- **Parent**: `(dashboard)/events/[id]/page.tsx` — mounted below Full Analyst Briefing / Impact Breakdown (those sections untouched).
- **How**: GET `/api/signals/:id/chat` on mount; POST on send with optimistic user bubble + rollback on failure. Loading spinner reuses #108's `progress_activity` + `animate-spin`. Always-visible disclaimer in a footer strip (not a tooltip). History-load failures use `HistoryErrorCode` / `HISTORY_ERROR_COPY` (401 / early-access / 5xx / network). `403 chat_early_access_only` replaces the composer with an embedded `AccessLimitedModal`. Copy also covers `premium_required` / `rate_limited` / `rate_limited_burst` / budget-reached vs generic 503. Assistant "Sources" from `---SOURCES---`. Heuristic note when `classificationMethod === 'heuristic'`. Composer stacks below a 420px container width. Working stitch tokens (`text-on-surface`, `text-on-surface-variant`) — `text-text-secondary`/`text-muted`/`text-bg-app` do not map.
- **2026-09-12 quality fix**: `CitedAssistantReply`'s answer text now renders via `react-markdown` (`allowedElements={["p","strong","em","ul","ol","li"]}`, mirrors `events/[id]/page.tsx`) instead of a plain `<div>` — `a`/`img` excluded on purpose, so a model-written markdown link can't become clickable outside the real Sources list.
- **Why**: explain the briefing, never buy/sell or personalized-position advice. Grounded generation of the URL-identified signal — not RAG (D21 / ADR 017; same #103 rule as the briefing). History is server-backed (`signal_chat_messages`); a page reload must restore the conversation.

### 3.5b Landing page (`apps/web/app/page.tsx`) (2026-09-20)

- Inline public homepage (no `components/landing/` split). `getLatestSignal()` + `getHomepageStats()` (`signals` exact count via `select("id", { count: "exact" })` — no `head: true`; RLS is authenticated-only, so reads go through `getRouteSupabaseClients()`).
- Copy integrity: fabricated 42ms / 100% Verified / 40yr / Encrypted Support / sub-second lines removed; research-register CTAs.
- Links to `/accuracy` without displaying a hit-rate percentage.
- Hero `<p>` (#174): "Blue Beacon Research — Geopolitical Intelligence for Commodity Traders". Headline unchanged.

### 3.5c Map page Tension Index tooltip (`app/(dashboard)/map/page.tsx`) (#175)

- Inline in the filters panel, not a separate component. Click the "i" to pin `tensionInfoOpen`; `mousedown` outside the button+tooltip closes it (TopBar dropdown pattern). CSS `group-hover` preview unchanged. Tooltip copy stays the existing methodology sentence — no formula.

### 3.5e `MobileTensionSheet.tsx` (new, #186 Phase 4, 2026-09-23)

`md:hidden` bottom sheet on `/map`. Owns zero data or business logic — every prop (`tensionMetrics`, `tensionHistory`, `liveItems`, `selectedSignalId`, `onSelectSignal`, pagination callbacks) is passed straight through from `map/page.tsx`'s existing state, the same state the desktop panels already read. Two purely presentational local booleans added to `MapPage` for this: `mobileSheetExpanded` (peek vs. expanded) and `mobileFiltersOpen` (a separate `md:hidden` modal wrapping the same `<FilterBar>` desktop uses). Desktop panels (`filtersCollapsed`/`streamCollapsed` sections) gained `hidden md:block` / `hidden md:flex` so they never mount below `md` — previously unconditional at every viewport, which is why two `w-80` panels used to occlude the entire map on a phone (0% of the map was visible). New `NavigationControl` (+/- zoom) added to the map's `initMap` effect, mobile-only via a `globals.css` rule scoped to `.map-page-root .maplibregl-ctrl-bottom-right` — desktop keeps only its pre-existing `AttributionControl`.

**2026-09-24 (#186 button/link parity audit):** gained a local `tensionInfoOpen` `useState` + an ⓘ "About the Global Tension Index" tap-to-toggle button/tooltip above the breakdown bars, mirroring `map/page.tsx`'s desktop panel (`tensionInfoOpen` state there, same copy) — desktop had this explainer, mobile didn't. Both instances share the identical `aria-label`, so any DOM query for it must disambiguate by visibility (`offsetParent !== null`), not just the selector, or it'll match the hidden desktop one first.

### 3.5d `MapSignalPopup.tsx` (#179, mobile fix #186 Phase 4)

- Header badge is `sourceConfirmationLabel` (Official statement / Reported claim / Speculative / unconfirmed), hidden when `sourceConfirmation` is null. Raw `{n}% confidence` removed. Depends on #178 list-endpoint mapping.
- **Pre-existing mobile bug fixed 2026-09-23:** the popup and its backdrop used `offsetLeft` (a desktop-only value depending on whether the left filters panel is collapsed) as an unconditional inline `left` style at every breakpoint. Below ~416px viewport width the width formula `min(22rem, calc(100vw-26rem))` evaluates negative, making the popup invisible/off-screen — tapping any map marker on a phone did nothing useful. Fixed with a CSS custom property (`--popup-offset`, set once via `style`) referenced only inside `md:`-scoped Tailwind arbitrary values, so `offsetLeft` still drives desktop positioning exactly as before (verified: 1440px click landed the popup at the same container-relative `24rem + 1rem` offset, `position:absolute`, width `22rem`) while mobile gets plain `left-4 right-4` / `fixed` positioning instead. No prop or logic change — `offsetLeft`'s value and meaning are untouched.

### 3.5f MapPage recenter control (`app/(dashboard)/map/page.tsx`) (2026-09-25, `a8bace3`)
- New `RecenterControl` class implementing MapLibre's `IControl` interface (local to `map/page.tsx`, not a separate file) — MapLibre ships `NavigationControl` for zoom but no built-in reset-view control. `map.addControl(new RecenterControl(), "bottom-right")` right after the existing `NavigationControl`, so it renders directly above/beside the zoom buttons. Click handler calls `map.easeTo({ center: DEFAULT_MAP_CENTER, zoom: DEFAULT_MAP_ZOOM })` — the same camera method (and the same default-view constants from `lib/map-config.ts`) already used elsewhere on this page, not hand-rolled camera math.
- **Not breakpoint-gated, unlike zoom:** `globals.css`'s `.map-page-root .maplibregl-ctrl-bottom-right` desktop-hide rule (added for the mobile-only zoom buttons, §3.5e) previously hid the *entire* bottom-right control corner above `md`. Narrowed to target only the zoom `NavigationControl`'s own group (`> .maplibregl-ctrl-group:not(.map-recenter-ctrl)`) so the new recenter control — tagged with a `.map-recenter-ctrl` class on its container — stays visible on both mobile and desktop.
- **Verified:** Playwright at both 375px and 1440px — panned/zoomed the map, clicked recenter, confirmed (via before/after canvas screenshots) it returns to the exact default view at both widths; confirmed the control isn't obscured by the desktop intelligence-stream panel (`elementFromPoint` check). Required one dev-server restart with `.next` cache cleared — the CSS change wasn't picked up by Turbopack's HMR/persistent cache otherwise.

### 3.6 `app/accuracy/page.tsx` (#121, 2026-09-11)
- **Purpose**: public (no auth) track-record page — reads `GET /v1/accuracy`, never recomputes live.
- **How**: server component, direct server-side fetch (same pattern as `admin/metrics/page.tsx`, no client proxy route needed); dark-terminal styling matches `/status`.
- **Shows**: overall hit rate + avg move + sample size always together; a separate volatile/neutral summary; a per-asset table with a "not enough history yet" state below `min_sample_size`; a permanent non-dismissible disclaimer; the plain-language date range. Full detail: `docs/claude_project/06_COMPONENTS.md` §7a.
- **Hard rule**: no "top signals"/"best calls" highlight list anywhere on this page.
- **Methodology**: `docs/claude_project/17_SIGNAL_ENGINE.md` §7, D22 / ADR 018. Prerequisite #53; quality context #115. #144: worker stores 1h/4h/24h/48h; this page still reads 48h only (no horizon selector).

### 3.7 Watchlist (`WatchlistClient.tsx` + `[symbol]/page.tsx`) (#145, 2026-09-19; picker collapsed + mobile FAB removed #186, 2026-09-25)
- **List:** first paint with no selections shows `COMMODITIES` cards. Live `/api/prices` + history sparkline only.
- **Add mechanism (2026-09-25):** was 3 overlapping ways in (My Commodities/Show All toggle, ADD COMMODITY dropdown, per-category chip rows) — collapsed to just the ADD COMMODITY `<select>`, which already listed every commodity and forex pair (`[...COMMODITIES, ...FOREX_PAIRS]`). A header "+ Add Asset" button (next to the `<h1>`, 44px touch target, both breakpoints) and the desktop-only FAB (`hidden md:flex`) both call the same `openAddCommodityPicker()` handler that scrolls/focuses that select. The mobile FAB was removed outright — it was `position:fixed` and visually overlapped scrolling card content (confirmed via Playwright screenshots, `claude/MOBILE_AUDIT_FULL_2026-09-24.md`).
- **Detail:** one price chart, range buttons 1M / 6M / 1Y / 3Y / 5Y. 1M from the 90-day DB series; longer ranges from Yahoo weekly `history-5y`. Honest 5Y empty/incomplete copy unchanged.
- **2026-09-19:** one Driver.js Feature Hint, now anchored to the header block (`data-hint="watchlist_chips"`, id unchanged — chips it originally described are gone). See 3.8.

### 3.8 `FeatureHints.tsx` (2026-09-19)
- **Purpose:** first-time pulsing hints (not the Joyride ProductTour). `overlay: false`; seen keys `bbr_hint_seen_*` in localStorage.
- **Also:** persistent hover tooltip on event-detail RECORD (`RECORD_BUTTON_TOOLTIP`) matching `handleRecord()` → `bb.saved_signals`. No Record control in Backtesting Lab.

### 3.9 Backtesting Lab (`app/(dashboard)/backtesting/page.tsx` + `api/backtesting/route.ts`) (2026-09-23, `4651f6c`)
- **Purpose:** scenario simulator over `Math.sin`-based synthetic demo points — not a real backtesting engine, no real historical dataset. `isDemo: true` banner always shown on mock results.
- **Fixed:** removed always-visible fabricated "GENESIS-X_V4" engine name + "Processing 15 years of geo-political volatility markers" copy (existed independent of the `isDemo` banner). Removed the fixed `accuracyPct` stat (71%, hardcoded, never varied) end to end — API `mockResult()` and the UI "ACCURACY RATE" tile. Stats grid is now 4 tiles (Total Events / Avg Move % / Max Deviation / Min Deviation), was 5.
- **Kept:** `avgMovePct` / `maxMovePct` / `minMovePct` and the per-row `correct` (movePct > 0) indicator — these read as simulation output, not a claimed track record.
- **Not done this ship:** a real backtesting engine with real historical data — tracked as backlog #171, needs its own research pass first.

### 3.10 CalendarPage (`app/(dashboard)/calendar/page.tsx`) (2026-09-25)
- **Purpose:** day-strip filter above the event list. 7 buttons (Mon–Sun) built from the same `getWeekRangeUTC(now)` call the "This Week" section already used — no second week-boundary definition.
- **Interaction:** tap a day → full (already-loaded) `EVENTS` list filtered to that `date`, This Week/Upcoming sections replaced by one "Events on <date>" section + "Show all" control; tap the active day again or "Show all" → back to the normal split. `selectedDay` is plain `useState<string | null>`, computed alongside `thisWeek`/`upcoming` in the existing `useMemo`.
- **Why:** "This Week" can legitimately show "No events in this range" while real events sit in "Upcoming" just past the window boundary — the day strip gives a decisive per-day view instead of requiring a scroll.
- No new backend query — reuses `EVENTS` (from `data/economic-calendar.json`) already loaded for the page.
- **"Export to Calendar" .ics download (2026-09-25, `a8bace3`):** header button next to the `<h1>`, count in its own label (`Export to Calendar (N)`). Exports `exportableEvents` — the day-strip selection when active, else `[...thisWeek, ...upcoming]` — so it always matches what the Importance/Country/Category/Timezone filters and day strip currently show, never the full unfiltered `EVENTS` array. Client-side only: builds an RFC5545 `VCALENDAR` string (new local `eventsToIcs`/`icsEscape`/`icsDateTimeUTC`/`icsDateOnly` helpers, no external ics library) and triggers it via a Blob + `<a download>` — no new backend endpoint, since the events are already loaded page-side. Timed events get `DURATION:PT30M`; events with no announced time (e.g. the OPEC report) export as all-day (`DTSTART;VALUE=DATE`). Labeled as a one-time download, not a sync, since there's no feed to keep it updated against. Disabled when the current filtered set is empty.

---

## 4. Primitives & UI Component Suite (`apps/web/components/ui`)

- `button.tsx`: Radix UI slot wrapper with variants (`default`, `destructive`, `outline`, `ghost`, `link`).
- `dialog.tsx`: Accessibility-compliant Radix modal dialog overlay.
- `dropdown-menu.tsx`: Contextual dropdown menu for settings and user profiles.
- `sheet.tsx`: Mobile slide-out drawer panel.
- `skeleton.tsx`: Loading shimmer placeholder block (`animate-pulse bg-neutral-800`).
- `sonner.tsx`: High-performance toast notification host.
