# 02_BUSINESS.md — Business Model, Pricing, Market Strategy

**Classification: Internal — CTO Level**

---

## 1. BUSINESS MODEL

Blue Beacon Research is a **B2C and B2SMB SaaS subscription business** with a B2B API tier.

Revenue streams in priority order:
1. Monthly subscriptions (primary — tiers below)
2. Annual subscriptions (discounted 20%, better cash flow)
3. API access tier ($499/mo — highest ARPU)
4. Future: white-label licensing to financial institutions

The model is recurring revenue with low marginal cost per user. Infrastructure costs are largely fixed (Railway, Supabase, Upstash). Claude AI cost is the primary variable cost and scales with events processed, not with users.

---

## 2. PRICING TIERS

### Tier 01: Monitor — $0/month (Free)
**Features:**
- Delayed signal feed (4-hour delay vs real-time)
- Limited map access (map renders, no conflict pins)
- Base analytics (dashboard with limited history)
- No Telegram alerts
- 20 signals/day visible

**Purpose:** Acquisition funnel. Get users in the door. Show them real signals (delayed). They feel the value gap when a real-time user mentions a signal they saw 4 hours later.

**Conversion mechanism:** Every delayed signal shows "This alert was delivered to Analyst members 4 hours ago." with upgrade CTA.

### Tier 02: Analyst — $49/month
**Features:**
- Real-time signal feed
- Full map layers with conflict pins
- Uplink alerts (Telegram + Email)
- Sentinel Synthesis (Claude AI full briefings)
- All commodities tracked
- 30-day history

**Target user:** Individual commodity trader, independent analyst, SMB risk manager

**Price justification:** $49/month = $1.63/day. One informed trade decision pays for 6 months.

### Tier 03: Pro — $199/month
**Features:**
- Full REST/WS API access (read-only)
- 40-year intel archive (planned — historical signals)
- Scenario Lab access (backtesting with real data)
- Multi-user node (up to 3 seats)
- Priority signal delivery (< 60 second Telegram latency)
- CSV export
- Webhook delivery

**Target user:** Small fund, 2-person research shop, active prop trader

### Tier 04: API / Institutional — $499/month (not yet publicly listed as 4th tier)
**Features:**
- Full REST API + WebSocket stream
- Structured JSON signal feed
- Webhook delivery with custom filters
- bb_live_ API key management
- 5 API keys
- Rate limit: 1,000 requests/hour
- All signals in real-time
- Priority support

**Target user:** Quant/algo trader building automated systems, boutique fund with tech team

---

## 3. CURRENT BILLING STATUS

**As of August 2026:**
- Stripe: fully stubbed (all code commented out / placeholder)
- All users: hardcoded to 'pro' plan via SQL update
- No one is being charged
- Billing should remain stubbed until first person asks to pay
- When implementing: See 03_ARCHITECTURE.md for Stripe integration notes

**Stripe products to create when ready:**
```
Product 1: "BBR Monitor" — $0/mo (free, no Stripe product needed)
Product 2: "BBR Analyst" — $49/mo recurring
Product 3: "BBR Pro" — $199/mo recurring
Product 4: "BBR API" — $499/mo recurring
Annual variants for each (20% discount):
  Analyst Annual: $470.40/yr (~$39.20/mo)
  Pro Annual: $1,910.40/yr (~$159.20/mo)
  API Annual: $4,790.40/yr (~$399.20/mo)
```

**Stripe webhook events to handle:**
- checkout.session.completed → update subscriptions table + profiles.plan_tier
- customer.subscription.updated → update plan tier
- customer.subscription.deleted → downgrade to 'free'
- invoice.payment_failed → status = 'past_due', send Resend email

---

## 4. CUSTOMER PERSONAS (FULL)

### Persona 1: "The Active Trader" — Ahmed
- Age: 34, Dubai-based
- Trades crude oil futures on CME, 3-5 contracts at a time
- Has a Bloomberg login through his firm but it's shared and expensive
- Wakes up at 6am to check overnight news before markets open
- Currently uses: Twitter FinTwit list, CNBC, WhatsApp trading group
- Pain: Houthi Red Sea attacks started overnight. He found out when his positions were already down 2%
- BBR value: Telegram alert at 3am about Hormuz tension. He's positioned before London open.
- WTP: $49-$199/month comfortably. "One saved trade pays for a year."
- Acquisition: Twitter FinTwit, Product Hunt

### Persona 2: "The Importer" — Priya
- Age: 41, Mumbai-based
- Runs a vegetable oil import business, 200+ crore annual turnover
- Imports sunflower oil from Ukraine, palm oil from Malaysia
- Has no geopolitical risk tool whatsoever
- Found out about Black Sea disruption from her Ukrainian supplier (after prices had already moved)
- Pain: Supply chain shock → forced to buy at higher spot price → margin hit
- BBR value: Early warning when Ukraine grain routes are threatened. Has 2-3 weeks more lead time to hedge or find alternative suppliers.
- WTP: $49-$99/month. Frames it as business insurance, not a trading tool.
- Acquisition: LinkedIn, WhatsApp business groups, commodity trade associations

### Persona 3: "The Boutique Analyst" — Marcus
- Age: 29, London-based
- Works at a 5-person macro hedge fund
- Tasked with monitoring geopolitical risk across EM markets
- Currently has: Bloomberg, Refinitiv, and manually scanning 30 RSS feeds
- Pain: RSS feeds are raw noise. He spends 3 hours/day filtering. The AI synthesis would save 2 of those hours.
- BBR value: Pre-filtered, AI-classified signals with market implications. The GDELT + ACLED sourcing gives him structured data he can cite.
- WTP: $199/month personally approved or $499 on company card.
- Acquisition: LinkedIn, Hacker News, r/algotrading

### Persona 4: "The Algo Builder" — Yuki
- Age: 27, Singapore-based
- Building a quantitative macro strategy. Wants geopolitical signals as a factor.
- Currently has no structured geopolitical data source. GDELT is too raw.
- Pain: Needs structured JSON with commodity impact + direction + confidence. Building it himself would take months.
- BBR value: API tier. Webhook delivery. Ready-to-use signal taxonomy that maps to commodity futures.
- WTP: $499/month for the API tier without hesitation if the data quality is proven.
- Acquisition: r/algotrading, Hacker News, GitHub (open source OSINT community)

---

## 5. MARKET SIZE

**Geopolitical Risk Analytics Market:**
- 2025 size: $4.02 billion (SNS Insider)
- 2035 projection: $15.26 billion
- CAGR: 14.3%
- AI & Predictive Analytics sub-segment CAGR: 17.42% (fastest growing)
- Supply Chain Risk sub-segment CAGR: 17.88%

**OSINT Market:**
- 2025 size: $12.7 billion
- CAGR: 26.7%

**Why we win despite market size:**
- 99% of the $4.02B market is enterprise contracts: Bloomberg, Palantir, Refinitiv
- The SMB/retail slice ($500M+ estimated) is almost completely unserved
- No competitor has built a self-serve, sub-$500/month geopolitical intelligence product for traders

**Immediate addressable markets:**
- 2.5M+ active retail derivatives traders globally (at $49/month each = $1.47B TAM)
- 800K import/export SMBs with commodity exposure (at $99/month = $950M TAM)
- 50K quant/algo builders (at $499/month = $299M TAM)

---

## 6. COMPETITOR POSITIONING (FULL)

### 6.1 Bloomberg Terminal
- Price: $24,000/year ($2,000/month)
- Requires: corporate account, annual contract, sales negotiation
- Target: Institutional professionals
- BBR position: "Same intelligence quality. Self-serve. 1/40th the price."
- Users who can't afford Bloomberg are our primary market

### 6.2 Stratfor / Geopolitical Futures
- Price: $5,000–$40,000/year
- Format: Written reports, not real-time signals
- Target: Government, corporate strategy teams
- BBR position: "Real-time alerts vs. weekly PDF reports. We win on speed."

### 6.3 Palantir
- Price: Enterprise contract, $1M+
- Target: US government, Fortune 100
- Not a competitor at all — different universe

### 6.4 Recorded Future
- Price: $15,000+/year
- Target: Cybersecurity and threat intelligence teams
- Different use case — cyber threats, not commodity market signals

### 6.5 WorldMonitor.app (BIGGEST THREAT)
- Price: Free (open source) + Pro tier (price undisclosed, recently launched)
- GitHub stars: 59,000+ (was 41K, grew rapidly)
- Users: 2M+ on free platform
- What they have:
  - 500+ feeds aggregated
  - AI analyst chat (Pro)
  - Daily digests (Pro) to Slack/Discord/Telegram/Email
  - 21-language support
  - Sub-sites: finance.worldmonitor.app, commodity.worldmonitor.app, energy.worldmonitor.app
  - MCP connectors for Claude/GPT
  - Polymarket odds integration
  - Live webcams (Tehran, Kyiv, Jerusalem, Taipei)
  - Country Resilience Index for 196 countries
- What they DON'T have:
  - Personalized alerts per user profile (customized per region/commodity)
  - Commodity-specific backtesting
  - Trader-first UX (they are analyst-first)
  - Supply chain context ("your specific supplier route is at risk")
  - Economic calendar integrated with signal generation
  - Self-serve setup in 5 minutes (requires self-hosting for full features)
- BBR strategy vs WorldMonitor:
  - Don't compete on breadth (they win)
  - Compete on personalization + alerts + trader context
  - WorldMonitor shows you the world. BBR tells your specific position what to expect next.

### 6.6 Glint.trade
- What it is: Real-time intelligence for prediction markets (Polymarket, Kalshi)
- Target: Crypto/DeFi prediction market bettors
- Launched ~2024, public beta
- NOT a competitor — completely different customer (bettors vs traders)
- Interesting: WorldMonitor has started integrating Polymarket, potentially pulling Glint's audience

### 6.7 Geo-Front.com
- What it is: Middle East conflict map, Iran-Israel focus
- No signals, no alerts, no market implications, no subscriptions
- Not a competitor — it's a news site with a map
- Target: News readers, not traders

### 6.8 FinancialJuice
- What it is: Real-time headlines + audio squawk + economic calendar
- Key feature: Audio squawk (voice reads headlines instantly)
- BBR vs FinancialJuice: They give headlines in 5 seconds. We give analysis in 2 minutes. Different product.
- What to borrow: Audio alert concept for severity 9+ signals

### 6.9 Stocknews.ai
- What it is: AI-classified news signals for individual stocks
- Key feature: Shows price at signal time + how market moved since
- Different market: stocks, not commodities
- What to borrow: Price-at-signal display on every BBR signal card

### 6.10 ForexFactory / TradingEconomics
- What they are: Economic calendar tools
- BBR gap: We have no economic calendar (scheduled events). This is the biggest competitive gap identified.
- What to borrow: Full economic calendar page showing CPI/NFP/Fed decisions + countdown timers

### 6.11 InvestingLive (ex-Forexlive)
- What it is: Live news feed + central bank rates page
- Key feature: Central bank rates tracker (current rate, next meeting, expected move)
- What to borrow: Central bank rates mini-widget on BBR /watchlist page

---

## 7. GO-TO-MARKET STRATEGY

### Phase 1: 0 → 10 users (Week 1-2)
**Method: Personal network + targeted DMs**
- Personal WhatsApp/DM to known traders, analysts, importers
- Message: "I built something you might find useful — can I show you for 10 minutes?"
- No mass emails. Individual conversations.
- Goal: 3 users receiving Telegram alerts. Listen to every word of feedback.

### Phase 2: 10 → 100 users (Month 1-2)
**Method: Build in public + community seeding**
- Twitter "Build in public" thread — weekly signal accuracy updates
- Product Hunt launch (prepare: 5 screenshots, 60-second Loom demo, Tuesday 12:01am PST launch)
- Show HN: "I built a system that classifies geopolitical events into market signals"
- Reddit r/algotrading methodology post (not promotional — methodology)
- Reddit r/IndiaInvestments, r/geopolitics — geopolitical breakdown posts
- Telegram free alert public channel (@BlueBeaconResearch) — free delayed signals

### Phase 3: 100 → 1,000 users (Month 2-6)
**Method: Content flywheel**
- Daily Twitter: 1 signal example with outcome ("BBR fired this alert 4 hours before Brent moved +3.2%")
- Weekly LinkedIn: "BBR Intelligence Brief" — 3 events, 3 market implications
- Build /accuracy public page (most powerful conversion tool — live proof)
- Referral program: "1 month free for every user you invite"
- During major geopolitical events: $50-200 promoted tweet targeting commodity traders

### FOMO Marketing Tactics (Proven, Implemented)
1. **Access scarcity modal** — "847 of 1,000 research seats claimed" — counter increments slowly in localStorage
2. **Founding member price lock** — "First 500 subscribers lock in pricing for life. 312 spots remaining." (hardcoded, update weekly)
3. **Breaking event Twitter automation** — Severity 9+ events auto-post to @BlueBeaconHQ within 5 minutes via Zapier
4. **Free Telegram public channel** — delayed signals convert to paid (FinShots model)
5. **Weekly accuracy report** — public post every Monday showing BBR signal vs actual outcome
6. **Iran retrospective signal** — "Here's what BBR would have shown at 03:42 UTC on Feb 28, 2026" — Twitter post with real signal card mockup

### Social Media Strategy
**Twitter @BlueBeaconHQ:**
- Bio: "AI-powered geopolitical intelligence for commodity traders 🛢⚡ | Real-time signals when global events move markets | Research, not noise"
- Post mix: 40% educational, 30% real signal examples, 20% build-in-public, 10% direct product
- Target: FinTwit community, 5M+ engaged finance Twitter users
- Key post type: "Signal fired at [time]. Oil moved +X% by market open." — screenshot of real card

**LinkedIn (personal founder + company page):**
- Post: "Blue Beacon Research Weekly Intelligence Brief" every Monday
- Format: 3 events, 3 implications, real data
- Tag: finance journalists, fund managers, commodity exchanges
- Goal: authority building, professional credibility

**Reddit:**
- r/algotrading — methodology posts only, no promotion in title
- r/IndiaInvestments — geopolitical market impact breakdown posts
- r/geopolitics — link back to analysis when relevant
- r/quant — technical approach to signal classification
- Rule: 80% value, 20% product mention

**Telegram public channel @BlueBeaconResearch:**
- 1 free signal daily (6-hour delayed from platform)
- Morning brief when that feature is built
- Each post ends with link to bluebeaconresearch.com
- Acts as living proof-of-concept — as channel grows, signal cards accumulate as evidence

---

## 8. REVENUE PROJECTIONS (ASSUMPTIONS ONLY — NOT COMMITTED)

**Month 3:** 50 paying users
- 30 × Analyst ($49) = $1,470
- 15 × Pro ($199) = $2,985
- 5 × API ($499) = $2,495
- **Total MRR: $6,950**

**Month 6:** 200 paying users
- 120 × Analyst = $5,880
- 60 × Pro = $11,940
- 20 × API = $9,980
- **Total MRR: $27,800**

**Month 12:** 1,000 paying users
- 600 × Analyst = $29,400
- 300 × Pro = $59,700
- 100 × API = $49,900
- **Total MRR: $139,000 (~$1.67M ARR)**

**Infrastructure cost at 1,000 users:**
- Railway (API + Workers): ~$50/month
- Supabase Pro: $25/month
- Upstash Redis: $10/month
- Claude AI: $100-300/month (must monitor closely)
- Vercel Pro: $20/month
- **Total infra: ~$250-500/month**

**Gross margin at 1,000 users:** ~99.5% (mostly variable AI costs)

---

## 9. LEGAL POSITIONING

**Critical disclaimer required everywhere:**
"Blue Beacon Research provides geopolitical intelligence for informational purposes only. Signals and analyses do not constitute financial advice. Past market reactions to similar events do not guarantee future results. Users are responsible for their own investment decisions."

**What BBR is (legal):** Intelligence data provider
**What BBR is NOT (legal):** Investment advisor, financial advisor, broker-dealer

This distinction must be maintained in all marketing, product copy, and communications. The backtesting disclaimer is especially important — showing historical patterns must always be accompanied by a disclaimer that past correlation ≠ future prediction.
