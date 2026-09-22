# BLUE BEACON RESEARCH — CURRENT PRODUCT, BUSINESS & TECHNICAL CONTEXT

**Document purpose:** strategic / product handoff for a new ChatGPT/Claude thread. Not the live engineering punch list.

**As of:** 2026-09-20 (strategy body written 2026-09-16; shipped-since and path corrections added 2026-09-20)

**Repository:** `kashifnehal/bluebeaconresearch`

**Status:** Working product / MVP moving toward commercial validation. Technical foundation is substantially built, but product-market fit and willingness-to-pay are not yet validated.

**Live engineering truth (read these, do not use this file as the changelog):**
`docs/brain/LIVE_TODO.md` → `docs/brain/08_CURRENT_STATUS.md` → `docs/brain/14_CHANGELOG.md` (latest v0.78.0). Onboarding brief: `docs/claude_project/21_PROJECT_BRIEFING.md`. `claude/23_TODO.md` / `22_SESSION_HANDOFF.md` are **not in this repo**.

---

# 0. WHAT SHIPPED AFTER THE 2026-09-16 DRAFT

Do not treat the rest of this file as "nothing has been built since mid-September." The 2026-09-16–20 ships (full evidence in `LIVE_TODO.md`):

| Date | What |
|------|------|
| 2026-09-18 | Sidebar brand → `/dashboard`; landing hero subtext later replaced by #174 |
| 2026-09-19 | #145 watchlist default cards + single 1M/6M/1Y/3Y/5Y chart |
| 2026-09-19 | #123 remainder — every event-detail click opens a new tab |
| 2026-09-19 | #142 data: 8 sourced `media_impact_watchlist` rows (Musk evidence + AP-hack row). No Trump-named individual row |
| 2026-09-19 | #146 10 demo accounts, `profiles.is_test_account`, excluded from metrics/digest |
| 2026-09-19 | Driver.js one-time feature hints (watchlist, FilterBar, RECORD) |
| 2026-09-19 | Cmd+K Suggested RAG fallback (`POST /v1/search/assist`, `search_content_embeddings`) |
| 2026-09-19 | Fastify `/docs` Swagger is **not** public (dev/test only) |
| 2026-09-19 | #155 `/help` FAQ + `feedback_submissions` |
| 2026-09-20 | #143 leftover: event-detail shows novelty / source confirmation / why-this-signal when present |
| 2026-09-20 | Homepage copy integrity — no fabricated 42ms / 100% Verified / 40yr / Encrypted Support claims |
| 2026-09-20 | #174 landing subtext + #175 Tension Index click-outside |
| 2026-09-20 | Cmd+K Fuse.js fuzzy+keyword; `sort=relevance` on both signals routes; Economic Calendar added to palette pages |

Already shipped before this draft and still true: #141 materiality gate, #142 live watchlist table, #143 MARKET IMPACT ASSESSMENT, #144 1h/4h/24h/48h outcomes, #111 chat, #121 `/accuracy`, #87 forex, Discord webhook alerts.

---

## 1. EXECUTIVE SUMMARY

Blue Beacon Research (BBR) is being built as a **research-led, source-first geopolitical and market-impact intelligence platform**.

The central problem is not “give users more news.” The problem is:

> **When something happens in the real world, help a market participant understand whether it matters to the market/exposure they care about, why it matters, what evidence supports that assessment, and what happened afterward.**

The product should turn:

```text
WORLD EVENT
    ↓
SOURCE VERIFICATION
    ↓
EVENT CLASSIFICATION
    ↓
RELEVANCE / NOVELTY
    ↓
MARKET MATERIALITY
    ↓
MARKET MECHANISM
    ↓
EXPOSURE / ASSET IMPACT
    ↓
MARKET RESPONSE
    ↓
HISTORICAL CONTEXT / OUTCOME
```

into a usable research object.

The long-term potential moat is **not the LLM**. It is the structured, point-in-time, historical dataset connecting geopolitical/macro events to evidence, market mechanisms, market exposures, and subsequent market response.

The strongest current positioning is:

> **Market-Relevant Geopolitical Event Intelligence**

BBR should not try to become a cheaper Bloomberg, a smaller Dataminr, or a commodity-data clone of Kpler. It should become the specialized intelligence layer for people who have financial exposure to geopolitical and macro events.

---

# 2. THE CORE PRODUCT QUESTION

The product was framed around this decision test:

> **“What decision can this person make in the next 10 minutes that they couldn't confidently make before?”**

Every screen, alert, report, and research object should contribute to answering that question.

The user should be able to move through seven information-processing moments:

1. **Discovery** — Something happened.
2. **Verification** — Is it real?
3. **Relevance** — Does it matter to me?
4. **Mechanism** — How could it affect my market?
5. **Pricing** — Has the market already reacted?
6. **Decision** — Does this change anything I need to watch/do?
7. **Review** — Was my interpretation correct?

BBR is therefore fundamentally an **information-processing and research workflow**, not a generic prediction product.

---

# 3. WHAT BBR IS / IS NOT

## BBR IS

- Geopolitical + macro event intelligence.
- Source-first and evidence-first.
- Market-impact focused.
- Designed around commodities/FX first, with possible expansion into equities and other financial exposures.
- A continuously updated event intelligence database.
- A research workflow that preserves historical context and market outcomes.
- A product that can eventually expose structured intelligence through API/workflow-native surfaces.

## BBR IS NOT

- A generic news aggregator.
- A generic economic calendar.
- A conflict map for the sake of visualization.
- A pure AI-news product.
- A “buy/sell” signal service.
- A claim that AI predicts prices reliably.
- A replacement for Bloomberg/LSEG across all asset classes and workflows.
- A Kpler-style physical commodity operations platform.
- A Dataminr-style race to own the first public signal across millions of sources.
- A RavenPack-style general-purpose NLP/data infrastructure company.

---

# 4. POSITIONING AND TRUST

## External positioning

BBR should primarily present itself as:

- research-led
- source-first
- evidence-based
- market-impact focused
- transparent about uncertainty

Avoid making the company sound primarily like an “AI news” startup.

AI can be used internally for triage, classification, extraction, and analysis, but the customer-facing value should be the **research result**, not the model.

Preferred user-facing language:

- **Research Assessment**
- **Market Impact Assessment**
- **Source Verification**
- **Evidence**
- **Market Response**
- **Historical Context**
- **Uncertainty**

Avoid customer-facing claims such as:

- “AI predicts the market.”
- “AI knows what will happen next.”
- “100% verified by AI.”
- “Human verified” unless an actual human review workflow exists and is logged.

Do not claim “verified by a team of researchers” unless BBR actually has that team/process.

Trust should come from:

- original source links
- timestamps
- source identity
- corroboration
- clear distinction between reported fact and assessment
- explicit uncertainty
- historical outcomes
- transparent methodology

---

# 5. TARGET USER / INITIAL MARKET

The initial strongest wedge is **commodity/futures traders**, particularly users exposed to energy, shipping, supply, sanctions, production, and geopolitical disruption.

FX/macro traders are the second major fit because central-bank decisions, economic releases, geopolitical risk, and cross-border policy can move currencies and rates.

Potential BBR user-mix hypothesis (NOT market statistics; these are internal hypotheses):

| User type | Hypothesized BBR share | Why they care |
|---|---:|---|
| Discretionary commodity/futures trader | 22% | Needs fast, relevant interpretation of events affecting contracts |
| FX/macro trader | 15% | Needs geopolitical + macro context and market mechanism |
| Energy/physical commodity trader | 12% | Needs supply, logistics, sanctions and disruption intelligence |
| Hedge-fund / prop portfolio manager | 10% | Needs cross-asset event intelligence and risk context |
| Equity swing / macro trader | 9% | Needs company/sector exposure to macro/geopolitical events |
| Quant / systematic researcher | 8% | Needs point-in-time event data and historical outcomes |
| Multi-asset independent trader/investor | 8% | Wants a single place to understand important world events |
| Corporate treasury / procurement / hedging | 6% | Needs event-driven exposure/risk awareness |
| Sell-side / independent market researcher | 6% | Needs structured evidence and historical context |
| Geopolitical / country-risk professional | 4% | Needs event monitoring and market relevance |

These percentages must **not** be presented as externally validated market shares.

The common denominator is:

> **People with financial exposure to real-world events who need to know whether something that happened actually matters to the market/exposure they care about.**

---

# 6. WHAT THE FOUNDER SHOULD STUDY

The recommended learning path is not “learn all of trading.” It is **learn how market participants process information.**

Priority order:

1. WTI / Brent crude
2. EUR/USD
3. Physical energy and logistics
4. Macro / portfolio workflows
5. Equity / sector exposure
6. Gold / other safe-haven exposures
7. Quant/systematic research
8. Corporate hedging
9. Research analyst workflow
10. Geopolitical/country-risk workflow

For each event, maintain an observation log:

- What happened?
- First source seen?
- How was it verified?
- What market could care?
- What mechanism links event to market?
- Market price immediately before event/verification.
- 15-minute response.
- 1-hour response.
- 4-hour response.
- 24-hour response.
- 48-hour response where available.
- What did the trader/researcher believe at the time?
- What tools did they use?
- What information was missing?
- Was the information too slow, too noisy, too expensive, too ambiguous, or poorly contextualized?

Paper observation is preferred over risking capital while learning.

---

# 7. COMPETITIVE LANDSCAPE

BBR has several kinds of competitors/substitutes. They should not all be treated as identical.

## Tier 1 — Study deeply

- RavenPack
- Dataminr
- Newsquawk
- LSEG / Refinitiv

## Tier 2 — Strategic substitutes

- Bloomberg
- AlphaSense
- Accern

## Tier 3 — Adjacent

- Macrobond
- Kavout

## RavenPack — direct intelligence/data competitor

RavenPack is the closest conceptual comparison.

Its product includes:

- news analytics
- sentiment
- relevance scoring
- novelty tracking
- temporal scoring
- topic tagging
- entity metadata
- thousands of event topics
- impact analysis
- investing/trading use cases
- portfolio management
- research
- algorithmic trading
- risk/compliance

RavenPack has extremely broad source and NLP infrastructure. BBR should **not** attempt to compete on source volume or general NLP breadth.

BBR opportunity:

> Make the geopolitical event itself a structured, human-readable research object with evidence, market mechanism, exposure, and outcome.

## Dataminr — event detection competitor

Dataminr is very close to BBR on early-event detection.

Its financial-services offering describes:

- earliest public signals of market-moving events
- conflicts
- cyberattacks
- disasters
- corporate incidents
- over 1M public data sources
- 150+ languages
- text/image/video/sound/sensor inputs
- structured alerts with locations/entities/tickers/commodities/venues
- API integration

BBR should not compete on number of sources or multimodal infrastructure.

BBR opportunity:

> Dataminr answers “what happened first?”; BBR should increasingly answer “does it matter, why, and what happened next?”

## LSEG / Refinitiv — institutional substitute

LSEG Workspace combines:

- market data
- news
- analytics
- AI
- Reuters content
- financial research
- workflow tools

Its news ecosystem is extremely broad. Recent Workspace capabilities also include AI Search and Deep Research with grounded/traceable answers.

BBR cannot beat LSEG on breadth. It can specialize in market-relevant geopolitical events.

## Bloomberg — broadest workflow substitute

Bloomberg Terminal covers:

- real-time data
- news
- research
- analytics
- trading
- risk
- compliance
- collaboration
- execution
- commodities
- alerts

Bloomberg validates that market participants pay for integrated information + context + workflow. It is not proof that BBR can charge the same price.

BBR should not position itself as “Bloomberg but cheaper.”

## AlphaSense — research substitute

AlphaSense has a very large financial/business document corpus and provides:

- AI search
- deep research
- monitoring
- alerts
- financial data
- filings
- broker research
- expert calls
- news
- regulatory content

BBR should own continuous event intelligence rather than generic document search.

## Accern — signal/data infrastructure competitor

Accern processes large amounts of web/news content into financial signals and supports multilingual data workflows and curated financial news analytics.

BBR should be the end-user intelligence experience, not merely a signal-generation infrastructure layer.

## Macrobond — adjacent macro-data platform

Macrobond is primarily a macroeconomic time-series/research platform with:

- hundreds of millions of time series
- thousands of sources
- point-in-time data
- revision history
- APIs/data feeds
- AI integrations
- institutional users

BBR is event intelligence, not macro time-series infrastructure.

Macrobond could eventually complement BBR rather than compete directly.

## Kavout — retail AI investing substitute

Kavout is more retail/investing oriented, with:

- AI stock picker
- Market Movers
- InvestGPT
- Smart Signals
- watchlists
- portfolio tools
- smart-money features

BBR's question is different:

> What happened in the world, does it matter to my market, and why?

## Newsquawk — important direct workflow competitor

Newsquawk matters because it is closer to BBR's initial commodity/FX trader target.

It provides:

- real-time market-moving news
- analyst-curated intelligence
- audio
- economic event coverage
- breaking news

BBR must not assume raw speed alone is a differentiator.

---

# 8. COMPETITIVE STRATEGIC MAP

The competitors broadly answer different questions:

```text
Dataminr     = What happened first?
RavenPack   = How can news be structured/analyzed at scale?
Newsquawk   = What market-moving news is happening right now?
Bloomberg   = Give me almost everything in one workflow.
LSEG        = Give me trusted institutional data/news/analytics/workflow.
AlphaSense  = Help me search/research the information universe.
Macrobond   = Give me macro time-series and analysis.
Accern      = Turn news/web data into financial signals.
Kavout      = Which investments/stocks should I consider?

BBR         = What happened, does it matter to my market, why, and what happened next?
```

The intended BBR structured object is:

```text
EVENT
↓
VERIFICATION
↓
CLASSIFICATION
↓
NOVELTY
↓
MATERIALITY
↓
MARKET MECHANISM
↓
EXPOSURE
↓
MARKET RESPONSE
↓
HISTORICAL CONTEXT
```

Example:

```text
Iran threatens Strait closure
→ 3 independent sources / 1 official
→ Trade/Logistics + Conflict/Security
→ High novelty
→ High market-materiality for crude
→ Shipping disruption → export capacity risk → tighter prompt supply
→ Brent high, WTI medium
→ Brent +1.1% since verified report
→ 8 comparable historical events
```

The example is conceptual; never fabricate numbers in production.

---

# 9. MARKET RESEARCH / EVIDENCE

Research done for the BBR thesis covered:

- BIS FX market structure
- CFTC futures participation / COT context
- CME FedWatch
- academic work on investor attention
- information overload
- commodity futures and news sentiment
- scheduled macro announcements and FX volatility
- geopolitical risk research
- current products such as TradingView, Forex Factory, Newsquawk, LSEG, RavenPack, Dataminr, Bloomberg, Kpler, S&P Global, CME, Benzinga

Important research conclusion:

Information can matter materially to markets, and attention/news processing has measurable market effects. But that does **not** prove users will pay BBR specifically.

That distinction must remain explicit.

---

# 10. INSTITUTIONAL COMPETITOR AUDIT — KPLER / PERMUTABLE / GEOQUANT / PREDATA

A separate institutional competitor audit provided additional strategic lessons.

## Kpler

Kpler is large, well-capitalized, and not a true behavioral peer for BBR.

Real pricing found through Vendr:

- median approximately $55,000/year
- range approximately $50,000–$73,800/year

Named customers include:

- Shell
- Total
- Maersk
- Goldman Sachs
- EDF

Product surface includes:

- cargo analytics
- freight analytics
- risk & compliance
- inventories
- power market
- refineries
- research & insights
- supply & demand
- chartering
- arbitrage analytics
- financial flows
- satellite/AIS-linked intelligence
- Kpler Copilot / agent functionality
- MCP

Scale claims found in research include:

- 40+ commodities
- 36k+ commodity vessels
- 10+ years of history
- 1B+ AIS signals/day
- billions of crude barrels tracked
- thousands of tanks/refineries

Kpler also acquired MarineTraffic and FleetMon in 2023 and Spire Maritime for approximately $240.5M announced in 2024, with expected close in Q1 2025.

Kpler had reported passing $100M ARR in January 2024.

Important lesson: BBR should **not** chase physical commodity operations, satellite AIS, vessel tracking, refinery data, or Kpler-scale breadth.

Kpler's published accuracy comparisons against government data are an example of a strong institutional trust mechanic.

## Permutable AI

Permutable is the closest conceptual institutional peer found in the audit.

Product areas include:

- Global Macro Sentiment Indices
- 90+ countries
- 70+ macro topics
- commodity/energy intelligence
- geopolitical/narrative intelligence
- API
- point-in-time data
- Excel plugins
- systematic trading signals
- dashboards
- Trading Co-Pilot
- Auto Analyst
- Sector Trends
- Forecast Agents
- News Intelligence

Claims found include:

- 250k sources
- 80+ languages
- 11+ years of history
- hourly updates

A published commodities strategy case study reported approximately:

- 28.54% total return
- 7.01% annualized volatility
- -2.95% max drawdown

The case study was not independently audited and should not be treated as proof of future performance.

Permutable customers are not broadly disclosed. A real named testimonial from Vontobel Asset Management was found; other logos such as Macquarie Bank and Petroineos were present but usage/payment status was not independently established.

Corporate records research found Permutable incorporated as Saffron Blue Ltd in 2017 and renamed in 2020. The company was active with a small team; public accounts showed approximately:

- 8 employees
- £559.32k cash
- £610.39k assets
- £360.85k liabilities
- £249.54k net assets
- turnover not reported because it was below the relevant reporting threshold

A £250k share allotment in 2022 was found but was not verified as a formal funding round.

Strategic lesson:

> Pick an expensive information workflow, own the structured data layer, preserve history and provenance, build domain-specific taxonomies/signals, then expose the intelligence through APIs and workflow-native surfaces. The LLM is part of the machinery — not the product moat by itself.

## GeoQuant / Fitch

GeoQuant was acquired by Fitch in 2022.

Fitch materials described:

- 146 countries
- 40+ political risk categories
- 31 risk indicators
- hourly AI updates
- daily human review
- 10+ years of history
- access through 200+ markets via BMI

Methodology described as:

```text
Scrape
→ Sort
→ Machine Score
→ Human Review
→ Merge
→ Retrain
```

It produced country political-risk scores and sovereign/ESG-style risk measures.

Strategic lesson: a named, logged human-review layer can be a meaningful institutional trust feature — but BBR must not claim it until it actually exists.

## Predata

Predata was founded by Princeton engineers and acquired by FiscalNote. Its original independent site is no longer an active standalone product site. Exact current product/transaction status is not fully confirmed.

---

# 11. INSTITUTIONAL MARKET CONCLUSION

The competitor audit found a strong pattern:

- Institutional demand for geopolitical/commodity/macro intelligence is real.
- Kpler has verified five-figure annual pricing.
- Permutable/GeoQuant/Fitch are enterprise-oriented.
- Some companies were acquired rather than remaining standalone.
- No confidently verified self-serve $49–199/month commodity-geopolitical intelligence peer was found.

Therefore:

> **Institutional willingness to pay is proven; cheap self-serve willingness to pay is unknown.**

This is one of the most important BBR business conclusions.

Do not assume the currently documented BBR prices are validated.

Current aspirational pricing in older business docs included values such as:

- Analyst: $49
- Pro: $199
- API: $499

Other older planning material also discussed higher enterprise/API pricing.

These are **hypotheses, not validated willingness-to-pay**.

Do not lock pricing until actual user conversations and payment tests provide evidence.

---

# 12. BUSINESS VALIDATION STATUS

Current assessment:

| Area | Current assessment |
|---|---:|
| Direction | Yes |
| Technical MVP | ~7/10 |
| Product usefulness | ~7/10 potential, still needs evidence |
| Signal quality | ~5–6/10 and improving |
| Competitive differentiation | ~7/10 |
| Institutional demand evidence | ~9/10 |
| Retail/self-serve validation | ~2/10 |
| Commercial readiness | ~3/10 |
| PMF | Not established |

The biggest mistake now would be to keep adding features indefinitely without validating whether real users would miss BBR if it disappeared.

Recommended near-term validation target:

> Speak with 5–10 real target users and aim to find at least 3 people who would genuinely miss BBR if it disappeared.

Then test whether those users will actually pay.

A stronger signal than compliments is:

- repeated usage
- alerts turned on
- watchlist usage
- returning to event history
- requesting additional markets
- asking for API/export
- willingness to pay
- actual payment

---

# 13. PRODUCT TAXONOMY

Current agreed top-level event taxonomy:

1. `supply_disruption`
2. `sanctions_policy_action`
3. `production_output`
4. `conflict_security`
5. `trade_logistics`
6. `central_bank_monetary_policy`
7. `scheduled_economic_data`
8. `official_statement_commentary`
9. `other_market_relevant_geopolitical_event`

This is the current top-level direction.

Secondary categories can be added later if evidence shows they improve retrieval, filtering, or analysis.

Do not redesign the entire database simply because taxonomy can be made more elaborate.

---

# 14. MATERIALITY / RELEVANCE GATE

BBR has a `materiality_pass` concept.

Important terminology:

This is a **BBR product relevance / market-materiality gate**, not a legal implementation of the securities-law materiality test.

TSC Industries / Basic materiality concepts were used as research inspiration, but their legal context is different:

- TSC asks whether omitted information could substantially affect a reasonable investor's total mix of information.
- Basic's probability/magnitude discussion was applied in the context of contingent/speculative merger information.

Therefore BBR must not claim:

> “BBR uses the legal TSC/Basic materiality test.”

Instead say:

> “BBR uses a market-materiality/relevance gate to determine whether an event is sufficiently decision-relevant for the product.”

The gate should consider:

- event importance
- market exposure
- mechanism
- novelty
- evidence
- potential magnitude
- uncertainty
- whether the information is genuinely new/decision-relevant

Scheduled economic previews are not automatically irrelevant. A scheduled event can still contain meaningful surprise, expectation change, policy change, or market-relevant information.

Existing architecture includes fields such as:

- `relevance`
- `novelty`
- `event_category`
- `market_mechanism`
- `is_preview`
- `source_confirmation`
- `materiality_pass`
- `materiality_reasoning`

`materiality_pass=false` prevents a signal from entering the signals table.

Materiality tests previously included examples such as rejecting junk administrative stories and accepting a Red Sea tanker strike when an actual market mechanism existed.

---

# 15. GPR DECISION

Caldara–Iacoviello Geopolitical Risk (GPR) is useful as an **internal research/sanity-check reference**.

It should not currently be displayed as a central BBR user-facing score on every signal.

GPR is a newspaper-based measure of adverse geopolitical events/risk. It is not itself a direct measure of market impact.

The country index also has perspective/coverage limitations and should not be treated as a universal ground truth.

A newer AI-GPR concept exists and can be monitored, but it should not be integrated just because it exists.

Current decision:

> **Keep GPR internal for now.**

---

# 16. MACRO RISK CALENDAR

BBR should eventually have a **BBR Macro Risk Calendar**, not a generic everything-calendar.

Initial focus:

- Fed decisions
- ECB decisions
- BOJ decisions
- BOE decisions
- PBoC decisions
- CPI
- employment / NFP
- GDP
- PMI
- inventories
- major policy decisions
- other high-impact BBR-relevant releases

Do not simply copy a full economic calendar.

Trading Economics can be useful but commercial API licensing/pricing must be respected. Do not assume free commercial use.

Do not hardcode expected rate moves. Use licensed market-implied data where appropriate or omit the expectation.

Any existing static central-bank rate-expectation widget should not be treated as a permanent source of truth.

---

# 17. PRICE-AT-SIGNAL / MARKET RESPONSE

This feature is worth building as a **research/audit feature**, not as proof of causality or prediction.

Preferred labels:

- **Market Response**
- **Price at Signal**

Avoid:

- “Prediction Accuracy” unless the methodology genuinely supports that claim.

The system should ideally store:

- signal/event timestamp
- price snapshot at or immediately before the signal
- price source
- price timestamp
- later observations at 5m / 1h / 4h / 24h / 48h where available

The important distinction:

> A market moving after an event does not prove BBR caused the move or predicted it.

Current price-sync infrastructure runs approximately every 15 minutes. This can support historical context, but a dedicated signal-time snapshot/alignment is preferable.

A recent investigation found one observed 0.0% movement across two price ticks; this was not confirmed as a stale-price bug and could represent a genuinely flat market observation.

Do not label every flat observation as a system error without evidence.

---

# 18. CURRENT TECHNICAL ARCHITECTURE

Repository:

`https://github.com/kashifnehal/bluebeaconresearch`

Important current paths (corrected 2026-09-20 — several 09-16 paths did not exist):

- `apps/web/app/api/signals/route.ts` — Next.js BFF; reads Supabase **directly**, does not proxy Fastify
- `apps/web/app/api/signals/[id]/route.ts`
- `apps/web/app/(dashboard)/events/[id]/page.tsx` — not `app/events/[id]/page.tsx`
- `apps/web/app/(dashboard)/map/page.tsx`
- `apps/web/app/(dashboard)/dashboard/page.tsx`
- `apps/web/app/(dashboard)/watchlist/page.tsx`
- `apps/web/app/(dashboard)/watchlist/[symbol]/page.tsx`
- `apps/web/app/(dashboard)/help/page.tsx`
- `apps/web/app/(dashboard)/calendar/page.tsx`
- `apps/web/app/accuracy/page.tsx`
- `apps/web/app/page.tsx` — public landing
- `apps/web/components/CommandPalette.tsx`
- `apps/web/app/(auth)/login/page.tsx`
- `apps/web/proxy.ts`
- `apps/backend/src/services/claude.service.ts` — not `claude.ts`
- `apps/backend/src/services/acled.service.ts`
- `apps/backend/src/workers/gdelt-collector.ts` / `rss-collector.ts` / `gnews-collector.ts` / `acled-collector.ts`
- `apps/backend/src/workers/price-syncer.ts` / `alert-dispatcher.ts` / `outcome-tracker.ts` / `digest-sender.ts`
- `apps/backend/src/workers.ts`
- `apps/backend/src/routes/signals.ts` — Fastify `/v1/signals` (API-tier; browser uses the BFF)
- `apps/backend/src/routes/search.routes.ts` — `POST /v1/search/assist`

The current web map architecture is:

- MapLibre GL JS
- OpenStreetMap raster tiles
- client-side/event GeoJSON handling as implemented
- clustering
- severity filtering
- heatmap behavior
- event selection/filtering

---

# 19. MAPBOX DECISION — DO NOT REINTRODUCE

The project explicitly moved away from Mapbox because of signup/payment requirements.

Current approved MVP architecture:

> **MapLibre GL JS + OpenStreetMap**

Do not introduce:

- Mapbox
- MapTiler
- Google Maps
- paid map provider
- map API token
- card/signup dependency

unless the founder explicitly changes this decision.

OSM public tiles are suitable for MVP/development, but they are not an unlimited commercial tile-hosting solution. If usage grows, tile-hosting/licensing must be addressed deliberately.

---

# 20. GEOLOCATION / MAP DATA RULES

Current GDELT ingestion has historically produced null coordinates in many cases.

Important:

- `sourcecountry` is the publisher/source country, not necessarily the event location.
- Do not use sourcecountry as event coordinates.
- RSS items often have no coordinates.
- Exact event coordinates must be evidence-based.
- If only country-level location is known, label/display country-level location.
- Never invent coordinates just to make the map look complete.

The Next.js BFF `GET /api/signals` supports severity/region/commodity/`search`/`sort` including `sort=relevance` (2026-09-20; application-code rank, not SQL). It reads Supabase directly — it does not proxy Fastify. Not every documented filter (e.g. `has_coords`) is implemented.

---

# 21. CURRENT INGESTION / SIGNAL QUALITY PROBLEMS

## RSS is too broad

Current RSS ingestion has been pulling broad finance headlines, which can create irrelevant signals such as:

- biotech
- social-security
- crypto
- unrelated corporate/financial stories

This conflicts with BBR's geopolitical/market-impact identity.

The ingestion/classification system should become more selective.

## Never fabricate commodity exposure

A previous classifier fallback could assign `USOIL` with a volatile direction and 0.55 confidence when no defensible commodity impact existed.

This is unacceptable.

Hard rule:

> **Never fabricate commodity exposure.**

If there is no defensible commodity impact:

- return no commodity impact
- do not invent a ticker
- do not invent direction
- do not invent confidence

False precision is more damaging than an empty field.

## 24-hour feed limitation

The current signals API has historically defaulted to a 24-hour window.

That risks hiding important developing/active events.

BBR should preserve historical data and use a lifecycle model such as:

- Active / Developing
- Recent
- Historical

The feed should prioritize:

- severity
- market relevance
- novelty
- active/developing status

not simply newest timestamp.

Older important events should not disappear merely because they are more than 24 hours old.

Users should eventually be able to select time ranges such as:

- 24h
- 7d
- 30d
- history

---

# 22. SIGNAL ENGINE / AI ARCHITECTURE

The backend uses Claude for classification/analysis.

Important conceptual architecture:

```text
Raw source
→ ingestion
→ normalization
→ relevance/materiality filtering
→ event classification
→ source/evidence handling
→ market mechanism
→ exposure mapping
→ signal storage
→ alerts/UI
→ later market outcome measurement
```

The model is machinery inside the pipeline.

It is not the moat.

The moat should become the accumulated dataset and methodology around:

- event identity
- point-in-time timestamps
- evidence
- source provenance
- category
- novelty
- materiality
- market mechanism
- affected markets
- price at signal
- later response
- comparable historical events

---

# 23. AI / CONFIDENCE LANGUAGE

Previous product work removed misleading classifier-confidence percentages.

Do not display arbitrary percentages that users could interpret as:

> “The AI is 83% sure the price will go up.”

Separate concepts where possible:

- **Source confidence / verification strength**
- **Impact assessment confidence**
- **Market uncertainty**

These are different things.

A source can be highly credible while the market impact remains uncertain.

---

# 24. EVENT DEEP-DIVE EXPERIENCE

The event detail page should become a source-first research page containing, as appropriate:

1. What happened.
2. When it happened.
3. Source verification.
4. Primary/secondary sources.
5. Event classification.
6. Novelty/relevance.
7. Market-materiality reasoning.
8. Market mechanism.
9. Affected commodities/FX/markets.
10. Current market response.
11. Historical/comparable events.
12. Timeline/developments.
13. Uncertainty / what is not known.
14. Related events.

Shipped on event-detail as of 2026-09-20: source confirmation, novelty (when non-null), market mechanism, affected markets, direction, event category, media-impact tag, materiality reasoning ("Why this signal"), per-signal chat (#111), historical comparable-events tab. **Not built:** timeline/developments (item 12) and related-event clustering (item 14). Still unread in UI: `relevance`, `materiality_pass`.

Do not expose internal prompts/model-chain details as product value.

---

# 25. BACKTESTING / ACCURACY

Backtesting is intended as a **research and measurement capability**.

It should answer questions such as:

- How did markets respond after this class of event?
- What happened historically after similar events?
- How often did the assessed direction align with later market movement?
- How does the response vary by horizon?

It must not become an unsupported claim of predictive trading ability.

Existing architecture has moved toward outcome tracking at:

- 1h
- 4h
- 24h
- 48h

Public `/accuracy` is live (#121). Headline aggregates **48h** `signal_outcomes` only (#144 also writes 1h/4h/24h). Per-asset rows below 20 scored predictions show "not enough history yet". Homepage links to `/accuracy` but **does not print a hit-rate percentage** (2026-09-20 copy-integrity). Do not invent a homepage accuracy number.

---

# 26. HUMAN REVIEW

A future human-review trust layer is planned.

The idea is:

- sample signals
- have a human review them
- log who/when/what was reviewed
- preserve review outcome
- make the process queryable
- only make quantitative public claims after a real history exists

Do not say:

> “All signals are human verified.”

unless literally true.

Do not publish a “human verified %” number until it is based on real logged review history.

---

# 27. MOBILE / NOTIFICATION PSYCHOLOGY

The mobile experience should encourage habitual utility rather than manipulative addiction.

Useful mechanisms:

- morning/opening brief
- personalized high-signal alerts
- watchlist
- progressive disclosure
- “what changed since last visit?”
- clear notification controls
- mobile-friendly event deep dives

The product should create a reason to return because it is useful, not because of artificial engagement loops.

---

# 28. NOTIFICATION CHANNELS

Live / considered channels:

- in-app + email digest (#83)
- Telegram — connect UX shipped (#112); delivery still blocked on `TELEGRAM_BOT_TOKEN` (founder-deferred)
- Discord — webhook-URL paste shipped 2026-09-12 (no bot/OAuth)
- Slack webhook
- web / mobile push — not the current focus

**WhatsApp (#85) is KILLED, not paused** (D18 / ADR 014). Do not implement it. Do not treat "eventually WhatsApp" as an open backlog item.

If an external service is missing credentials/licensing:

- implement a graceful disabled state where appropriate
- never insert fake production data
- never assume a secret exists

---

# 29. AUTHENTICATION / SESSION

Relevant web paths:

- `apps/web/lib/auth.ts`
- `apps/web/app/login/page.tsx`
- `apps/web/proxy.ts`

Auth/session behavior needs to be audited carefully if UI appears to show a sign-in state while the user is already authenticated.

Do not assume the issue is visual only. Check:

- Supabase SSR cookies
- session hydration
- middleware route protection
- server/client state synchronization

The `/map` route also previously needed an auth-protection audit.

---

# 30. WATCHLIST / DASHBOARD RULES

No mock/static production values.

Watchlist and dashboard must use real current data.

Do not generate random sparklines or fake market values.

The dashboard should increasingly answer:

- What matters now?
- What changed since I last visited?
- Which events affect my watchlist?
- What is developing?
- What evidence supports it?
- What has the market done?

---

# 31. ECONOMIC / MARKET DATA LICENSING

Every external source must be checked for:

- commercial-use rights
- redistribution rights
- display rights
- API restrictions
- historical-data restrictions
- attribution requirements
- caching/storage restrictions

Never assume that an API being technically accessible means BBR can commercially use and redistribute the data.

This is particularly important for:

- ACLED
- Trading Economics
- market data
- news feeds
- OSM tile infrastructure
- third-party APIs

---

# 32. ACLED — SEPARATE BLOCKED ACTIVATION TASK

**ACLED is intentionally excluded from current implementation tasks unless the founder explicitly activates it.**

Do not:

- create ACLED credentials
- add ACLED API calls
- add ACLED env vars
- modify the ingestion pipeline for ACLED
- block other BBR work waiting for ACLED
- use ACLED as mock data

The map should consume existing normalized BBR event data.

## Current official technical access pattern

Official ACLED documentation currently uses OAuth.

Token endpoint:

`POST https://acleddata.com/oauth/token`

Form fields include:

- `username`
- `password`
- `grant_type=password`
- `client_id=acled`
- `scope=authenticated`

The access token is valid for approximately 24 hours and refresh-token validity is approximately 14 days.

Data endpoint:

`https://acleddata.com/api/acled/read`

with:

`Authorization: Bearer ACCESS-TOKEN`

## Commercial licensing is the blocker

The important issue is not simply obtaining credentials.

ACLED's current EULA states that commercial entities may not access/use ACLED content/platforms without first obtaining a corporate license.

The EULA also includes restrictions around:

- creating substitute/competitive products
- direct exposure of raw data
- transformative use
- attribution
- AI/ML/LLM training/testing/development/improvement and extraction
- preventing users from retrieving underlying ACLED data

Therefore:

> **Do not activate ACLED in BBR until the corporate/commercial license position is explicitly approved.**

Credentials alone are not sufficient authorization.

Once licensed, credentials should remain server-side and token refresh/caching should be implemented securely.

---

# 33. RAILWAY / DEPLOYMENT / COST

The backend/web deployment uses Railway/Vercel architecture.

Railway cost investigation showed memory as a meaningful cost component, with an always-on worker using node-cron for periodic work.

The architecture should be reviewed for:

- always-on workers
- memory footprint
- unnecessary replicas
- periodic ingestion
- price sync
- classification jobs
- heartbeat processes

Where possible, periodic tasks should be moved to Railway Cron jobs that:

1. start
2. perform the task
3. exit

Persistent workers should remain only where continuous processing is actually necessary.

Set a hard usage limit and monitor spend.

Do not disable the backend blindly; optimize the architecture.

---

# 34. VERCEL / DOMAIN / CI DEPLOYMENT CONTEXT

BBR has Vercel deployment infrastructure and custom-domain/CI gating work.

The intended behavior for Vercel:

- pushes to `main` build immediately
- deployment check runs the GitHub CI/type-check job
- custom production alias should only advance when required checks pass
- failed checks should leave previous live version in place
- Force Promote is available for emergency override

Railway CI gating was also configured so services can wait for CI before deployment.

The exact provider settings should be verified from the current dashboard rather than relying on old UI instructions.

---

# 35. PROMPT / IMPLEMENTATION ROADMAP

The agreed numbered implementation prompts are:

1. **PROMPT 01 — AI Ingestion & Classifier**
2. **PROMPT 02 — BLUE BEACON INTELLIGENCE MAP + WEB TERMINAL FEED**
3. **PROMPT 03 — MULTI-CHANNEL ALERT ROUTER**
4. **PROMPT 04 — EVENT DEEP-DIVE PAGE**
5. **PROMPT 05 — DATA RETENTION & IMPORTANT EVENT VISIBILITY**
6. **PROMPT 06 — AUTHENTICATION & SESSION**
7. **PROMPT 07 — DASHBOARD & WATCHLIST**
8. **PROMPT 08 — GLOBAL INTELLIGENCE MAP**
9. **PROMPT 09 — PRICE-AT-SIGNAL**
10. **PROMPT 10 — MOBILE + NOTIFICATION SYSTEM**

Important:

- Prompt numbering must remain exactly as above.
- Do not invent a new number for ACLED.
- ACLED activation is a separate blocked task.
- Prompt 02 is already completed.
- Prompt 08 should enhance the Prompt 02 map rather than rebuild it.

## Dependencies

```text
03 → 01
04 → 01 + 02
05 → 01 + 02
06 → independent
07 → 02 + 04 + 05 + 06
08 → 01 + 02
09 → 04 + price data
10 → 03 + 06 + 07
```

ACLED does not block 03–10.

---

# 36. PROMPT 02 — FINAL MAP ARCHITECTURE

Prompt 02 moved BBR to:

> **MapLibre GL JS + OpenStreetMap**

It implemented a map + terminal feed direction using existing BBR data.

Do not revert to Mapbox.

The map should be treated as a decision-support interface, not decorative visualization.

A map event should answer:

- where
- what happened
- how severe/relevant
- which market exposure
- why it matters
- what source supports it

---

# 37. IMPORTANT CURRENT CODE / PRODUCT ISSUES TO MONITOR

1. RSS ingestion remains too broad.
2. Claude classifier must never fabricate commodity exposure.
3. Signals API's 24h default can hide older important/developing events.
4. Coordinate coverage is incomplete; do not invent coordinates.
5. `/api/signals` does not currently implement every documented filter such as `has_coords`.
6. Middleware/auth route coverage should be audited.
7. Login/session hydration may need fixing if UI and actual auth state disagree.
8. Watchlist must use live values, not mock/static/random data.
9. AI confidence must not be presented as false-precision prediction probability.
10. Event deep dive should be source-first and research-first.
11. Backtesting should measure outcomes, not claim causality.
12. Human-review claims must wait for actual logged human review.
13. Current docs contain some stale/historical Mapbox and architecture references and need synchronization with current code.
14. A single authoritative current-state document is necessary to prevent future doc drift.

---

# 38. DATA MODEL / HISTORY PRINCIPLE

A key long-term architectural principle is:

> **Preserve point-in-time truth.**

For every event, distinguish at minimum:

- when the event happened (`event_date` / event timestamp)
- when BBR observed/ingested it (`created_at` / ingestion timestamp)
- when verification changed
- when assessment changed
- when market data was observed

Do not overwrite history in ways that make it impossible to reconstruct what BBR knew at the time.

This is essential for credible backtesting and research.

A future BBR user should be able to ask:

> “What did BBR know and believe at 10:42 UTC on that day?”

and reconstruct the answer from stored point-in-time data.

---

# 39. FUTURE DATA / FEATURE OPPORTUNITIES

Potential high-value additions include:

- CFTC COT data, using appropriate public/commercial-use terms
- stronger point-in-time backtesting UX
- paid API productization
- event similarity / comparable historical events
- human-review sampling
- BBR Macro Risk Calendar
- richer market-response measurements
- workflow/API integrations

Do not add features simply because competitors have them.

The test should be:

> Does this improve the user's ability to understand whether an event matters and what to do with that information?

---

# 40. WHAT NOT TO CHASE

Do not let competitor feature lists turn into an uncontrolled roadmap.

Do not chase:

- 1M+ public sources
- 250k+ sources / 80+ languages merely for scale
- 300M macro time series
- satellite AIS fleets
- full physical commodity operations
- every asset class
- every economic release
- dozens of AI agents because competitors use agents
- generic AI chat as the primary product
- “Bloomberg but cheaper” positioning

BBR wins by depth and workflow relevance in a narrower problem.

---

# 41. BUSINESS MOAT HYPOTHESIS

The strongest moat hypothesis is:

> **A continuously structured, point-in-time historical database of market-relevant geopolitical events, their evidence, verification state, market mechanism, exposure, and subsequent market response.**

The defensibility compounds because every event can add:

- another labeled event
- another source relationship
- another market-mechanism mapping
- another historical outcome
- another comparable event
- another calibration datapoint
- another research workflow primitive

The LLM used to classify the event can change.

The accumulated structured event history is harder to replace.

---

# 42. BUSINESS MODEL HYPOTHESIS

Current business direction is B2B / professional first, with possible self-serve tiers.

Older planning prices included:

- Analyst: $49/month
- Pro: $199/month
- API: $499/month

These remain **unvalidated hypotheses**.

Potential future enterprise/API pricing may be much higher depending on data rights, support, integrations, usage, and workflow value.

Do not make pricing decisions solely from competitor pricing.

Validate:

1. Who has the pain?
2. How frequently does it occur?
3. What does the current workflow cost?
4. What does late/missed information cost?
5. Which current tool is paid for?
6. What would they replace/complement?
7. What would make them switch?
8. What would they pay monthly/annually?
9. Will they actually pay now?

---

# 43. CUSTOMER DISCOVERY PLAN

Recommended immediate commercial validation:

### Step 1 — Recruit 5–10 target users

Prioritize:

- commodity/futures traders
- FX/macro traders
- energy professionals
- independent researchers
- systematic researchers

### Step 2 — Ask about their existing workflow

Questions should focus on actual behavior:

- What happened the last time a geopolitical event affected your market?
- Where did you first hear about it?
- How did you verify it?
- How did you decide whether it mattered?
- Which tools did you open?
- What did you miss?
- How much time did this take?
- Did you act differently because of the information?
- Was the problem speed, noise, context, confidence, source quality, or cost?

### Step 3 — Show BBR

Do not pitch every feature.

Show one workflow:

```text
Event
→ Evidence
→ Why it matters
→ Market mechanism
→ Market response
→ Historical comparison
```

### Step 4 — Measure behavior

Look for:

- “I would use this every day.”
- “I need this for X market.”
- “Can you add X source?”
- “Can I get alerts?”
- “Can I export/API this?”
- “Can I put my watchlist in it?”
- “How much does it cost?”

### Step 5 — Ask for payment

The strongest validation is actual payment, not enthusiasm.

---

# 44. COMMUNITY / OUTREACH RESEARCH

Potential communities identified:

- r/FuturesTrading
- r/CommodityTrading
- r/Forex
- r/Daytrading
- r/algotrading
- r/CryptoCurrency
- r/stocks
- r/Trading
- r/investing
- Elite Trader
- Trade2Win
- FinTwit/X

Commodity-specific Discord discovery was weak, so do not invent a community that has not been verified.

Outreach should be genuine participation, not spam, especially in communities with anti-self-promotion rules.

Useful research framing:

> “How do you find out quickly when something like Hormuz/OPEC/sanctions/shipping disruption changes the market? Which tools do you use? What happens when you find out late?”

---

# 45. KEY PRODUCT PRINCIPLES

## Principle 1 — Evidence before interpretation

Show what was reported before explaining what it means.

## Principle 2 — Never invent certainty

No fabricated commodity exposure, coordinates, prices, confidence, or market reaction.

## Principle 3 — Preserve history

The original point-in-time state matters.

## Principle 4 — Market mechanism must be explicit

Do not say merely “this is bullish for oil.” Explain the mechanism.

Example:

```text
Event
→ shipping disruption
→ reduced export capacity
→ tighter prompt supply
→ potential crude risk premium
```

## Principle 5 — Narrow beats broad

BBR does not need every piece of news.

## Principle 6 — Human-readable output

The customer should not need to understand the underlying ML system.

## Principle 7 — Honest uncertainty

If evidence is weak or impact is unclear, say so.

## Principle 8 — No fake production content

No mock signals, random prices, fake testimonials, fabricated outcomes, or placeholder production numbers.

## Principle 9 — Licensing is product architecture

Data rights affect what BBR can store, display, train on, and sell.

## Principle 10 — Build for measurable usefulness

Every major feature should connect to the decision-usefulness test.

---

# 46. CURRENT STRATEGIC DECISION

The most important current business decision is:

> **Pause uncontrolled feature expansion long enough to validate the core workflow with real users.**

The current product is technically advanced enough to begin serious user validation.

The remaining risk is not primarily:

> “Can we build another feature?”

It is:

> **“Will a real professional change their workflow, return repeatedly, and pay for this?”**

---

# 47. THE PRODUCT NORTH STAR

BBR should become the place where a market participant can go when something happens in the world and quickly get:

```text
WHAT HAPPENED?
    ↓
IS IT REAL?
    ↓
HOW IMPORTANT IS IT?
    ↓
WHY DOES IT MATTER TO MY MARKET?
    ↓
WHAT MARKET IS EXPOSED?
    ↓
HAS THE MARKET ALREADY REACTED?
    ↓
WHAT HAPPENED IN SIMILAR EVENTS?
    ↓
WHAT SHOULD I WATCH NEXT?
```

That is the product.

Everything else is supporting infrastructure.

---

# 48. FINAL ONE-PARAGRAPH COMPANY DEFINITION

**Blue Beacon Research is a source-first geopolitical and macro event intelligence platform for market participants. It continuously identifies and structures market-relevant real-world events, verifies them against evidence, classifies their relevance and novelty, explains the mechanism by which they could affect specific markets, shows the market response, and preserves the event in a point-in-time historical database for research and backtesting. BBR is not trying to be another generic news feed, AI-news app, economic calendar, Bloomberg clone, Dataminr clone, or Kpler clone. Its potential moat is the accumulated structured history connecting geopolitical events, evidence, market exposure, mechanisms, and outcomes. Its immediate business priority is validating that this workflow is valuable enough for real users to adopt and pay for.**

---

# 49. HANDOFF INSTRUCTIONS FOR FUTURE AI / ENGINEERING THREADS

When continuing BBR work:

1. Read `docs/claude_project/21_PROJECT_BRIEFING.md` first, then `docs/brain/LIVE_TODO.md`, `docs/brain/08_CURRENT_STATUS.md`, and this file for strategy.
2. Inspect the current repository before proposing code changes.
3. Treat current code as the implementation source of truth. This document is the strategic/product handoff; `LIVE_TODO` / `08` / `14` are the live engineering truth.
4. Check existing `docs/brain` and `docs/claude_project` before inventing architecture. Topic map: API → both `05_API.md`; schema → `docs/brain/04_DATABASE.md`; Claude prompt → `docs/claude_project/18_AI_ENGINE.md`; UI → both `06_COMPONENTS.md`.
5. Identify stale documentation before relying on it.
6. Do not contradict explicit decisions in this document without explaining why.
7. Do not introduce Mapbox unless the founder explicitly changes the decision.
8. Do not activate ACLED until corporate/commercial licensing is approved.
9. Do not fabricate production data or credentials.
10. Do not assume third-party API commercial rights.
11. Do not expose internal model/prompt details as the primary customer value.
12. Do not claim human verification unless actual logged human review exists.
13. Do not treat BBR pricing as validated.
14. Do not treat the user-mix percentages as market statistics.
15. Preserve prompt numbering 01–10 exactly.
16. Keep ACLED as a separate blocked task, not a numbered prompt.
17. For every feature, ask whether it improves the core decision-usefulness workflow.
18. Prefer a smaller, trustworthy product over a larger, noisier one.

---

# 50. CURRENT BOTTOM LINE

BBR has a credible product direction and a technically meaningful MVP foundation.

The strongest thesis is **not “AI for news.”**

It is:

> **Market-Relevant Geopolitical Event Intelligence — evidence first, mechanism explicit, market response measurable, history preserved.**

The institutional market validates that sophisticated buyers pay heavily for information workflows. What is not yet validated is whether BBR's narrower self-serve/productized workflow will command meaningful recurring revenue.

Therefore the next stage is not primarily more feature breadth. It is **signal quality + trust + user validation + willingness-to-pay evidence**, while continuing to build the historical event/market-response data foundation that can become the long-term moat.
