# 07_DESIGN_SYSTEM.md — Terminal Design Tokens & UI Specs

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

This document defines the visual design system, color tokens, typography scales, glassmorphism specs, component primitives, animations, and icons for Blue Beacon Research.

---

## 1. Color Tokens & Theme Architecture

The UI is built with a custom dark tactical terminal palette leveraging Tailwind CSS v4 and Stitch UI Material Design tokens:

### Core Surface & Background Tokens
- **`background` / `surface`**: `#131313` (Deep Matte Obsidian Dark)
- **`surface-container-lowest`**: `#0e0e0e` (Deepest Container Background)
- **`surface-container`**: `#201f1f` (Primary Card Surface)
- **`surface-container-high`**: `#2a2a2a` (Elevated Dropdowns & Modals)

### Brand Accent Tokens
- **`primary`**: `#6ffbbe` (Cyan Emerald Signal Glow)
- **`primary-container`**: `#4edea3` (Accent Highlight)
- **`secondary`**: `#72df4d` (Vibrant Market Up Indicator)
- **`error` / `danger`**: `#ffb4ab` / `#93000a` (Critical Alert Red)
- **`outline`**: `#86948a` (Subtle Glass Border)

---

## 2. Typography Scales

- **Body Font**: `Inter`, system-ui, sans-serif.
- **Label / Headers**: `Space Grotesk`, sans-serif.
- **Monospace Ticker & Data Tables**: `JetBrains Mono`, monospace (`font-mono`).

```
Display Large: 32px / Leading 40px (Bold, Space Grotesk)
Heading Medium: 20px / Leading 28px (SemiBold, Inter)
Body Standard: 14px / Leading 20px (Regular, Inter)
Mono Ticker: 12px / Leading 16px (Medium, JetBrains Mono)
```

---

## 3. Component Primitive Design System

### 3.1 Buttons
- **Primary**: Solid emerald glow (`bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-semibold shadow-lg shadow-emerald-500/20`).
- **Destructive**: Alert red (`bg-rose-600 hover:bg-rose-500 text-white`).
- **Outline Glass**: Neutral border (`border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-800 text-neutral-200`).

### 3.2 Glassmorphic Cards & Panels
- **Standard Card**: `border border-neutral-800/80 bg-neutral-900/40 backdrop-blur-md rounded-xl p-5 shadow-2xl`.
- **Hover Micro-interaction**: `transition-all duration-200 hover:border-neutral-700 hover:scale-[1.005]`.

### 3.3 Status Badges & Skeletons
- **Severity Badges**: Color-shifting pill badges based on 1–10 conflict impact.
- **Skeletons**: Pulse loaders (`animate-pulse bg-neutral-800/60 rounded-lg`).

---

## 4. Animations & Micro-Interactions

- `animate-pulse`: Critical severity 9–10 alerts.
- `backdrop-blur-md`: Sticky top bars and modal backdrops.
- `transition-colors duration-150`: Nav items and button hovers.
