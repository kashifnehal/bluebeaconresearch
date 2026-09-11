# 17_SIGNAL_ENGINE.md — Signal Generation Logic

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

**Classification: Internal — CTO Level**

---

## 1. WHAT A SIGNAL IS

A signal is the core output of Blue Beacon Research. It answers one question: "What does this event mean for markets, and why?"

> ⚠️ UPDATED 2026-08-19 — A signal is no longer necessarily static once created. If a later article from a different source is classified as the same event at a *higher* severity, the existing signal's `severity`, `sources_count`, and `ai_analysis` are updated in place (an "escalation") rather than a second signal being created — see `docs/brain/10_DECISIONS.md` ADR 010. A same-or-lower-severity match from another source is a plain duplicate merge (`sources_count` grows, everything else stays put). `title` and `summary` are still fixed at first-insert time and are not updated by either case.
> ⚠️ UPDATED 2026-08-19 (later, Prompt J.6) — An escalation can also now re-notify users. Already-alerted users get a second, distinctly-labeled "UPDATED: severity X → Y" alert, but only when the escalation crosses severity >=7 for the first time or jumps >=2 points in one go — a minor refinement (7→8) updates the signal quietly, no second alert. Full detail: `docs/brain/10_DECISIONS.md` ADR 010 addendum.

A signal contains:
- **Title**: concise event description (what happened)
- **Summary**: 1-2 sentence neutral factual summary
- **AI Analysis**: 5-7 paragraph intelligence briefing (Claude 3.5 Sonnet)
  > ⚠️ UPDATED 2026-08-19 — Model is now `claude-sonnet-5` (Claude 3.5 Sonnet, model ID `claude-3-5-sonnet-20241022`, was retired by Anthropic 2025-10-28 and had been silently non-functional). See `docs/brain/14_CHANGELOG.md` v0.27.0.
- **Severity**: 1–10 (how significant is this for markets)
- **Confidence**: 0.0–1.0 (how certain is the commodity impact assessment)
- **Event type**: conflict / sanctions / trade_policy / central_bank / etc.
- **Country + Region**: where this happened
- **Commodity impacts**: which assets, which direction, with what confidence
- **Price at signal**: what the primary commodity was priced at when signal fired
- **Sanctions matches**: are any named actors on OFAC/EU/UN lists
- **Shipping proximity**: distance from nearest global trade chokepoint
- **Is breaking**: unfolding crisis within last 2 hours

---

## 2. SEVERITY SCORING

### 2.1 Severity Scale Definition

| Score | Label | Definition | Market expectation |
|-------|-------|------------|-------------------|
| 10 | CRITICAL | Active nuclear threat, mass casualty attack on oil infrastructure, war declaration between nuclear powers | Immediate and severe commodity spike. Gold +5%, Oil +10%+ |
| 9 | EXTREME | Major military strike on key infrastructure, Strait of Hormuz closure threat, critical G20 sanctions | Significant commodity move. Oil +3-7%, Gold +2-4% |
| 8 | HIGH | Significant escalation, major sanctions package, oil field or tanker attack | Moderate commodity move. Oil +2-4%, Gold +1-2% |
| 7 | ELEVATED | Credible military threat, secondary sanctions, significant trade route disruption | Small to moderate move. Oil +1-2%, Gold +0.5-1% |
| 6 | MEDIUM-HIGH | Ongoing conflict update, policy statement with enforcement implications | Minimal direct market move, contextual significance |
| 4–5 | MEDIUM | Diplomatic tensions, sanctions threats, minor political crisis | Background risk factor, no direct price move expected |
| 2–3 | LOW | Protest or unrest without trade impact, minor political dispute | Informational only |
| 1 | MINIMAL | Background events, historical context, routine political activity | No market relevance |

### 2.2 Severity Calculation (Multi-factor)

The AI classifier considers these factors in severity scoring:

**Factor 1: Goldstein Scale (from GDELT)**
- Ranges from -10 (most conflictual) to +10 (most cooperative)
- Goldstein ≤ -7 → base severity 9
- Goldstein -5 to -7 → base severity 8
- Goldstein -3 to -5 → base severity 7
- Goldstein -1 to -3 → base severity 6
- Goldstein ≥ -1 → base severity ≤ 5

**Factor 2: Source count multiplier**
- 1 source: base severity (unconfirmed)
- 2-3 sources: +0.5 to base severity
- 4+ sources: +1.0 to base severity

**Factor 3: Chokepoint proximity**
- Event within 50km of Hormuz/Suez/Malacca/Bab-el-Mandeb: +1 to severity
- Event within 50-200km: +0.5
- Event beyond 200km: no adjustment

**Factor 4: Actor significance**
- Named state actor (Iran, Russia, China, US): no change (expected)
- Named non-state actor (Houthis, Hezbollah): +0.5 (unpredictability premium)
- Sanctions match in actor names: +0.5

**Factor 5: AI re-scoring**
Claude's output severity is the final arbiter. The Goldstein-based estimate is provided as context in the prompt, but Claude can override it based on the full event context.

### 2.3 Severity Hardcoding Rules (Override)
The following event types are always scored at minimum severity regardless of other factors:
- Active attack on oil infrastructure or tanker: minimum 8
- Strait of Hormuz explicit threat or closure: minimum 9
- Nuclear weapons test or threat: minimum 10
- Active sanctions on oil exports from major producer: minimum 8

---

## 3. CONFIDENCE SCORING

Confidence represents "how certain are we that this event will materially impact the listed commodity prices?"

### 3.1 Confidence Scale Definition

| Range | Label | Meaning |
|-------|-------|---------|
| 0.85–1.0 | HIGH | Direct physical disruption already confirmed. Supply impact is mechanical. |
| 0.65–0.84 | MEDIUM-HIGH | High-credibility threat, multiple source confirmation, clear mechanism. |
| 0.45–0.64 | MEDIUM | Indirect risk, escalation pathway, single source, speculative timeline. |
| 0.25–0.44 | LOW | Possible but unlikely impact. Informational signal. |
| 0.00–0.24 | VERY LOW | Background context only. |

### 3.2 Events with Historically High Confidence (> 0.80)
- Confirmed attack on oil production facility or pipeline
- OFAC sanctions on oil-producing country
- Confirmed chokepoint blockage or mine laying
- Central bank rate decision (actual vs consensus)
- Emergency OPEC supply cut announcement

### 3.3 Events with Historically Low Confidence (< 0.50)
- Election results (market expectations already priced in)
- Diplomatic tensions without enforcement action
- Protest movements without trade disruption
- Military exercises (routine, not escalatory)
- Political speeches and policy statements

---

## 4. COMMODITY IMPACT MAPPING

### 4.1 Event → Commodity Mapping Logic

The AI classifier identifies which commodities are in the "impact path" of each event. This is not a lookup table — Claude determines the mapping based on event context. However, historical patterns guide the prompts:

**Iran / Hormuz events:**
- Primary: USOIL ↑, UKOIL ↑ (19% of global oil flows through Hormuz)
- Secondary: XAUUSD ↑ (safe haven demand), LNG ↑ (Qatar exports via Hormuz)

**Russia / Ukraine conflict events:**
- Primary: NGAS ↑ (European gas supply), WHEAT ↑ (Black Sea grain)
- Secondary: XAUUSD ↑ (safe haven), USOIL ↑ (Russian oil supply)

**US-China trade conflict:**
- Primary: COPPER ↓ (China is 50%+ of global copper demand), CORN ↓ (China agricultural imports)
- Secondary: XAUUSD ↑ (uncertainty premium)

**Houthi / Red Sea attacks:**
- Primary: USOIL ↑ (shipping rerouting via Cape of Good Hope), UKOIL ↑
- Secondary: WHEAT ↑ (grain shipping costs), COPPER ↑ (shipping cost inflation)

**Sudan / Ethiopia / Sahel conflict:**
- Primary: XAUUSD ↑ (gold producing regions)
- Secondary: None (minimal global commodity exposure)

**US Federal Reserve decisions:**
- Rate hike: XAUUSD ↓, EURUSD ↓, COPPER ↓ (stronger dollar effect)
- Rate cut: XAUUSD ↑, EURUSD ↑, COPPER ↑
- Above-consensus CPI: XAUUSD ↑ (inflation hedge), rate hike expectations → XAUUSD ↓ (paradox)

### 4.2 Direction Logic

| Direction | Definition | Threshold |
|-----------|-----------|----------|
| up | Expected price increase | Confidence ≥ 0.50 for positive price impact |
| down | Expected price decrease | Confidence ≥ 0.50 for negative price impact |
| volatile | Uncertain direction, high movement expected | When up/down probabilities within 20% of each other |
| neutral | No expected price impact | Confidence < 0.40 for any direction |

### 4.3 Price-at-Signal Capture

When a signal is generated, the current commodity price is captured:

```typescript
// In signal-generator.ts
const primaryAsset = signal.commodity_impacts[0]?.asset
if (primaryAsset) {
  const { data: priceData } = await supabase
    .from('commodity_prices')
    .select('symbol, price, fetched_at')
    .eq('symbol', primaryAsset)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .single()
  
  if (priceData) {
    signal.price_at_signal = {
      [priceData.symbol]: priceData.price,
      capturedAt: priceData.fetched_at
    }
  }
}
```

This enables the price movement display: "WTI at signal: $84.20 | Now: $87.31 +3.7% ↑"

---

## 5. SHIPPING PROXIMITY CALCULATION

**Chokepoints monitored:**

| Chokepoint | Lat | Lng | Oil/Trade % |
|-----------|-----|-----|-------------|
| Strait of Hormuz | 26.5667 | 56.25 | 19% global oil |
| Suez Canal | 30.0444 | 32.2496 | 12% global oil, major trade artery |
| Bab-el-Mandeb | 12.5847 | 43.3326 | 8% global oil |
| Strait of Malacca | 2.5 | 101.5 | 16% global oil, 25% global trade |
| Turkish Straits (Bosphorus) | 41.1 | 29.1 | 3% global oil (Russia-Black Sea) |
| Panama Canal | 9.08 | -79.68 | Major trade artery |
| Cape of Good Hope | -34.36 | 18.47 | Rerouting fallback for Suez |

**Proximity logic:**
```typescript
const PROXIMITY_THRESHOLD_KM = 400

let shippingProximity = null
if (signal.lat && signal.lng) {
  for (const cp of CHOKEPOINTS) {
    const distKm = haversineKm(signal.lat, signal.lng, cp.lat, cp.lng)
    if (distKm <= PROXIMITY_THRESHOLD_KM) {
      if (!shippingProximity || distKm < shippingProximity.distanceKm) {
        shippingProximity = {
          chokepoint: cp.name,
          distanceKm: Math.round(distKm),
          oilPct: cp.oilPct
        }
      }
    }
  }
}
```

**Display on event detail page:**
If shippingProximity is populated: amber banner showing "22km from Strait of Hormuz — 19% of global oil passes through this route."

---

## 6. SANCTIONS CROSS-REFERENCE

**Logic in signal-generator.ts:**
```typescript
// Extract potential actor names from title + summary (simple NLP)
const textToSearch = `${signal.title} ${signal.summary} ${actorContext.actors.join(' ')}`

// Search sanctions_entities using full-text search
const { data: matches } = await supabase
  .from('sanctions_entities')
  .select('name, list, entity_type, date_added')
  .textSearch('name_search_vector', textToSearch, { type: 'websearch' })
  .limit(5)

if (matches && matches.length > 0) {
  signal.sanctions_matches = matches.map(m => ({
    actor: m.name,
    list: m.list,
    dateAdded: m.date_added
  }))
}
```

**Display on event detail page:**
If sanctions_matches populated: amber warning box listing matched entities and which sanction lists they appear on.

---

## 7. SIGNAL OUTCOME TRACKING (#121 — shipped; do not restore the old `alerts_sent` sketch)

The block that used to live here (`alerts_sent.outcome_direction`, "NOT YET BUILT", price-at-now vs a `price_at_signal` field) is **not** the live design. Live system: table `signal_outcomes` + daily worker `apps/backend/src/workers/outcome-tracker.ts` + public `GET /v1/accuracy` + public `/accuracy` page. Standing rules: D22 / ADR 018. Schema: `docs/brain/04_DATABASE.md` Table 18.

**Prerequisite:** **#53** (`commodity_impacts` historical backfill, `8733677`) — without filled `commodity_impacts`, there is nothing to score. **#115** (signal-quality live-data audit) first flagged the severity-bunching concern this session's investigation later confirmed and extended; #121 scores *direction* of `commodity_impacts`, not severity, but inherits that quality work as the reason empty/garbage impacts cannot be treated as a track record.

### Why a permanent table, not a live recompute

`commodity_prices` is retained 90 days (`retention.ts`). Recomputing hit-rate on demand from that table would silently lose every outcome older than 90 days and the public track record would shrink. `signal_outcomes` is written once per `(signal_id, asset)` and never rewritten. `GET /v1/accuracy` reads only this table.

### 48-hour fixed checkpoint, anchored on `event_date`

Not "price now" and not `created_at`. For every signal ≥48h old with a non-empty `commodity_impacts` array, for each `(signal, asset)` pair not already stored:

1. Price at `event_date` (article/event time).
2. Price at `event_date + 48h` (fixed horizon).
3. `actual_pct_change`, `actual_direction` (`up`/`down`/`flat` if `abs(pct) < 0.5`), `is_directionally_correct`.

`predicted_direction` / `predicted_confidence` are copied from that impact row, never re-derived. Cron: `0 5 * * *`. One-shot: `pnpm --filter backend outcome-tracker:once`.

A fixed 48h window is comparable across signals. A floating "price now" window would mix 2-day-old and 60-day-old events into one statistic.

### Headline hit-rate excludes `volatile` / `neutral`

`up`/`down` predictions score true/false against actual `up`/`down`. `volatile` and `neutral` have no single actual direction that would validate them, so `is_directionally_correct` is **NULL** and they are **not** in `hit_rate`. They are reported separately as `volatile_neutral_summary` (fraction whose actual move exceeded `VOLATILITY_THRESHOLD_PCT = 2%`, ~4× the 0.5% flat-noise floor). Do not blend that fraction into the headline percentage.

### 20-signal minimum per asset

`MIN_SAMPLE_SIZE = 20` scored (`up`/`down`) predictions. Below that, `hit_rate` is `null` and `not_enough_history: true`. A percentage on 11 EURUSD rows is more misleading than useful. Tunable judgment call, not a natural law. `sample_size_note` is always returned with `hit_rate`.

### 24h max-distance guard on price-point matching

The worker binary-searches each asset's `commodity_prices` series for the point closest to the target timestamp. Closest-in-the-table is not "observed near that time."

Prompt M / #121 backend (`1cdc95d`) found and fixed: *legacy pre-#87 EURUSD/USDRUB commodity_impacts entries (no forex price history before 2026-09-09) were clamping to a distant price and fabricating false 'flat' outcomes*. First pass wrote 3,263 rows including 349 with `price_at_event == price_at_checkpoint`. Those pairs had no real observation near either timestamp; both lookups clamped to the same earliest forex print, weeks away, so pct-change was 0 and the outcome was recorded as flat.

`MAX_PRICE_POINT_DISTANCE_MS = 24h` (largest real sync gap observed ~18h13m). Past that, skip and log — do not write. Wipe-and-rerun after the fix: 2,965 clean rows.

### What this is not

Not a trading backtest (the `/api/backtesting` demo endpoint is a different, still-mock surface). Not a "top signals" / "best calls" list — the `/accuracy` page is forbidden from ranking individual calls. Not live-recomputed. Not scored on severity.
