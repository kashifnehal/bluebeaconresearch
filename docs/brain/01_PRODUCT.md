# 01_PRODUCT.md — Product Architecture & Page Specifications

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

This document defines every user-facing page and view across the Web Terminal (`apps/web`) and Mobile Application (`apps/mobile`), including routes, component hierarchies, state management, API endpoints, user journeys, and implementation status.

---

## 1. Landing Page (`/`)

- **Route**: `/`
- **Business Purpose**: Converts institutional visitors into waitlist signups or active subscribers. Previews high-impact tactical signals to establish platform authority.
- **Components Used**: `Logo`, `AccessLimitedModalWrapper`, `Button`, `Badge`, `Card`, Lucide Icons (`Shield`, `Zap`, `Globe`, `TrendingUp`, `Bell`, `Key`).
- **API Dependencies**: `/api/prices` (PriceTicker ticker), `/api/waitlist` (Waitlist modal submission).
- **User Journey**: Visitor lands on `/` → Views hero tagline & signal preview → Clicks "Get Early Access" → AccessLimitedModal opens for waitlist email capture.
- **Navigation**: Links to `/login`, `/signup`, `/privacy`, `/terms`.
- **Implementation Status**: **Fully Functional**.
- **Missing Features**: Live interactive backtest demo widget on landing page.

---

## 2. Authentication Pages (`/login`, `/signup`, `/verify`, `/forgot-password`)

- **Route Group**: `(auth)`
- **Business Purpose**: Provides secure user identity creation and Supabase JWT authentication.
- **Components Used**: `Input`, `Button`, `Label`, `Card`, `Logo`.
- **API Dependencies**: Supabase Auth client (`supabase.auth.signInWithPassword`, `supabase.auth.signUp`).
- **User Journey**: User enters credentials → Auth response sets auth cookie → Middleware verifies session and redirects to `/dashboard` or `/onboarding`.
- **Navigation**: Bidirectional switching between Login, Signup, and Reset password views.
- **Implementation Status**: **Fully Functional**.
- **Missing Features**: Single-Sign-On (SSO) for enterprise clients (SAML/Okta).
> ⚠️ UPDATED 2026-08-19 — Custom SMTP (Resend, via Cloudflare DNS) went live, so `Confirm email` is back on and the verified-email signup flow is now the real production path, not a bypassed/OFF setting — full detail in `08_CURRENT_STATUS.md` and `14_CHANGELOG.md` v0.26.0. New missing feature identified, not yet started (founder hasn't decided if it's worth building): **cross-device signup confirmation auto-detect** — the "Check your email" screen doesn't notice if the confirmation link is clicked on a different device than the one waiting on that screen; two implementation paths (polling vs. Supabase Realtime) are scoped in the BBR Claude project's `22_SESSION_HANDOFF.md`.

---

## 3. Onboarding View (`/onboarding`)

- **Route**: `/onboarding`
- **Business Purpose**: Guides new users through tier selection, preferred alert channels (Telegram, Slack), asset watchlist initialization, and default severity triggers.
- **Components Used**: Step-wise wizard cards, `Select`, `Input`, `Button`, `Tabs`.
- **API Dependencies**: `POST /api/users/onboarding` (updates profile tier & onboarding flags in Supabase `profiles`).
- **User Journey**: Post-signup redirect → Select Plan (`Analyst`/`Pro`) → Connect Telegram Chat ID → Set default commodities → Transition to `/dashboard`.
- **Navigation**: Redirects to `/dashboard` upon wizard completion.
- **Implementation Status**: **Fully Functional**.
- **Missing Features**: none remaining here — corrected 2026-08-19: this line previously listed "Interactive onboarding walkthrough overlay for terminal features" as missing, but it shipped 2026-08-16 (a 6-step `react-joyride` tour covering the dashboard + featured event detail page, with a "Replay product tour" option in the Help modal — see `08_CURRENT_STATUS.md`) and was live-verified again 2026-08-19 via a fresh throwaway signup driven through Playwright: all 6 steps fired correctly, completion persisted across a reload. This doc and the 2026-08-18 architecture audit (which separately listed it as "not started") were both stale relative to `08_CURRENT_STATUS.md`, which was correct — same "update the outlier doc" resolution used for the Supabase-ref and port-number conflicts.

---

## 4. Tactical Intel Dashboard (`/dashboard`)

- **Route**: `/dashboard`
- **Business Purpose**: Primary tactical monitoring interface displaying live breaking signal streams, severity breakdown, commodity market impact matrix, and neural AI analysis text.
- **Components Used**: `Sidebar`, `TopBar`, `PriceTicker`, `SignalCard`, `SeverityBadge`, `CommodityChip`, `Skeleton`, `Tabs`.
- **API Dependencies**: `GET /api/signals` (filtered signal feed), `GET /api/prices` (market ticker).
- **User Journey**: User monitors real-time feed → Clicks signal card to expand AI military rationale → Filters by severity ($\ge 7$) or commodity (`USOIL`) → Navigates to `/events/[id]` for deep-dive.
- **Navigation**: Accessible from primary sidebar navigation.
- **Implementation Status**: **Fully Functional**.
- **Missing Features**: Audio notification trigger on breaking severe signal ($\ge 9$).

---

## 5. GIS Conflict Map (`/map`)

- **Route**: `/map`
- **Business Purpose**: Visualizes spatial geopolitical risk density and event coordinates overlaying global commodity pipelines, maritime straits, and refinery hubs.
- **Components Used**: `MapLibre GL` map canvas (OpenStreetMap raster tiles), custom HTML marker pins, severity popups, `Sidebar`, `TopBar`.
- **API Dependencies**: `GET /api/signals?has_coords=true` (lat/lng signal list).
- **User Journey**: User selects region (e.g. Middle East) → Map zooms to conflict cluster → Hover/Click pin opens signal summary card with direct link to full event.
- **Navigation**: Accessible from primary sidebar navigation.
- **Implementation Status**: **Fully Functional**.
- **Missing Features**: Pipeline layer toggle and AIS maritime shipping vessel tracking overlay.

---

## 6. Alert Rules Engine (`/alerts`)

- **Route**: `/alerts`
- **Business Purpose**: Empowers traders to configure custom filter rules for multi-channel dispatch (Telegram, Slack, HTTP Webhooks, Push) based on region, commodity, and minimum severity.
- **Components Used**: `Dialog`, `Select`, `Input`, `Button`, `Table`, `Badge`, `Switch`.
- **API Dependencies**: `GET /api/alerts`, `POST /api/alerts`, `DELETE /api/alerts/[id]`, `POST /api/telegram/test`.
- **User Journey**: Click "Create Rule" → Select commodity (`GOLD`), region (`Middle East`), min severity (`8`) → Choose dispatch channel (`Telegram`) → Save Rule.
- **Navigation**: Accessible from primary sidebar navigation.
- **Implementation Status**: **Fully Functional**.
> ⚠️ UPDATED 2026-08-19 — Alert dispatch (Slack/webhook/push) was fixed 2026-08-18 after being completely non-functional (no collector ever triggered dispatch). Telegram specifically is still non-functional as a dispatch channel: `TELEGRAM_BOT_TOKEN` is not configured, deferred by founder decision.
- **Missing Features**: Dynamic threshold triggers based on % price volatility changes.

---

## 7. Strategy Backtesting Suite (`/backtesting`)

- **Route**: `/backtesting`
- **Business Purpose**: Allows quantitative risk managers to evaluate historical signal accuracy and signal-driven commodity price movements across historical conflict windows.
- **Components Used**: Line chart components, parameter input sliders, historical event selection dropdowns, metric cards (Sharpe Ratio, Max Drawdown, Win Rate).
- **API Dependencies**: `POST /api/backtesting/run` (executes simulation algorithm against `commodity_prices` and `signals`).
- **User Journey**: Select Asset (`Brent Oil`) → Set historical window → Set entry trigger severity ($\ge 7$) → Click "Run Backtest" → Analyze equity curve and performance metrics.
- **Navigation**: Accessible from primary sidebar navigation.
- **Implementation Status**: **Fully Functional**.
- **Missing Features**: Export backtest result execution report as PDF/CSV.

---

## 8. Asset Watchlist (`/watchlist`)

- **Route**: `/watchlist`
- **Business Purpose**: Tracks user-selected physical commodities and currency pairs (`USOIL`, `GOLD`, `NG`, `COPPER`, `EURUSD`), providing aggregated signal correlation feeds.
- **Components Used**: Asset price grid cards, 24h delta indicators, correlated signal sub-feed.
- **API Dependencies**: `GET /api/prices`, `GET /api/signals?commodity={symbol}`.
- **User Journey**: User monitors watchlist → Clicks asset card (`USOIL`) → Feed filters to only show events impacting Crude Oil.
- **Navigation**: Accessible from primary sidebar navigation.
- **Implementation Status**: **Fully Functional**.
- **Missing Features**: TradingView embedded chart modal.

---

## 9. Settings & Institutional API Keys (`/settings`)

- **Route**: `/settings`
- **Business Purpose**: Manages user profile details, plan tier upgrades, webhook endpoint configurations, and secret API key generation for enterprise REST integration.
- **Components Used**: `Tabs` (Profile, API Keys, Webhooks, Billing), `Input`, `Button`, `Table`.
- **API Dependencies**: `GET /api/api-keys`, `POST /api/api-keys`, `GET /api/webhooks`, `POST /api/webhooks`.
- **User Journey**: Navigate to API Keys tab → Click "Generate New Key" → Copy secret key → Configure webhook URL for automated POST dispatch.
- **Navigation**: Accessible from primary sidebar navigation.
- **Implementation Status**: **Fully Functional**.
- **Missing Features**: Stripe self-serve plan upgrade portal UI integration.

---

## 10. Event Deep-Dive Page (`/events/[id]`)

- **Route**: `/events/[id]`
- **Business Purpose**: Provides granular forensic breakdown of a single conflict event, including raw news source links, military assessment, complete AI prompt dump, and spatial coordinates.
- **Components Used**: Full-width signal header, GIS mini-map pin, original news citation list, commodity impact breakdown grid.
- **API Dependencies**: `GET /api/events/:id`.
- **User Journey**: Click signal card on Dashboard or Map pin → Direct routing to `/events/[id]` → Audit raw news source and military breakdown.
- **Navigation**: Direct URL link from Dashboard or Map pins.
- **Implementation Status**: **Fully Functional**.
> ⚠️ UPDATED 2026-08-19 — `events/[id]/page.tsx` still has the same broken Tailwind-token pattern that was fixed on 7 other files (SignalCard, SeverityBadge, CommodityChip, PriceTicker, Logo, forgot-password, verify) on 2026-08-18 — this page was not in scope for that fix and remains unfixed.
- **Missing Features**: Social share image auto-generator (OG image generator).
