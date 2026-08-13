# 14_CHANGELOG.md — Project Evolution & Chronological History

**Classification: Internal — CTO Level**

---

## PHASE 0 — ORIGINAL IDEA (Pre-project)

**Starting point:** The idea emerged from a simple frustration — commodity traders and importers consistently find out about geopolitical events AFTER markets have already moved. The Houthi Red Sea attacks in late 2023 were a perfect example: businesses that imported goods via that route found out about the disruption from their suppliers, not from any early-warning system.

**Original concept:** A news aggregation tool specifically for Indian commodity traders on MCX/NSE. India-focused. WhatsApp-native alerts. Simple severity scoring.

**Original name:** GeoSignal (later renamed Blue Beacon Research)

**Why India-first was discussed:** India has 2.5M+ active commodity derivatives traders. Large, underserved market. WhatsApp penetration is near-universal.

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
