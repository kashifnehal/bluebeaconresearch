# 00_PROJECT.md — Blue Beacon Research: Project Foundation

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

**Classification: Internal — CTO Level**
**Last Updated: August 2026**
**Document Owner: Founding CTO**

---

## 1. PROJECT VISION

Blue Beacon Research is a **geopolitical intelligence platform** that converts global events — conflicts, sanctions, policy shifts, central bank decisions, supply chain disruptions — into structured, actionable market signals delivered in real time to traders, analysts, and businesses with commodity or financial market exposure.

The core bet: there is a massive, underserved gap between expensive institutional intelligence (Bloomberg at $24K/year, Stratfor at $40K/year, Palantir at enterprise pricing) and the free-but-noisy tools that retail traders and SMB operators currently use. Blue Beacon Research fills that gap at $49–$499/month with self-serve access, no sales call, and no annual contract.

---

## 2. MISSION

**"Convert global uncertainty into structured market intelligence — accessible to anyone who needs it, not just those who can afford Bloomberg."**

The mission has two components:
1. **Intelligence**: Monitor every significant geopolitical event on earth, classify its market implications with AI, and surface only what is material to market outcomes.
2. **Accessibility**: Deliver this intelligence through a self-serve platform at a price point any independent trader or SMB can afford, with alerts delivered to wherever the user already lives (Telegram, email, Slack).

---

## 3. CORE PHILOSOPHY

### 3.1 Signal Over Noise
The platform deliberately avoids showing everything. At peak, GDELT processes 500+ events per 15-minute cycle. Blue Beacon Research shows 5–20 per day. The value is in the filtering, not the firehose.

### 3.2 Intelligence, Not Advice
BBR is legally and philosophically positioned as an **intelligence layer**, not a trading advisory. Every signal says "here is what happened, here is what it historically means for markets, here is the confidence level." It never says "buy" or "sell." This is both a legal protection and a product philosophy — users are professionals who can draw their own conclusions.

### 3.3 Research Firm Framing
BBR presents itself as a **research firm with AI capabilities**, not an "AI tool." The language throughout the product uses: "our research team," "intelligence analysts," "synthesis," "briefing." This is deliberate. Users distrust "AI wrappers." They trust research firms. The framing must never break — never say "our AI" in the UI, always say "our analysts" or "our intelligence engine."

### 3.4 Speed Over Completeness
A signal card that arrives in 2 minutes with 80% accuracy is worth more than a 20-minute deep report. The platform optimizes for first-mover advantage: users need to know about the Houthi strike before markets open, not after CNBC covers it.

### 3.5 Clarity Over Complexity
Every signal answers one question: **"What does this mean, and why does it matter?"** No raw data dumps. No complex dashboards with 25 layers. One focused answer per event.

---

## 4. LONG-TERM VISION

**Phase 1 (Year 1): Geopolitical → Commodity Signal Platform**
Build the best affordable geopolitical intelligence tool for commodity traders and businesses with physical supply chain exposure. Nail signal quality. Prove accuracy. Grow to 1,000 paying customers.

**Phase 2 (Year 2): Macro Intelligence Expansion**
Add economic calendar integration (scheduled macro events: CPI, Fed decisions, NFP). Add central bank rates tracker. Add supply chain disruption alerts. Become the complete "macro + geopolitical" intelligence layer.

**Phase 3 (Year 3): Institutional Products**
White-label API for hedge funds, commodity trading firms, and corporate treasury teams. Multi-seat enterprise plans. Custom signal feeds by sector. Scenario modeling tools. Potential to license the data pipeline itself.

**Phase 4 (Year 4+): Decision Intelligence**
Move from signals to recommendations: "Given this geopolitical event pattern, here are the historical playbooks from similar situations." Position as Palantir for SMBs.

---

## 5. WHAT WE ARE NOT BUILDING

These were explicitly discussed and rejected or deferred:

1. **Not a financial advisory platform.** No buy/sell recommendations. Ever. Legal liability is too high and it would undermine the intelligence framing.

2. **Not a stock screener.** Individual equities are not our focus. Stocknews.ai covers that. Our market is commodity and macro traders.

3. **Not a technical analysis tool.** No RSI, MACD, Bollinger Bands. We are fundamentals-driven, not technical.

4. **Not a portfolio management tool.** Users manage their own portfolios with their own tools. We provide intelligence, not portfolio tracking.

5. **Not a crypto tracking platform.** Crypto was discussed and explicitly deferred — too crowded, different audience.

6. **Not a general news aggregator.** We are not Reuters, Bloomberg News, or Google News. We are a signal engine, not a news feed.

7. **Not a 25-layer OSINT dashboard.** WorldMonitor already exists and is free with 59K GitHub stars. Competing on breadth of data layers is a losing strategy. We compete on depth of analysis and personalization.

8. **Not a military intelligence tool.** Despite the dark terminal aesthetic, BBR is for market participants, not government agencies or defense contractors.

9. **Not India-specific.** Originally discussed as an India-focused product, this was explicitly rejected. BBR is a global platform with world-focused positioning.

---

## 6. TARGET USERS

### Primary Users (Who Pays)

**Tier 1: Individual Commodity Traders**
- Trades crude oil, gold, wheat, natural gas futures on exchanges (MCX, CME, ICE, NYMEX)
- Retail or semi-professional
- Does not have access to Bloomberg Terminal ($24K/year)
- Currently cobbling together information from Twitter, CNBC, WhatsApp groups
- Pain point: finds out about overnight geopolitical events AFTER markets have already moved
- Willingness to pay: $49–$199/month
- Size of market: not independently sourced as of 2026-08-30 (see market-size note below)

**Tier 2: Small Investment Teams / Independent Analysts**
- 2–10 person shops: boutique hedge funds, family offices, independent research shops
- Have Bloomberg for data but need faster geopolitical context
- Pain point: manually monitoring geopolitical developments is a full-time job
- Willingness to pay: $199–$499/month per seat
- Size of market: not independently sourced as of 2026-08-30 (see market-size note below)

**Tier 3: Import/Export SMBs**
- Businesses importing commodities with direct price exposure: food importers, fuel distributors, textile manufacturers using cotton/synthetic inputs
- Currently have NO early warning system for supply chain geopolitical risk
- Pain point: found out about Black Sea grain disruption from their supplier, not before
- Willingness to pay: $49–$199/month
- Size of market: not independently sourced as of 2026-08-30 (see market-size note below)

**Tier 4: Quant/Algo Traders (API Tier)**
- Building automated trading systems that need structured geopolitical signal data
- Need JSON API with webhook delivery
- Want signal taxonomy that maps to commodity instrument codes
- Willingness to pay: $499/month for API access
- Size of market: not independently sourced as of 2026-08-30 (see market-size note below)

> **Market-size note (2026-08-30):** The per-tier population figures previously stated in this section ("2.5M+", "~800K", "800K+", "~50K") were not traceable to any regulator, exchange body, or trade-association count and have been removed rather than replaced with a new estimate. Do not reintroduce a precise figure until one can be cited to a checkable source. See internal research on user segments and market scope, and ADR 012 (`docs/brain/10_DECISIONS.md`) / D16 (`docs/claude_project/10_DECISIONS.md`).

### Secondary Users (Free Tier, Convert Later)
- Financial journalists needing market context
- Graduate students doing economic research
- Political risk analysts at NGOs
- Defense policy researchers

---

## 7. PRODUCT POSITIONING

**Against Bloomberg/Stratfor/Palantir:**
"Same caliber of intelligence, 1/40th the price, self-serve in 5 minutes."

**Against WorldMonitor (closest free competitor):**
"WorldMonitor shows you the world. Blue Beacon Research tells your specific position what to expect next."

**Against Glint.trade (prediction markets):**
Different market entirely — Glint maps events to Polymarket odds. BBR maps events to commodity prices. Different customer.

**Against Geo-Front:**
Geo-Front is a Middle East conflict map. No signals, no alerts, no market implications. Not a competitor.

**Against FinancialJuice/InvestingLive:**
They give you headlines in seconds. BBR gives you analysis in 2 minutes. We are not competing on speed — we are competing on intelligence depth.

**The Specific Positioning Statement:**
"Blue Beacon Research is the geopolitical alert and signal delivery system for commodity traders and businesses with market exposure — built for people who need to know BEFORE markets open, not after."

---

## 8. ONE-SENTENCE ELEVATOR PITCH

**"Blue Beacon Research converts global conflicts, sanctions, and policy shifts into structured market signals — delivered to your Telegram before markets open, for 1/40th the cost of Bloomberg."**

---

## 9. BRAND IDENTITY

**Name:** Blue Beacon Research

**What "Blue Beacon" means:**
- "Beacon" = a signal light, a warning, something that guides ships through dangerous waters — directly maps to our product
- "Blue" = professional, trusted, calm under pressure (contrast with the red/orange danger signals in the product)
- "Research" = positions us as a research firm, not a tech startup or AI tool

**Tagline Options Used:**
- "High-fidelity geopolitical intelligence → actionable trading signals."
- "Intelligence before markets move."
- "The signal, not the noise."

**Visual Identity:**
- Dark terminal aesthetic (professional, Bloomberg-like)
- Green accent (#10B981) — not typical finance green/red, distinctive
- All-caps section labels (TACTICAL MODULES, ACCESS TIERS)
- Monospace font for data (JetBrains Mono)
- Inter for all body text
- "Operator" language throughout (not "user" — "analyst," "operator," "node")

**Domain:** bluebeaconresearch.com ✓ (live)
**API Domain:** api.bluebeaconresearch.com ✓ (configured, currently offline)

> ⚠️ UPDATED 2026-08-19 — this is stale; the Railway backend API is confirmed operational (`api.bluebeaconresearch.com` healthcheck passing), not offline.

---

## 10. WHAT THIS PROJECT IS NOT ALLOWED TO BE

These guardrails were established and must be maintained by any future CTO:

1. Must never make buy/sell recommendations
2. Must never position as "an AI tool" — always "AI-powered research platform with analyst team"
3. Must never focus only on India — global positioning is non-negotiable
4. Must never clutter the UI with data layers — simplicity is the product
5. Must never compete on breadth against WorldMonitor — compete on depth and personalization
6. Must never promise specific returns or accuracy guarantees in marketing
7. Must always include the disclaimer: "Intelligence for informational purposes only. Not financial advice."
