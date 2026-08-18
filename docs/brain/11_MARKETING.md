# 11_MARKETING.md — Product Positioning & Marketing Strategy

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

This document specifies the marketing strategy, value proposition, landing page copy audit, CTA conversion funnels, positioning, and SEO architecture for Blue Beacon Research.

---

## 1. Product Positioning Statement

> **For** commodities traders, risk managers, and macro hedge funds,  
> **Who** need sub-second, actionable intelligence on geopolitical conflict risks impacting energy and physical assets,  
> **Blue Beacon Research** is a real-time tactical intelligence terminal  
> **That** automatically ingests global conflict feeds, synthesizes event data with Anthropic Claude 3.5, and dispatches sub-second trading alerts.  
> **Unlike** traditional news terminals (Bloomberg, Reuters) that deliver unstructured text with 30-minute delays,  
> **Our product** couples geopolitical event coordinates directly with quantitative commodity asset impacts (`USOIL`, `GOLD`, `NG`, `COPPER`).

---

## 2. Landing Page Copy & Messaging Audit (`/`)

### Hero Section Copy

- **Headline**: "High-fidelity geopolitical intelligence → actionable trading signals."
- **Subheadline**: "Blue Beacon Research provides high-fidelity geopolitical intelligence, synthesized into actionable trading signals for commodity and financial markets."
- **Live Status Pill**: `Live — monitoring active global conflicts` (Pulsing green indicator).
- **Primary CTA**: "Start Free" (`/signup`) / "Get Early Access" (Opens Waitlist Modal when `isProjectReady` is gated).

### Core Features Value Props

1. **Autonomous 15-Minute Ingestion**: 350+ global conflict events collected from GDELT, ACLED, and GNews.
2. **AI Military Rationale**: Claude 3.5 Sonnet severity scoring (1–10) and asset confidence ratings (0–100%).
> ⚠️ UPDATED 2026-08-19 — Anthropic API credit is currently exhausted; the heuristic classifier fallback is what's actually scoring signals right now, not live Claude classification.
3. **Sub-second Alerting**: Instant dispatch via Telegram Bots, Slack Webhooks, custom HTTP webhooks, and Expo Mobile Push.
> ⚠️ UPDATED 2026-08-19 — Alert dispatch itself was fixed 2026-08-18 (collectors now call `dispatchAlertsForSignal()` inline), but Telegram specifically is still not functional — `TELEGRAM_BOT_TOKEN` is not configured anywhere, deferred by founder decision.
4. **Interactive GIS Heatmap**: MapLibre GL spatial conflict density mapping using OpenStreetMap tiles.

---

## 3. Search Engine Optimization (SEO) & OpenGraph Setup

- **Metadata Title**: `Blue Beacon Research | Tactical Market Intelligence`
- **Meta Description**: `High-fidelity geopolitical intelligence → actionable trading signals.`
- **Semantic HTML**: `<h1>` tag in hero section, `<header>`, `<main>`, `<section>`, `<footer>` structure.
- **Sitemap & Robots**: `apps/web/app/sitemap.ts` and `apps/web/app/robots.ts` generate standard XML sitemap and search engine crawler instructions.
