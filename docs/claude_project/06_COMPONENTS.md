# 06_COMPONENTS.md — Frontend Component Reference

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

**Framework:** Next.js 16 + React 18 + TypeScript
**Component library:** Shadcn/ui (Radix UI primitives)
**Styling:** Tailwind CSS + CSS variables
**Classification: Internal — CTO Level**

---

## 1. LAYOUT COMPONENTS

### Sidebar (apps/web/components/layout/Sidebar.tsx)
**Used in:** (dashboard)/layout.tsx
**Fixed left, 200px wide on desktop. Hidden on mobile (replaced by bottom nav)**

Props: None (reads auth + route from hooks)

Sections:
- Logo: "● BLUE BEACON RESEARCH" (blue dot accent)
- Nav items (each 44px height, hover bg-elevated, active: green left border + text-accent):
  - Intelligence Feed → /dashboard
  - Global Map → /map
  - Alerts → /alerts (+ red badge with unread count from useUIStore)
  - Watchlist → /watchlist
  - Backtesting → /backtesting
  - Settings → /settings
- Bottom section:
  - "Node: BB-ALPHA-09" text (cosmetic)
  - Help link → opens HelpModal
  - Logout button → supabase.auth.signOut()

Active state detection: usePathname() from next/navigation.

---

### TopBar (apps/web/components/layout/TopBar.tsx)
**Used in:** (dashboard)/layout.tsx
**Sticky top, full width minus sidebar**

Contains:
1. **Search input** — placeholder "Search signals, coordinates, entities..."
   - Controlled: useState('') debounced 300ms
   - onChange: updates useFeedStore.searchQuery
   - onEnter: calls /v1/signals?search=query
   - Shows X clear button when query non-empty

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
   - Dropdown: user name, email, divider, Settings link, Sign Out button

5. **"Terminal Sentinel v2.4.0-STABLE" + username** — cosmetic brand text, top right

---

### NotificationPanel (apps/web/components/NotificationPanel.tsx)
**Position:** Fixed right-side drawer, 360px wide, slides in from right
**Trigger:** Bell icon in TopBar

Content:
- Header: "Recent Alerts" + close X + "Mark all read" button
- List: last 10 alerts_sent from GET /v1/alerts/recent
- Each item: severity colored dot + time ago + signal title + "View →" link
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

### HelpModal (apps/web/components/HelpModal.tsx)
**Position:** Centered modal overlay
**Trigger:** ? icon in TopBar

Content (5 accordion sections):
1. **Reading signal cards** — severity 1–10 explanation, confidence %, direction
2. **Setting up Telegram alerts** — step by step: find @BlueBeaconBot → /connect [code]
3. **Using the map** — click dots, Global Tension Index explanation
4. **Backtesting** — how to use, disclaimer about demo data
5. **Contact support** — mailto:support@bluebeaconresearch.com

Close: X button or click outside overlay.

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
- "ANALYZE IMPACT →" button → /events/[signal.id]
- Price-at-signal row (if price_at_signal populated and signal < 72h):
  "WTI at signal: $84.20 | Now: $87.31 +3.7% ↑ · 4h 23m ago"

**Grid variant** (2-column grid):
- Source + timestamp top row
- Title (2 lines max, line-clamp-2)
- Summary (2 lines max)
- Region + severity tags
- Entire card clickable → /events/[signal.id]

**Compact variant** (Recent Signal Stream):
- Severity colored dot
- Timestamp (font-mono)
- Title (flex-1, truncated)
- Confidence badge
- Chevron →
- Entire row clickable → /events/[signal.id]

**Breaking state** (is_breaking = true):
- Left border: border-l-4 border-danger
- Background: bg-danger-subtle
- "BREAKING" badge prepended to title

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
Props: `{ asset: string, direction: Direction, confidence: number, size?: 'sm' | 'md' }`

Direction color map:
```
up:       bg-success-subtle text-price-up   "USOIL ↑"
down:     bg-danger-subtle  text-price-down "WHEAT ↓"
volatile: bg-warning-subtle text-warning    "XAUUSD ↕"
neutral:  bg-secondary      text-muted      "NGAS –"
```

Size 'md': shows confidence % after direction arrow.
Shape: rounded-full pill.

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

### LiveSignalPreview (apps/web/components/landing/LiveSignalPreview.tsx)
**Shows on landing page — first thing visitor sees after hero**

Fetches: GET /v1/signals/latest (cached 60s)
Shows: Most recent signal as a full SignalCard (large variant)
Blur: Lower 40% of card blurred with gradient overlay
Overlay text: "Sign up to see full analysis →"
CTA button: "AUTHORIZE FULL ACCESS →" → /signup

If no signals in DB: shows hardcoded example card.

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
