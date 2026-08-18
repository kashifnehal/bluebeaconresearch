# 09_BACKLOG.md — Complete Product Backlog

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

**Classification: Internal — CTO Level**
**Priority method: MoSCoW (Must / Should / Could / Won't)**

> ⚠️ UPDATED 2026-08-19 — this backlog reflects a much earlier project phase (basic Railway deployment setup, Google OAuth setup, FIFA-appearing-as-a-signal quality bugs). Most items here (M1–M24, and most S-items) are long since resolved; it's kept as a historical record, not a current punch list. Note also that M23 ("Add PORT=8888 env var") was itself based on a since-corrected mistaken belief — the actual backend port default is 3001, not 8888.

---

## MUST HAVE — Ship before any public launch

| # | Item | Effort | Why |
|---|------|--------|-----|
| M1 | Fix Railway: set Root Directory + start command, add billing | 1 hr | Backend offline — nothing works |
| M2 | Create Railway workers service (separate service, start:workers) | 30 min | No signals collected without this |
| M3 | Fix signal quality pre-filter (block FIFA/sports/celebrity) | 2 hr | Top signal is FIFA — product unusable |
| M4 | Fix country extraction from GDELT (UNKNOWN on all signals) | 2 hr | Every signal shows UNKNOWN |
| M5 | Fix duplicate signal detection | 1 hr | Same story appears 3x in feed |
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
| S1 | Economic Calendar page (/calendar) | 3 days | Biggest competitive gap vs all rivals |
| S2 | Price-at-signal display on signal cards | 1 day | Stocknews.ai killer feature, proves value |
| S3 | Central bank rates widget on /watchlist | 2 hr | InvestingLive feature traders love |
| S4 | Morning brief worker (07:45 UTC weekdays) | 1 day | Retention driver, daily habit |
| S5 | Public Telegram channel (@BlueBeaconResearch) | 2 hr | Free signal channel for lead gen |
| S6 | Add outcome-tracker worker (fill outcome_direction) | 1 day | Needed for accuracy tracking |
| S7 | Build /accuracy public page | 1 day | Most powerful marketing asset |
| S8 | Populate settings Notifications tab | 1 day | Tab is empty, users expect it |
| S9 | Populate settings Security tab (change password, sessions) | 1 day | Security feature expected |
| S10 | sitemap.xml and robots.txt | 1 hr | SEO basic requirement |
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
| C3 | Email alerts via Resend | 1 day | Currently only Telegram works |
| C4 | Populate settings Appearance tab (theme toggle) | 1 day | User preference |
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
| C17 | 40-year intel archive (historical signal search) | 2 weeks | Pro tier feature |
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
| WhatsApp alerts | API friction, approval process, cost per message |
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
