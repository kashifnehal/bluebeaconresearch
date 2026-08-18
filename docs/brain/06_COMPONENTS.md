# 06_COMPONENTS.md — React & React Native Component Inventory

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

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
- **Purpose**: Primary vertical terminal navigation sidebar.
- **Props**: None.
- **Parent**: `(dashboard)/layout.tsx`
- **Children**: `Logo`, Lucide Nav Icons (`LayoutDashboard`, `Globe`, `Bell`, `BarChart3`, `Eye`, `Settings`).
- **Hooks Used**: `usePathname()` from Next.js navigation.
- **Styling**: `w-64 border-r border-neutral-800 bg-neutral-950/80 flex flex-col`.

### 2.2 `TopBar.tsx`
- **Purpose**: Header bar featuring search input, live latency status indicator, market price ticker, and user auth dropdown.
- **Props**: None.
- **Parent**: `(dashboard)/layout.tsx`
- **Children**: `PriceTicker`, `DropdownMenu`, `Avatar`.
- **Hooks Used**: `useMe()`, `useAuthStore()`.
- **Styling**: `h-14 border-b border-neutral-800 bg-neutral-950/60 backdrop-blur-md flex items-center justify-between px-4`.

### 2.3 `PriceTicker.tsx`
- **Purpose**: Scrolling real-time 24h ticker bar displaying physical commodity prices (`USOIL`, `GOLD`, `NG`, `COPPER`).
- **Props**: None.
- **Parent**: `TopBar.tsx`
- **Hooks Used**: `useQuery` fetching `/api/prices` every 15 seconds.
- **Styling**: Monospaced font display (`font-mono text-xs`), green/red color deltas (`text-emerald-400` / `text-rose-400`).

---

## 3. Tactical Intelligence Components (`apps/web/components/signals`)

### 3.1 `SignalCard.tsx`
- **Purpose**: Main card rendering a single intelligence signal event with expandable AI summary.
- **Props**: `{ signal: Signal; onSelect?: () => void }`
- **Parent**: `(dashboard)/dashboard/page.tsx`
- **Children**: `SeverityBadge`, `CommodityChip`, `Button`.
- **Hooks Used**: `useState` for expand/collapse toggle.
- **Styling**: `p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:border-neutral-700 transition-all`.

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
- **Props**: `{ symbol: string; impact: 'BULLISH' | 'BEARISH' | 'VOLATILE' }`
- **Styling**: Pill tag with directional arrow icon (`TrendingUp` green, `TrendingDown` red).

---

## 4. Primitives & UI Component Suite (`apps/web/components/ui`)

- `button.tsx`: Radix UI slot wrapper with variants (`default`, `destructive`, `outline`, `ghost`, `link`).
- `dialog.tsx`: Accessibility-compliant Radix modal dialog overlay.
- `dropdown-menu.tsx`: Contextual dropdown menu for settings and user profiles.
- `sheet.tsx`: Mobile slide-out drawer panel.
- `skeleton.tsx`: Loading shimmer placeholder block (`animate-pulse bg-neutral-800`).
- `sonner.tsx`: High-performance toast notification host.
