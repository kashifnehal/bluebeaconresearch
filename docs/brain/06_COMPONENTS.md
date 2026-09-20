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

### 2.1 `Sidebar.tsx`
- **Purpose**: Primary vertical terminal navigation sidebar. Below `md` it is an off-canvas drawer (`useUIStore.mobileSidebarOpen`); at `md`+ always visible (#133). Brand text "Blue Beacon Research" is a `<Link href="/dashboard">` (2026-09-18); ALPHA badge is not linked. Footer Help goes to `/help` (#155), not the HelpModal.
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
- **Props**: `{ asset: string; direction: Direction; confidence: number; size?: 'sm' | 'md' }`
- **Styling**: Pill tag with directional arrow. Both sizes show ticker + arrow only (#140). Classifier `confidence` stays on the prop for gating / `aria-label` ("model classification confidence {n}%"); it is not visible text and is not a price-direction probability.

### 3.3b `MarketImpactAssessment.tsx` (#143; #143 leftover 2026-09-20)
- **Purpose**: The event-detail / quick-view impact box, relabeled **MARKET IMPACT ASSESSMENT** (was PROJECTED IMPACT). Named parts from #141/#142 columns: source confirmation + novelty (2026-09-20; hidden when null), market mechanism, affected markets (CommodityChip, confidence-free since #140), direction, event category, reused `MediaImpactTag`. Empty mechanism + empty impact lists → exact Caldara & Iacoviello 2022 fallback sentence (no live GPR number). `is_preview` → calendar note + `/calendar` link.
- **Parents**: `events/[id]/page.tsx`, `SignalQuickView.tsx`.

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

### 3.5d `MapSignalPopup.tsx` (#179)

- Header badge is `sourceConfirmationLabel` (Official statement / Reported claim / Speculative / unconfirmed), hidden when `sourceConfirmation` is null. Raw `{n}% confidence` removed. Depends on #178 list-endpoint mapping.

### 3.6 `app/accuracy/page.tsx` (#121, 2026-09-11)
- **Purpose**: public (no auth) track-record page — reads `GET /v1/accuracy`, never recomputes live.
- **How**: server component, direct server-side fetch (same pattern as `admin/metrics/page.tsx`, no client proxy route needed); dark-terminal styling matches `/status`.
- **Shows**: overall hit rate + avg move + sample size always together; a separate volatile/neutral summary; a per-asset table with a "not enough history yet" state below `min_sample_size`; a permanent non-dismissible disclaimer; the plain-language date range. Full detail: `docs/claude_project/06_COMPONENTS.md` §7a.
- **Hard rule**: no "top signals"/"best calls" highlight list anywhere on this page.
- **Methodology**: `docs/claude_project/17_SIGNAL_ENGINE.md` §7, D22 / ADR 018. Prerequisite #53; quality context #115. #144: worker stores 1h/4h/24h/48h; this page still reads 48h only (no horizon selector).

### 3.7 Watchlist (`WatchlistClient.tsx` + `[symbol]/page.tsx`) (#145, 2026-09-19)
- **List:** first paint with no selections shows `COMMODITIES` cards; category chips toggle add/remove (dropdown kept). Live `/api/prices` + history sparkline only.
- **Detail:** one price chart, range buttons 1M / 6M / 1Y / 3Y / 5Y. 1M from the 90-day DB series; longer ranges from Yahoo weekly `history-5y`. Honest 5Y empty/incomplete copy unchanged.
- **2026-09-19:** one Driver.js Feature Hint on the dropdown + chip area (`data-hint="watchlist_chips"`). See 3.8.

### 3.8 `FeatureHints.tsx` (2026-09-19)
- **Purpose:** first-time pulsing hints (not the Joyride ProductTour). `overlay: false`; seen keys `bbr_hint_seen_*` in localStorage.
- **Also:** persistent hover tooltip on event-detail RECORD (`RECORD_BUTTON_TOOLTIP`) matching `handleRecord()` → `bb.saved_signals`. No Record control in Backtesting Lab.

---

## 4. Primitives & UI Component Suite (`apps/web/components/ui`)

- `button.tsx`: Radix UI slot wrapper with variants (`default`, `destructive`, `outline`, `ghost`, `link`).
- `dialog.tsx`: Accessibility-compliant Radix modal dialog overlay.
- `dropdown-menu.tsx`: Contextual dropdown menu for settings and user profiles.
- `sheet.tsx`: Mobile slide-out drawer panel.
- `skeleton.tsx`: Loading shimmer placeholder block (`animate-pulse bg-neutral-800`).
- `sonner.tsx`: High-performance toast notification host.
