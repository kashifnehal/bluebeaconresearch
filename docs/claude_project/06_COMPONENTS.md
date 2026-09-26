# 06_COMPONENTS.md — Frontend Component Reference

> **📍 Doc status — current as of 2026-09-26** for `Breadcrumbs.tsx` (new), CommandPalette (header-unified + last-resort fallback), Help, MARKET IMPACT ASSESSMENT, landing copy. `claude/23_TODO.md` is not in this repo.

**Framework:** Next.js 16 + React 18 + TypeScript
**Component library:** Shadcn/ui (Radix UI primitives)
**Styling:** Tailwind CSS + CSS variables
**Classification: Internal — CTO Level**

---

## 1. LAYOUT COMPONENTS

### PublicHeader (`components/layout/PublicHeader.tsx`) — added 2026-09-23 (#186 Phase 2)

Shared chrome for the logged-out public pages `/accuracy` and `/status`, which previously carried a byte-identical copy of the same header and drifted independently. Takes one prop, `badge: string` ("TRACK RECORD" / "SYSTEM MONITOR").

Responsive behavior (this is the whole reason it exists): `px-4 md:px-8`, `min-w-0` + `truncate` on the wordmark so it can shrink instead of wrapping to three lines, `shrink-0` on the logo and the Terminal link, the badge `hidden md:inline`, and `min-h-[44px] md:min-h-0` on the Terminal link for a thumb-sized tap target. Before extraction both pages overflowed 360px viewports by 111px and 117px.



### MobileTabBar (`components/layout/MobileTabBar.tsx`) — added 2026-09-23 (#186 Phase 3)

Fixed bottom navigation bar, `md:hidden`, rendered from `(dashboard)/layout.tsx` alongside `Sidebar`/`TopBar`. Five slots: **Feed** (`/dashboard`), **Map** (`/map`), **Alerts** (`/alerts`, unread badge — same `unreadCount` as `Sidebar`), **Watchlist** (`/watchlist`), **More** (opens the existing off-canvas drawer via `useUIStore`'s `mobileSidebarOpen`, same drawer `Sidebar` already renders — Calendar/Backtesting/Settings/Help/Logout all live there, not duplicated into the tab bar). Reuses `Sidebar`'s exact Material Symbols icon names so mobile and desktop share iconography. All 5 tap targets are ≥44px tall. `TopBar`'s old mobile hamburger button was removed in the same change — it opened the identical drawer, now redundant with More.

### LegalDisclaimerFooter (`components/layout/LegalDisclaimerFooter.tsx`) — added 2026-09-26

Site-wide legal disclaimer footer (not-investment-advice / not-a-registered-adviser language), no props, `data-testid="legal-disclaimer-footer"`, muted small `font-mono` text matching the existing `/status` and `/accuracy` footer styling. Rendered in `(dashboard)/layout.tsx` (below `<main>`, so it appears on every page in that route group) and directly in `app/status/page.tsx` + `app/accuracy/page.tsx` — the two pages that render `PublicHeader`; there's no shared public layout wrapping them to add it to instead.

### Sidebar (apps/web/components/layout/Sidebar.tsx)
**Used in:** (dashboard)/layout.tsx
**Fixed left, 256px wide. At `md`+ always visible. Below `md` an off-canvas drawer (`-translate-x-full` / `translate-x-0`) driven by `useUIStore.mobileSidebarOpen`, with a tap-outside backdrop. (#133, 2026-09-12)**

Props: None (reads auth + route from hooks)

Sections:
- Logo: "Blue Beacon Research" brand text wrapped in `<Link href="/dashboard">` (2026-09-18); ALPHA badge beside it is not a link
- Nav items (each 44px height, hover bg-elevated, active: green left border + text-accent):
  - Intelligence Feed → /dashboard
  - Global Map → /map
  - Alerts → /alerts (+ red badge with unread count from useUIStore)
  - Watchlist → /watchlist
  - Backtesting → /backtesting
  - Settings → /settings
- Bottom section:
  - "Node: BB-ALPHA-09" text (cosmetic)
  - Help link → `/help` (#155 FAQ + feedback form)
  - Replay Tour button (`md:hidden`, added 2026-09-24 #186) — mobile-only equivalent of `TopBar`'s desktop-only "Help & Guidance" icon; calls `useUIStore.startTour()` and navigates to `/dashboard` if elsewhere, same as `HelpModal`'s `handleReplayTour`
  - Logout button → supabase.auth.signOut()

Active state detection: usePathname() from next/navigation.

---

### TopBar (apps/web/components/layout/TopBar.tsx)
**Used in:** (dashboard)/layout.tsx
**Fixed top. `left-0` below `md`; `md:left-[256px]` at desktop so it clears the permanent sidebar.**

Contains:
0. **Hamburger (below `md` only)** — `menu` icon, first control in the bar, opens the off-canvas sidebar (#133)
1. **Search button** — looks like the old search bar (icon + "Search signals, coordinates, entities..."); `aria-label="Open search"`. Click sets `useUIStore.commandPaletteOpen` and opens `CommandPalette`. No in-page filter; `searchQuery` / `searchSubmitted` removed from the store.

1b. **Connect-channel icon (`forum`)** — all screen sizes. Opens `NotificationConnectModal` (wraps existing `<TelegramConnect />`). Distinct from the alerts bell. (#112)

1c. **Command palette (`CommandPalette.tsx`)** — Cmd+K / Ctrl+K **and** the header search button. Same Pages / Signals / Watchlist / Alert Rules search as 2026-09-20 (Fuse.js keywords + `sort=relevance` Signals + Suggested assist). **2026-09-20 header unify:** `open` lives in `useUIStore.commandPaletteOpen` so TopBar can open it. **Last-resort fallback:** if that search settles empty and assist is off or not `ok`, a single static **"Not sure? Try"** item links `/dashboard` (no extra network call). Keyword lists expanded (e.g. "oil price"→Watchlist). FAQ copy indexed as of #155 (`SEARCH_FAQ_ENTRIES` + Help page in Pages).
2. **Notification Bell (🔔)**
   - Badge: red dot with unread_count from useUIStore.unreadAlerts
   - onClick: toggles useUIStore.notificationPanelOpen
   - Renders NotificationPanel when open

3. **Help icon (?)**
   - onClick: toggles useUIStore.helpModalOpen
   - Renders HelpModal when open

4. **User avatar circle**
   - Shows user initials (first letter of full_name)
   - Background: accent green
   - onClick: toggles user dropdown
   - Dropdown: user name, email, divider, Help link (`/help`), Settings link, Sign Out button

5. **Real username + "v2.4.0-STABLE" version tag** — top right (loading-state fallback name is "Account", not real branding — the prior "Terminal Sentinel" fallback was removed 2026-09-24 per D29/ADR 025)

---

### NotificationPanel (apps/web/components/NotificationPanel.tsx)
**Position:** Fixed right-side drawer, 360px wide, slides in from right
**Trigger:** Bell icon in TopBar

Content:
- Header: "Recent Alerts" + close X + "Mark all read" button
- List: last 10 alerts_sent from GET /v1/alerts/recent
- Each item: severity colored dot + time ago + signal title + "View →" link (`<a target="_blank" rel="noopener noreferrer">` to `/events/{id}`, #123 remainder 2026-09-19)
- Unread items: bg-elevated (slightly brighter background)
- Read items: normal background
- Empty state: Bell icon + "No alerts yet. Create alert rules to get started."
- Footer: "Manage alert rules →" → /alerts

On open: marks all alerts as read (via API), resets unread_count badge.

> ⚠️ UPDATED 2026-08-25 — the "View →" link is now conditional, not universal. If an
> item's `alerts_sent.status` isn't `delivered` (i.e. `queued` — no delivery channel
> connected — or `failed`), it shows an amber "Not Delivered" / red "Delivery Failed"
> badge and a one-line explanation instead of the "View →" link, and the row dims
> slightly (`opacity-70`). Fixed in `3c2378c` because a queued/failed alert previously
> rendered identically to a real delivered one, silently masking dispatch failures. See
> `docs/brain/08_CURRENT_STATUS.md`'s 2026-08-25 entry.

---

### NotificationConnectModal (apps/web/components/NotificationConnectModal.tsx)
**Trigger:** TopBar `forum` icon, or the contextual prompt after 3 signal-detail views
**Body:** existing `<TelegramConnect />` (Settings page usage unchanged)
**Dismissed flag:** closing this modal does **not** write `profiles.notification_prompt_dismissed_at` — only the contextual prompt's "Not now" does. (#112, 2026-09-12)

### DiscordConnect (apps/web/components/DiscordConnect.tsx)
**Used in:** Settings → NOTIFICATIONS, immediately after `<TelegramConnect />` and its divider (before Daily Digest).
**Flow:** paste a Discord incoming-webhook URL → Save upserts `user_channels.discord_webhook_url` + `discord_connected_at` via the browser client (`user_channels_all_own`). Test POSTs `{ webhookUrl }` to `/api/discord/test` (auth required, server-side fetch). Connected state uses the same Linked badge language as TelegramConnect, plus Disconnect (both columns → null). No bot, no OAuth, no connect-code polling. Missing-client Save/Disconnect toast uses honest account-connect copy (`throwIfNoSupabase`); `"Supabase client not available"` is `console.error` only. Settings profile/digest toasts use the same rule — no PostgREST interpolation (#138). Dashboard/map cached-feed banner uses `feedDegradedCopy()` (never interpolates `fallbackReason`).

### Alerts create-rule modal (`(dashboard)/alerts/page.tsx`)
Channel checkboxes for Telegram / Discord / Slack. `modalChannels` defaults to whichever of `telegram_chat_id` / `discord_webhook_url` / `slack_webhook_url` are present on the current user's `user_channels` row, else `["telegram"]`.

### AlertRuleTrendChart (apps/web/components/alerts/AlertRuleTrendChart.tsx, new 2026-09-25, `f019cb9`)
Small 14-day real match-count trend under each rule's name on `/alerts`, fed by `GET /api/alerts/rule-stats` (see `05_API.md`). Recharts `BarChart`, one bar per day, plus a "N matches this week" summary number (last 7 of the 14 days) shown at all breakpoints — day labels are desktop-only via the tooltip, mobile keeps the bar shape + the summary number rather than dropping the chart. `isTrendSparse(totalMatches, ruleCreatedAt)` gates an `AlertRuleTrendEmptyState` ("Not enough history yet") instead of a near-empty chart when a rule has fewer than 3 all-time matches or is less than 7 days old — both fixed thresholds, no per-rule config in this v1. All counts are real `alerts_sent` data; nothing here is fabricated or estimated.

### NotificationConnectPrompt (apps/web/components/NotificationConnectPrompt.tsx)
**Mounted in:** (dashboard)/layout.tsx
**Shows** after `NOTIFICATION_PROMPT_AFTER_SIGNALS` (3) signal-detail mounts this session, if `notification_prompt_dismissed_at` is null and Telegram is not already connected (`/api/telegram/status`). Compact non-blocking card. "Not now" updates the user's own `profiles` row.

### FeatureHints (apps/web/components/onboarding/FeatureHints.tsx) (2026-09-19)
**Mounted in:** (dashboard)/layout.tsx, next to ProductTour.
**Not a tour.** Uses Driver.js Feature Hints (`driver.js/hints`): one pulsing beacon per page, click expands a 1–2 sentence popover, `overlay: false`, no next/back. Hidden while `tourActive`.
**Targets:** `/watchlist` `[data-hint="watchlist_chips"]` (header: + Add Asset button + ADD COMMODITY dropdown — category chips removed 2026-09-25, #186); `/dashboard` `[data-hint="dashboard_filters"]` (FilterBar); `/events/[id]` `[data-hint="event_record"]` (RECORD).
**Seen:** `localStorage` `bbr_hint_seen_<id>` — per-browser, as specified (not `user_preferences`). Dismiss on Got it or on clicking the highlighted control.
**RECORD hover tooltip** (always-on, not a hint): `RECORD_BUTTON_TOOLTIP` in `lib/feature-hints.ts`, wrapping the event-detail RECORD button. Copy matches `handleRecord()`: writes `bb.saved_signals` in this browser; no in-app list reads it. Backtesting Lab has no Record button.

### HelpModal (apps/web/components/HelpModal.tsx)
**Position:** Centered modal overlay
**Trigger:** ? icon in TopBar (unchanged). Sidebar Help now goes to `/help` instead.

Content (5 accordion sections):
1. **Reading signal cards** — severity 1–10 explanation, confidence %, direction
2. **Setting up Telegram alerts** — step by step: find @BlueBeaconBot → /connect [code]
3. **Using the map** — click dots, Global Tension Index explanation
4. **Backtesting** — how to use, disclaimer about demo data
5. **Help & feedback** — link to `/help` FAQ (#155)

Close: X button or click outside overlay.

### Help page (`apps/web/app/(dashboard)/help/page.tsx`) + `FeedbackForm.tsx` (#155)
Logged-in `/help` (middleware-protected). 10 FAQ answers from `lib/help-faq.ts` (current classifier / materiality / accuracy / LIVE behavior). Form fields: message, optional email, read-only page context. POST `/api/feedback` → `feedback_submissions`. No live chat.

### Breadcrumbs (apps/web/components/layout/Breadcrumbs.tsx) — added 2026-09-26 (claude/230)
Chevron-separated trail (`{label, href?}[]`), last segment non-clickable and truncates on mobile instead of overflowing. On all 10 `(dashboard)` pages; on `/map` it's an absolutely-positioned overlay pill (full-bleed canvas page, no chrome header) instead of inline content. Replaced a plain "Back to X" button on `events/[id]`/`watchlist/[symbol]`. See `docs/brain/06_COMPONENTS.md` §2.5 for the pre-existing header-overlap layout bug this surfaced and fixed on `events/[id]`.

---

### ErrorBoundary (apps/web/components/ErrorBoundary.tsx)
**Type:** React class component (required for componentDidCatch)
**Wraps:** Every major section in dashboard layout

Props:
```typescript
interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}
```

Error UI:
- Full dark background (#050914)
- Amber triangle warning icon (Lucide AlertTriangle, 40px)
- "Something went wrong" heading
- "We've been notified and are looking into it."
- "Reload Feed" button → window.location.reload()

On error: console.error only, never expose stack trace to user.

---

### EmptyState (apps/web/components/EmptyState.tsx)
**Reusable empty state for all pages**

Props:
```typescript
interface Props {
  icon: LucideIcon
  title: string
  description: string
  action?: {
    label: string
    href?: string
    onClick?: () => void
  }
}
```

Layout: centered, py-16, icon 48px text-muted opacity-50, title text-primary, description text-secondary text-sm, action button bg-accent.

Usage instances:
- Dashboard: Globe icon + "Monitoring global events"
- Alerts (no rules): Bell icon + "No alert rules yet" + "Create first rule" button
- Watchlist (empty): BarChart2 + "Your watchlist is empty"
- Calendar (no events): Calendar icon + "No high-impact events today"
- events/[id] (not found): Search icon + "Signal not found" + "Return to feed" link

> ⚠️ UPDATED 2026-09-25 — `events/[id]/page.tsx` Deep Dive tab row gains a 5th tab. The
> existing "sources" tab (value unchanged, so any deep link keeps working) is now
> visibly labeled "timeline": same source-article list, now oldest-first with the
> outlet domain shown, backed by `/api/signals/:id`'s reordered `sources`. New
> "related events" tab: reads the same route's new `relatedEvents[]`, each row linking
> to that event's own page with country, shared commodity ticker(s), and a
> reinforcing/conflicting/mixed badge; empty state reads "No related events found."
> instead of hiding the tab. `SignalQuickView.tsx` (the drawer) is intentionally
> untouched — it only shows a briefing excerpt + "View full details" link, and defers
> everything else (sources, historical, related) to this full page.

---

## 2. SIGNAL COMPONENTS

### SignalCard (apps/web/components/signals/SignalCard.tsx)
**The most-rendered component in the app**

Props:
```typescript
interface SignalCardProps {
  signal: Signal
  variant: 'large' | 'grid' | 'compact'
  onClick?: () => void
}
```

**Large variant** (top of dashboard):
- Source badge (NEWS/GEOPOLITICAL SIGNAL) + Signal ID + timestamp
- Title (h2 size, font-medium text-white)
- Summary paragraph
- Region + Country + Confidence badges
- "ANALYZE IMPACT →" button → /events/[signal.id] (new tab; #123 remainder 2026-09-19)
- Price-at-signal row (if price_at_signal populated and signal < 72h):
  "WTI at signal: $84.20 | Now: $87.31 +3.7% ↑ · 4h 23m ago"

**Grid variant** (2-column grid):
- Source + timestamp top row
- Title (2 lines max, line-clamp-2)
- Summary (2 lines max)
- Region + severity tags
- Entire card clickable → /events/[signal.id] (new tab; #123 remainder 2026-09-19)

**Compact variant** (Recent Signal Stream):
- Severity colored dot
- Timestamp (font-mono)
- Title (flex-1, truncated)
- Confidence badge
- Chevron →
- Entire row clickable → /events/[signal.id] (new tab; #123 remainder 2026-09-19). Live feed is inline in `dashboard/page.tsx`, not this component. Quick-view "View full details" already opened a new tab (`ef73885`). Remaining event-detail clicks (map popup, watchlist Correlated Signals, alerts Recent Matches, NotificationPanel, CommandPalette Signals, event Historical tab) now use the same `<a target="_blank" rel="noopener noreferrer">` pattern.

**Breaking state** (is_breaking = true):
- Left border: border-l-4 border-danger
- Background: bg-danger-subtle
- "BREAKING" badge prepended to title

**#142 `[Media-Impact]` tag** (`MediaImpactTag.tsx`): shown when `signal.mediaImpactEntity` is set. Compact hover/title on cards; expanded entity + short caveat on the event detail page. Copy is a sourced historical reaction pattern — not a forecast, not a buy/sell. Live dashboard featured / secondary / stream cards render the same tag (those cards are inline in `dashboard/page.tsx`, not `SignalCard`).

---

### SignalChatPanel (apps/web/components/signals/SignalChatPanel.tsx) — #111, `9f2aada`; visual pass 2026-09-12
**Used in:** `(dashboard)/events/[id]/page.tsx`, below Full Analyst Briefing / Impact Breakdown (those sections are not restyled or replaced).

**Why:** let a user ask follow-ups about **this** briefing without turning the page into a general advisor. Grounded generation of the URL-identified signal — not retrieval (D21 / ADR 017, `18_AI_ENGINE.md` §3b). Same #103 buy/sell rule as the briefing, plus personalized-advice refusal.

**How:**
- On mount: GET `/api/signals/:id/chat` (BFF → Fastify). Empty state: designed "Ask a question about this briefing" block (not a 12px caption). History-load failures use `HistoryErrorCode` / `HISTORY_ERROR_COPY` (401 session expired, 403 early-access, 5xx server, network) — not one generic "please reload" sentence.
- Send: optimistic user bubble, POST `{ message }`, spinner matching #108 (`progress_activity` + `animate-spin`), then append `reply`. Rollback the optimistic bubble on 4xx/5xx.
- Errors: `403 chat_early_access_only` → embedded `AccessLimitedModal` ("AI Chat is currently available to early-access members…") instead of the composer. `403 premium_required` → "This feature needs a paid plan." / `429 rate_limited` → today's question limit / `429 rate_limited_burst` → slow down / `503` with a usage-limit message → try tomorrow / other `503 ai_temporarily_unavailable` → temporarily unavailable. Never dump the raw JSON.
- Assistant replies render a "Sources" section of clickable handed URLs when the stored text includes `---SOURCES---`; omitted when empty.
- The answer text itself (`CitedAssistantReply`, 2026-09-12 quality fix) renders through `react-markdown`, `allowedElements={["p","strong","em","ul","ol","li"]}` — same pattern as the briefing render in `events/[id]/page.tsx`. `a`/`img` are deliberately excluded: the Sources `<ul>` above is the only surface allowed to render a real clickable link, so a markdown link the model puts in its answer text renders as plain text, never a link.
- If the signal's `classificationMethod === 'heuristic'`, a note at the top of the panel: "This signal was auto-classified — Claude analysis is temporarily unavailable."
- Always-visible, non-dismissible footer strip under the input: "This assistant explains the signal only — it can't give personalized investment advice."
- Reload must restore history from `signal_chat_messages`. Styling uses working stitch tokens (`text-on-surface`, `text-on-surface-variant`, `text-primary-fixed-dim`) — `text-text-secondary` / `text-muted` / `text-bg-app` do not map in `tailwind.config.ts`. Composer stacks below a 420px container width.

---

### SeverityBadge (apps/web/components/signals/SeverityBadge.tsx)
Props: `{ score: number, size?: 'sm' | 'md' | 'lg' }`

Color map:
```
10: bg-[#EF4444] text-white — "CRITICAL"
9:  bg-[#F97316] text-white — "EXTREME"
8:  bg-[#F59E0B] text-black — "HIGH"
7:  bg-[#EAB308] text-black — "ELEVATED"
1-6: bg-secondary text-muted  — "LOW"/"MEDIUM"
```

Format: "SEV [N]" in small, or "[N]" in large variant.

---

### CommodityChip (apps/web/components/signals/CommodityChip.tsx)
Props: `{ asset: string, direction: Direction, confidence: number, size?: 'sm' | 'md', label?: string }`

Direction color map:
```
up:       bg-success-subtle text-price-up   "USOIL ↑"
down:     bg-danger-subtle  text-price-down "WHEAT ↓"
volatile: bg-warning-subtle text-warning    "XAUUSD ↕"
neutral:  bg-secondary      text-muted      "NGAS –"
```

Both sizes show ticker + direction arrow only. Classifier `confidence` is not visible text (it is the model's self-reported tagging confidence, not a price-direction probability). `aria-label` still includes "model classification confidence {n}%".
Shape: rounded-full pill. **#202 (2026-09-25):** optional `label` prop renders a small uppercase caption above the pill; unset everywhere except `MarketImpactAssessment`'s "Predicted" usage below.

---

### MarketImpactAssessment (apps/web/components/signals/MarketImpactAssessment.tsx) — #143, #202
**Used in:** event detail aside (`events/[id]/page.tsx`) and `SignalQuickView`. Relabel of the old PROJECTED IMPACT / "Commodity impacts" box — not a new product surface.

Named parts, populated from #141/#142 signal fields: Source confirmation (`official` → "Official statement", `reported` → "Reported claim", `speculative` → "Speculative / unconfirmed"), Novelty (UI buckets only: ≥0.7 "New development", ≥0.3 "Partial update", else "Mostly a repeat/reminder"), Market mechanism (`marketMechanism`), Affected market(s) (existing `commodityImpacts` + `currencyPairImpacts` via `CommodityChip`), Direction, Event category (9-value enum → display name, e.g. `armed_conflict_security` → "Armed Conflict & Security"), Media-Impact tag (reuses `MediaImpactTag` when `mediaImpactEntity` is set). Source confirmation and novelty render nothing when null — no N/A. When mechanism is null and both impact lists are empty, the box shows the exact sourced Caldara & Iacoviello (2022) fallback sentence — not a live GPR number. `isPreview` adds a small note with a link to `/calendar`. No raw classifier-confidence percent in this box.

**#202 (2026-09-25):** the model's static predicted-direction chip and the live "price move since fired" sentence sat next to each other with nothing labeling which was which — they can legitimately disagree (that's the whole point of tracking accuracy) but read as a contradiction. Fix is copy-only: `CommodityChip` gets `label="Predicted"`, the price subtext gets a "Since signal:" prefix. Neither number's underlying computation changed.

Event-detail ANALYSIS tab also has a "Why this signal" `<details>` (below Full Analyst Briefing) when `materialityReasoning` is non-null — raw classifier reasoning, not invented uncertainty copy. SignalQuickView header no longer shows `{n}% confidence`.

`MapSignalPopup` (#179) uses the same null-hidden `sourceConfirmationLabel` in the header badge slot (same wording as this box). No percentage fallback.

---

### BreakingAlertBanner (apps/web/components/signals/BreakingAlertBanner.tsx)
**Shows when severity ≥ 9 signal exists in last 4 hours**

Props: `{ signal: Signal, onDismiss: () => void }`

Layout: full-width strip at top of dashboard content area.
- bg-danger text-white
- Pulsing siren icon (Lucide Siren, CSS animation pulse 1s infinite)
- "BREAKING: " (bold) + signal.title
- Time ago right side
- X dismiss button
- Clicking body → /events/[signal.id]

Dismissal stored in sessionStorage. Re-appears for new breaking signals (different ID).

---

## 3. LANDING PAGE COMPONENTS

### AccessLimitedModal (apps/web/components/landing/AccessLimitedModal.tsx)
**Already built. Controlled by PROJECT_READY flag.**

Props: None (reads from env var)

Shows when: NEXT_PUBLIC_PROJECT_READY !== 'true' AND user not logged in AND localStorage 'bbr_seat_dismissed' !== 'true'

Content:
- Full-screen overlay (rgba black, backdrop-blur)
- Close X button
- "● Blue Beacon Research" logo
- "Research Access Is Currently Limited" heading
- Subtext about analyst team quality
- Counter: large number (847 default from localStorage)
- Progress bar (counter/1000 * 100%)
- "⚡ 31 analysts joined in the last 24 hours" urgency text
- "Claim Your Research Seat →" button → /signup
- "View the live intelligence feed first" → closes modal

Counter behavior:
- Load from localStorage 'bbr_seat_count' (default 847)
- setInterval every 45–90s (randomized): increment 1–3
- Cap at 999
- Save to localStorage on each increment

---

### Landing page (`apps/web/app/page.tsx`) — 2026-09-20 copy integrity

No separate `components/landing/*` files exist. The public homepage is this server component.

- `dynamic = "force-dynamic"`. `getLatestSignal()` still reads the newest active `signals` row. Public reads use `getRouteSupabaseClients().supabase` (service role when the key is set). Live RLS is `signals_select_authenticated` only; the cookie/anon client returns 0 rows to a logged-out visitor.
- `getHomepageStats()` runs an exact `signals` count (`select("id", { count: "exact" })`, no `head: true`) and renders "N signals tracked" — live, not hardcoded. Failures log the full Postgrest error.
- CTA overlay: "Sign up to read the full assessment" → `/signup`. Empty state is "Loading the latest signal…" (no Beacon-Alpha / hardcoded example card).
- New track-record section + header/footer links to the existing public `/accuracy` page. **No homepage hit-rate percentage** (deliberate; the page is the proof point).
- Removed fabricated lines: 42ms, 100% Verified, 40yr Intel Archive, Encrypted Support, sub-second synthesis.
- Hero `<p>` (#174, 2026-09-20): "Blue Beacon Research — Geopolitical Intelligence for Commodity Traders". Headline unchanged.

---

### LiveSignalPreview (historical spec — not a separate file)

The older spec below described a `components/landing/LiveSignalPreview.tsx` that was never split out. Treat `app/page.tsx` as the source of truth.

Fetches: newest active `signals` row (server, same request as the page)
Shows: Most recent signal title/summary/impacts
Blur: Lower 40% of card blurred with gradient overlay
CTA button: "Sign up to read the full assessment" → /signup

If no signals in DB: "Loading the latest signal…" — no hardcoded example card.

---

### PricingTable (apps/web/components/landing/PricingTable.tsx)
Three-column pricing card grid.

Each card props: `{ tier, price, features[], ctaLabel, ctaHref, highlighted }`

Highlighted card (Analyst, $49): green border, "Most popular" badge.

Founding member banner above cards:
```jsx
<div className="border border-blue-500/30 bg-blue-900/20 rounded-lg p-4 text-center mb-8">
  🔒 Founding Member Offer — First 500 subscribers lock in pricing for life.
  <span className="text-amber-400">312 spots remaining.</span>
</div>
```
(312 is manually updated weekly)

---

## 4. MAP COMPONENTS

### MobileTensionSheet (`components/map/MobileTensionSheet.tsx`) — added 2026-09-23 (#186 Phase 4)

`md:hidden` bottom sheet, replaces the two always-mounted desktop panels below `md` (they were previously unconditional at every viewport, which is why two `w-80` panels used to occlude the entire map on a phone). Tap-to-expand peek header (score, sample size, 24h sparkline, filter icon, chevron) plus an expanded body reusing the exact same tension-bar and intelligence-stream JSX as the desktop panels — owns no data of its own, `map/page.tsx` passes everything down as props. The filter icon opens a separate `md:hidden` bottom modal wrapping the same `<FilterBar>` component the desktop panel uses (verified safe to mount twice — `FilterBar` is a pure controlled component, no internal state). New MapLibre `NavigationControl` (+/- zoom, mobile-only, `bottom-right`, hidden at `md:` via `globals.css`) added alongside the existing `AttributionControl` — justified because phones have no scroll-wheel; no locate control added, no feature in the app reads geolocation.

**2026-09-24 (#186 button/link parity audit):** added an ⓘ "About the Global Tension Index" tap-to-toggle info button + tooltip above the three breakdown bars, mirroring the desktop panel's identical explainer (`map/page.tsx`'s `tensionInfoOpen` state) — the desktop panel has one, this sheet previously didn't. Local `useState` inside `MobileTensionSheet`, not lifted to props, since it's presentational-only state. Note for anyone querying the DOM: the desktop panel's own info button shares the exact same `aria-label="About the Global Tension Index"` — always disambiguate by `offsetParent`/visibility, not just the selector, or you'll grab the hidden desktop instance.

**Doc correction:** the `GlobalTensionIndex` entry below describes a component that does not exist as a separate file — `grep`/`find` confirm no `GlobalTensionIndex.tsx` anywhere in the repo. That whole panel (score, bars, filters) is inline JSX inside `app/(dashboard)/map/page.tsx`'s `MapPage` component, not a standalone component. Leaving the description below as a content reference (it's accurate about what renders) but flagging the file path as stale rather than silently rewriting a section outside this phase's scope.

### GlobalTensionIndex (apps/web/components/map/GlobalTensionIndex.tsx)
**Left panel on /map page**

Displays:
- "GLOBAL TENSION INDEX" label
- Large score number + "LIVE" badge
- Three progress bars: Cyber Warfare %, Kinetic Conflict %, Diplomatic Friction %
- "ACTIVE SENTIMENT" — Bull/Neutral/Bear percentages with colored dots

Calculation (from API /v1/signals?period=24h):
- Kinetic %: signals with event_category='conflict' / total × 100
- Cyber %: signals with event_type containing 'cyber' / total × 100
- Diplomatic %: all other / total × 100
- Bull/Neutral/Bear: aggregated commodity_impacts directions

> ⚠️ UPDATED 2026-08-25 — No separate `GlobalTensionIndex.tsx` component exists; this lives inline in `apps/web/app/(dashboard)/map/page.tsx` (the `tensionMetrics` useMemo + its JSX panel), computed client-side from the already-fetched `liveSignals` via title/eventType regex matching — not a call to `/v1/signals?period=24h`. There's no "LIVE" badge or "ACTIVE SENTIMENT" Bull/Neutral/Bear row in the current build (pre-existing spec/reality gaps, not touched this session). What *did* change this session: an info icon (methodology tooltip, matching `HelpModal.tsx`'s wording) and a real last-24h trend sparkline were added next to the score — see `docs/brain/14_CHANGELOG.md` v0.28.5.
> ⚠️ UPDATED 2026-09-20 (#175) — clicking the "i" still pins `tensionInfoOpen`; `mousedown` outside the button+tooltip now closes it (same pattern as `TopBar.tsx`). CSS `group-hover` preview and the existing methodology sentence are unchanged. No formula added.
> ⚠️ UPDATED 2026-09-26 (`73bcd34`) — **the score/bars/sparkline described above no longer exist at all.** All of it (0-99 score, cyber/kinetic/diplomatic %, 24h sparkline) was a keyword-regex guess from `eventType`/title, not real data — removed per CLAUDE.md's standing "never fabricate data in the UI" rule. Replaced with a real tally: count of active `severity >= 8` signals ("High-Severity Activity — N high-severity events active, of M total"), same threshold as `isUrgent` elsewhere in this file. `MobileTensionSheet`'s peek header and breakdown bars updated to match; `tensionHistory` prop removed. See `docs/brain/14_CHANGELOG.md` v0.104.0.

### Map cluster/point click → Intelligence Stream (`app/(dashboard)/map/page.tsx`) — added 2026-09-26 (`73bcd34`)

Clicking a map cluster now populates the Intelligence Stream sidebar (desktop panel + `MobileTensionSheet`) with every signal in that cluster (`source.getClusterLeaves`), and nudges the zoom-in target toward a more balanced ~5-child split via `getClusterChildren` (capped at 2 adjustment attempts, falls back to the plain `getClusterExpansionZoom()` result). Clicking a single unclustered point does the same for just that signal, alongside the existing popup. New "SHOW ALL" control (both panels) clears the selection back to the normal feed; also clears on filter change or a background map click. `data-testid="map-cluster-click"` on the map container.

**Could not fully verify live** — direct calls to `getClusterExpansionZoom`/`getClusterLeaves`/`getClusterChildren` hang indefinitely against a real cluster in this dev environment (reproducible, unrelated to this change — the pre-existing cluster-click zoom handler used the same API). Single-point click and the "SHOW ALL" clear path verified working at desktop and mobile widths. Full detail: `docs/brain/06_COMPONENTS.md` §3.5g.

---

## 5. WATCHLIST COMPONENTS

### CommodityPriceCard (apps/web/components/watchlist/CommodityPriceCard.tsx)
Props: `{ symbol, fullName, category, priceData, activeSignals, isWatchlisted, onToggleWatchlist }`

Sections:
- Top: symbol + full name + category badge + star/bookmark icon
- Price: large font-mono current price
- Change: +/- amount and % (colored)
- Range bar: 7-day high/low visual
- Risk badge: LOW/MEDIUM/HIGH/CRITICAL based on activeSignals.length + severity
- Alert toggle: if alertEnabled, creates alert rule on API
- Mini spark chart: last 30 data points (Recharts AreaChart, 80px height, no axes)

> ⚠️ UPDATED 2026-08-25 — No separate `CommodityPriceCard.tsx` component exists; the card markup lives inline in `apps/web/app/(dashboard)/watchlist/WatchlistClient.tsx`, without the range bar, risk badge, or alert-toggle props described above (pre-existing spec/reality gap, not touched this session). What *did* change this session: cards are now clickable — not previously speced anywhere — navigating to a new `apps/web/app/(dashboard)/watchlist/[symbol]/page.tsx` route with a real 90-day price chart and a correlated-signals timeline with factual price-move stats. See `01_PRODUCT.md` §2.11 and `docs/brain/14_CHANGELOG.md` v0.28.4.
> ⚠️ UPDATED 2026-09-09 (#87 phase 2, `55df380`) — `WatchlistClient.tsx` now covers commodities **and** the 6 forex pairs: its asset list is `[...COMMODITIES, ...FOREX_PAIRS]`, the #89 "My Commodities / Show All" default seeds from `commodities ∪ forex_pairs` (via `useMyPreferences().forexPairs`), and the add-asset dropdown lists all 13. Forex prices come from `/api/prices` (price-syncer already syncs them). The `[symbol]` drill-down still keys off `COMMODITIES` only — a forex card there is degraded (raw label, no matched signals); candidate for phase 3.
> ⚠️ UPDATED 2026-09-09 (#87 phase 4, `accd468`) — the `[symbol]` drill-down now resolves against `FOREX_PAIRS` too: a forex symbol shows its real label ("EUR/USD"), "You follow this" checks `forexPairs`, and the correlated-signals fetch sends a new `?forexPair=` param (mirroring `?commodity=` against `currency_pair_impacts`) so a forex drill-down lists its matched signals. `?commodity=` unchanged. `apps/web` only.
> ⚠️ UPDATED 2026-09-19 (#145) — list page first-paints `COMMODITIES` when there are no user selections (page is never an empty dropdown) and adds a category-chip row to add/remove; the ADD COMMODITY dropdown stays. Drill-down is a **single** price chart with 1M / 6M / 1Y / 3Y / 5Y (1M = 90-day DB series; 6M+ = Yahoo weekly `history-5y`). The two honest 5Y fallback sentences are unchanged. Correlated-signals list still last-90-days.
> ⚠️ UPDATED 2026-09-25 (#186 mobile-overlap fix) — the list page's floating "+" FAB (`position:fixed bottom-[76px] right-4`) visually overlapped scrolling card content on mobile; it is now `hidden` below `md:` (kept on desktop only). A new "+ Add Asset" header button next to the page title covers the same action on mobile — 44px touch target, focuses/scrolls to the ADD COMMODITY select, visible without scrolling. The #145 category-chip row and the #89 "My Commodities" / "Show All" toggle were both removed — collapsed down to the single ADD COMMODITY dropdown, which already listed every commodity and forex pair. `[data-hint="watchlist_chips"]` now anchors the header block, not chips.
> ⚠️ UPDATED 2026-09-26 (#207/#228 chart attribution, Phase 1 DB-only) — the `[symbol]` drill-down's price chart gained a per-point "why did this move?" affordance: hover/tap a point → small clickable dot (`data-testid="chart-attribution-trigger"`) → calls new `GET /api/signals/attribution` (DB-only scoring: asset match + direction match + recency decay + severity, no external news, no LLM) → up to 3 ranked results below the chart with a fixed "not a claim this caused the move" framing line, or an explicit no-match message. One-time explanatory banner reuses the existing `bbr_hint_seen_*` localStorage convention from `FeatureHints.tsx`. Full detail: `docs/brain/06_COMPONENTS.md` §3.7, `docs/brain/05_API.md`.

---

## 6. SETTINGS COMPONENTS

### ApiKeyRow (apps/web/components/settings/ApiKeyRow.tsx)
Props: `{ apiKey, onDelete }`

Shows: name, prefix (bb_live_abcd...), created date, last used, call count, active toggle, delete button.
Delete: confirm dialog, then DELETE /v1/api-keys/:id.

### NewApiKeyModal (apps/web/components/settings/NewApiKeyModal.tsx)
On create success: shows full key with copy button.
Warning: "This key will not be shown again. Store it securely."
After copy/close: key is masked in list forever.

---

## 7. PAGE COMPONENT STRUCTURE

Each page in (dashboard) follows this pattern:
```tsx
export default function PageName() {
  // 1. Auth check (handled by middleware, but double-check session)
  // 2. Data fetching (useQuery from TanStack Query)
  // 3. Loading state (skeleton components)
  // 4. Error state (ErrorBoundary catches render errors)
  // 5. Empty state (EmptyState component)
  // 6. Main content render
}
```

### BacktestingPage (`apps/web/app/(dashboard)/backtesting/page.tsx` + `apps/web/app/api/backtesting/route.ts`) (2026-09-23, `4651f6c`)

Scenario simulator, not a real backtesting engine — mock results only (`Math.sin`-based demo points), `isDemo: true` banner always shown. Fixed 2026-09-23: the panel previously named a fabricated "GENESIS-X_V4" engine and claimed "Processing 15 years of geo-political volatility markers" regardless of the disclaimer state; now reads "Scenario Simulator" / "Hypothetical Event Impact" with no invented engine name or year count. Also dropped the hardcoded `accuracyPct` (71%, fixed, never varied) stat end to end — it implied a track record even next to a disclaimer. Remaining stats (avg/max/min move %) are kept as illustrative simulation output. A real backtesting engine over real historical data is backlog #171, not yet started.

### CalendarPage (`apps/web/app/(dashboard)/calendar/page.tsx`) (2026-09-25)

Added a 7-day tappable day strip (Mon–Sun, reusing the existing `getWeekRangeUTC` boundary so it can never disagree with the "This Week" section) above the event list. Fixes the case where "This Week" shows "No events in this range" while real events sit just outside it in "Upcoming" — tapping a day filters the full (already-loaded, no new API call) event list down to just that date, replacing the This Week/Upcoming split with a single "Events on <date>" section; tapping the active day again, or a "Show all" control, restores the normal split view. No new backend query.

**"Export to Calendar" .ics download (2026-09-25, `a8bace3`):** new header button exports whatever the page is currently showing (day-strip selection if active, else This Week + Upcoming) as a one-time `.ics` file — always respects the active Importance/Country/Category/Timezone filters. Pure client-side RFC5545 generation + `<a download>` Blob, no new endpoint, no library. Labeled as a one-time download, not a live sync. Full detail: `docs/brain/06_COMPONENTS.md` §3.10.

### MapPage recenter control (`apps/web/app/(dashboard)/map/page.tsx`) (2026-09-25, `a8bace3`)

New "recenter" button next to the existing zoom buttons, using MapLibre's `IControl` interface and the page's existing `map.easeTo()` camera method (no hand-rolled camera math) to snap back to the default view/zoom. Unlike the zoom buttons, this one shows on both mobile and desktop — required narrowing the `globals.css` rule that previously hid the entire bottom-right control corner above `md`. Verified at 375px and desktop via Playwright (pan/zoom, click recenter, confirm exact default view returns at both widths). Full detail: `docs/brain/06_COMPONENTS.md` §3.5f.

### Dashboard price-move chip (`apps/web/app/(dashboard)/dashboard/page.tsx`) (2026-09-25, `a8bace3`)

Every Recent Signal Stream row now shows a small 24h price-move chip for its primary asset (or "—" when none can be matched), reusing the same `/api/prices` lookup already used by `PriceTicker`/watchlist — no new price-lookup logic, no new endpoint. Full detail: `docs/brain/06_COMPONENTS.md` §3.1.

---

## 7a. PUBLIC PAGES (no auth — outside `(dashboard)`, not in `middleware.ts` `PROTECTED`)

### AccuracyPage (apps/web/app/accuracy/page.tsx) (#121, 2026-09-11)

Reads stored `signal_outcomes` only — `GET /v1/accuracy` filters `checkpoint_hours = 48`. The worker also writes 1h/4h/24h rows (#144); this page does not select a horizon. Methodology (48h/`event_date`, volatile/neutral excluded from headline, 20-sample floor, 24h price-distance guard, why not live-recomputed): `17_SIGNAL_ENGINE.md` §7, D22 / ADR 018. Prerequisite #53; quality context #115.

Homepage (2026-09-20) links here from nav, footer, and a dedicated track-record section and does **not** reprint `hit_rate` on `/`.

Public track-record page, server component, `dynamic = "force-dynamic"`. Fetches
`GET /v1/accuracy` directly server-side (`process.env.API_URL`, `cache: "no-store"`)
— same direct-fetch pattern as `app/admin/metrics/page.tsx`, no client-side proxy
route needed since there's no interactivity. Dark-terminal styling matches
`/status` (same header/Logo/footer chrome, `#0e0e0e`/`#131313`/`#3c4a42` tokens).

Renders, always together (never a bare percentage): overall hit rate, avg move
when correct, and sample size (3 `HeadlineStat` cards); a `volatile_neutral_summary`
box kept visually and semantically separate from the hit-rate cards; a permanent,
non-dismissible past-performance disclaimer near the top (no dismiss button, no
localStorage state); a per-asset table (`AssetRow`, `hidden md:block`) with a "not
enough history yet" cell in place of hit rate/avg-move for any asset below
`min_sample_size` — desktop only, 2026-09-24 (`5644617`), since a 520px-wide table
was pushing that message and the avg-move column off-screen on a 311px viewport;
mobile gets a stacked-card equivalent (`AssetCard`, `md:hidden`, same data, no table);
and the
plain-language date range ("Based on N signals scored between … and …"). Contains
**no** "top signals"/"best calls" highlight list anywhere — a hard product rule, not
a style choice, per the #121 spec.

---

## 8. SHARED UI TOKENS (SHADCN COMPONENTS USED)

From shadcn/ui (all code lives in apps/web/components/ui/):
- Button
- Input
- Label
- Card
- Dialog (modals)
- DropdownMenu (user avatar dropdown)
- Select (filter dropdowns)
- Tabs (settings page, alerts page)
- Badge (plan tier, severity)
- Sheet (mobile slide-in panels)
- Toast (success/error notifications)
- Tooltip (icon labels)
- Separator (dividers)
- Skeleton (loading states)
- Form + FormField (react-hook-form integration)
- Accordion (help modal sections)
- Switch (toggles in settings/alerts)
