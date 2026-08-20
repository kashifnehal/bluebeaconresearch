# 18_AI_ENGINE.md — AI Engine: Prompts, Models, Fallbacks

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

**Classification: Internal — CTO Level**

---

## 1. MODEL SELECTION

> ⚠️ UPDATED 2026-08-19 — this whole prompt/model spec describes the intended Claude-powered pipeline, but Anthropic API credit is currently exhausted ($0), so none of these Claude prompts are actually being called right now — the heuristic keyword-based fallback classifier is what's actually running in production. This is a good-faith spec for when credits are restored, not a description of current runtime behavior.
> ⚠️ UPDATED 2026-08-19 (same day, later pass) — Two more things found and fixed since the note above, worth knowing before credits are restored: (1) the model IDs actually wired into `claude.service.ts` were retired by Anthropic months ago (`claude-3-5-haiku-20241022` since 2026-02-19, `claude-3-5-sonnet-20241022` since 2025-10-28) — funding the account alone would *not* have fixed classification, it would have just traded the billing error for a model-not-found error. Updated to `claude-haiku-4-5-20251001` and `claude-sonnet-5`. (2) The API key itself was found to be mismatched between `apps/web/.env.local` and the repo-root `.env.local` that the backend actually reads — fixed and re-verified live (error changed from `401 authentication_error` to `400 "credit balance too low"`, confirming the key is valid, just unfunded). See `docs/brain/14_CHANGELOG.md` v0.27.0.
> ⚠️ UPDATED 2026-08-19 (credits now funded, one more real bug found) — Credits were funded ($5). Haiku classification confirmed genuinely live via a real API call (real `"type":"message"` response, real AI-written output). But `claude-sonnet-5` turned out to reject the `temperature` parameter entirely (`400 invalid_request_error: "temperature is deprecated for this model"`) — `generateAnalysis()` was still sending `temperature: 0.3`, so every Sonnet call failed and silently fell back to the generic template, even with funded credits. This is a genuinely new model-specific API behavior, not something the earlier model-ID fix could have caught (that fix only ever saw billing/auth errors, never reached parameter validation). Fixed by removing `temperature` from the one `claude-sonnet-5` call site; Haiku's own `temperature: 0.2` is a different model and is untouched. Re-verified live with a real, non-templated multi-paragraph briefing. See `docs/brain/14_CHANGELOG.md` v0.28.0.

| Task | Model | Why | Cost per 1K tokens |
|------|-------|-----|--------------------|
| Event classification (bulk) | Claude 3.5 Haiku | Fast, cheap, good JSON output | $0.0008 input / $0.001 output |
| Full intelligence briefing (severity ≥ 7) | Claude 3.5 Sonnet | Best prose quality, nuanced geopolitical reasoning | $0.003 input / $0.015 output |
| Morning brief generation | Claude 3.5 Sonnet | Same as briefing | Same |
| Economic calendar signal (planned) | Claude 3.5 Haiku | Macro release → structured signal | Same as classification |

**Cost estimate without pre-filter:**
- 350 events per 15 min × 96 cycles/day = 33,600 events/day
- Average tokens per classification: ~800 input + ~200 output
- Haiku cost: 33,600 × (800×0.0008 + 200×0.001) / 1000 = ~$28.7/day = $860/month
- WITH pre-filter (80% filtered out): ~$172/month

**Cost estimate with pre-filter:**
- 20% pass filter = 6,720 events/day classified
- ~$172/month Haiku for classification
- ~50 briefings/day (severity ≥ 7) × ~2000 tokens Sonnet = ~$90/month
- **Total target: ~$260/month at full capacity**

**Free alternative stack (discussed, not implemented):**
- Gemini Flash-Lite: 1,000 req/day free → classification
- Groq Llama 3.3 70B: 14,400 req/day free → fallback classification
- Keep Claude Sonnet only for full briefings (250 req/day free on Gemini Flash)
- Target cost: **$0/month** at current volume

---

## 2. CLASSIFICATION PROMPT (claude.service.ts)

```
SYSTEM:
You are an expert geopolitical analyst specializing in commodity market impact assessment.
You classify global events for a professional intelligence platform used by commodity traders.
Return ONLY valid JSON. No preamble, no markdown, no explanation.

USER:
EVENT TITLE: {title}
EVENT SUMMARY: {summary}
COUNTRY: {country}
REGION: {region}
SOURCE: {source}
EVENT DATE: {eventDate}
GOLDSTEIN SCALE: {goldsteinScale} (range -10 to +10, negative = conflictual)
SOURCE COUNT: {sourcesCount} articles confirming this event
ACTOR CONTEXT: {actorContext}

Return this exact JSON:
{
  "severity": <integer 1-10>,
  "confidence": <float 0.0-1.0>,
  "event_type": "<conflict|sanctions|trade_policy|naval_exercise|military_buildup|cyber_attack|election|coup|protest|energy_disruption|food_security|natural_disaster|central_bank|other>",
  "event_category": "<conflict|sanctions|trade_policy|central_bank|food_security|energy|election|natural_disaster|macro_release|other>",
  "commodity_impacts": [
    {"asset": "<USOIL|UKOIL|XAUUSD|NGAS|WHEAT|COPPER|XAGUSD|CORN>", "direction": "<up|down|volatile|neutral>", "confidence": <float>}
  ],
  "summary": "<1-2 sentence neutral factual summary>",
  "consumer_impact": "<1 sentence on consumer price impact, or null>",
  "is_breaking": <true|false>
}

SEVERITY RULES:
10 = Active nuclear threat / attack on major oil hub / war between great powers
9 = Major military strike / Hormuz closure / G20 sanctions
8 = Significant escalation / major sanctions / infrastructure attack
7 = Credible military threat / secondary sanctions / significant disruption
4-6 = Diplomatic tensions / minor incidents / background noise
1-3 = Informational only / no market relevance

CONFIDENCE RULES:
0.85-1.0 = Direct confirmed attack on commodity infrastructure
0.65-0.84 = High-credibility threat, 3+ source confirmation
0.45-0.64 = Indirect risk, escalation pathway
0.00-0.44 = Speculative, low market relevance

COMMODITY RULES:
- Only include assets with a direct, named market mechanism
- Maximum 3 commodity_impacts
- Return [] if no clear commodity connection
- Never include assets just because they are "generally affected by geopolitical risk"
```

---

## 3. FULL BRIEFING PROMPT (claude.service.ts — generateBriefing)

```
SYSTEM:
You are Blue Beacon Research's senior intelligence analyst.
Your audience: professional commodity traders and risk managers.
Style: Reuters wire + Goldman Sachs research note. Direct, authoritative, no sensationalism.
Never recommend trades. Always add disclaimer at end.
Maximum 600 words.

USER:
Write an intelligence briefing for:

EVENT: {title}
COUNTRY: {country} | REGION: {region}
SEVERITY: {severity}/10 | CONFIDENCE: {confidence}
EVENT TYPE: {eventType}
CONFIRMED BY: {sourcesCount} sources

CONTEXT:
Actors: {actors}
Fatalities reported: {fatalities}
Field notes: {acledNotes}
Related articles: {relatedArticles}
Commodity impact: {commodityImpacts}
Nearest chokepoint: {shippingProximity}

Write exactly these paragraphs:

§1 SITUATION — What happened. Confirmed facts only. Precise dates, locations, actors.

§2 CONTEXT — Why this region/actor/route matters geopolitically. Brief history if relevant.

§3 MARKET MECHANISM — Name the exact mechanism: supply disruption / demand shock / risk premium / sanctions enforcement / currency effect. Quantify where possible (X% of global oil / Y% of wheat exports).

§4 HISTORICAL PRECEDENT — 2-3 comparable events with actual outcomes. "When [event] happened in [year], [commodity] moved [X]% over [timeframe]."

§5 RISK SCENARIOS — Escalation path (what happens if this worsens) AND de-escalation path (what resolves it). Be specific about market implications of each.

§6 WATCH INDICATORS — 3-5 specific signals to monitor in the next 24-72 hours. Observable, not vague.

[Optional §7 SUPPLY CHAIN NOTE — If relevant for import/export businesses]

End with: "Intelligence provided for informational purposes only. Not financial advice. — Blue Beacon Research"
```

---

## 4. MORNING BRIEF PROMPT

```
SYSTEM:
You are Blue Beacon Research's morning analyst.
Write a daily intelligence brief for commodity traders. Maximum 250 words.
Format exactly as specified. Direct. No filler. Every word earns its place.

USER:
DATE: {date} | TIME: 07:45 UTC

TOP SIGNALS LAST 24H:
{topSignals}

TODAY'S CALENDAR:
{economicEvents}

COMMODITY PRICES NOW:
{prices}

Write in this exact format:

BLUE BEACON RESEARCH — MORNING BRIEF
{date} | 07:45 UTC
━━━━━━━━━━━━━━━━━━━━

OVERNIGHT INTELLIGENCE
[2-3 sentences on the most market-relevant overnight development]

TODAY'S CRITICAL EVENTS
[Bullet list max 3: "HH:MM UTC — [Event] — [Why it matters in 8 words]"]

MARKET CONTEXT
[2 sentences on current price levels and notable overnight moves]

ANALYST NOTE
[1 sentence on primary risk to watch today]
━━━━━━━━━━━━━━━━━━━━
Not financial advice. bluebeaconresearch.com
```

---

## 5. JSON PARSING & FALLBACK

```typescript
// claude.service.ts — safe JSON extraction
async function parseClaudeJSON<T>(content: string): Promise<T | null> {
  // Remove markdown fences if present
  const cleaned = content
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim()

  try {
    return JSON.parse(cleaned) as T
  } catch {
    // Try extracting JSON object from response
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      try { return JSON.parse(match[0]) as T }
      catch { return null }
    }
    return null
  }
}

// On parse failure → retry once with explicit instruction:
// "Return ONLY a JSON object. Your previous response could not be parsed."
// On second failure → mark event as unclassifiable, log, continue
```

---

## 6. RETRY & RATE LIMIT HANDLING

```typescript
async function callClaudeWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      if (err.status === 429) {
        // Rate limited — exponential backoff
        const waitMs = Math.pow(2, attempt) * 1000
        console.warn(`[CLAUDE] Rate limited. Waiting ${waitMs}ms. Attempt ${attempt}/${maxRetries}`)
        await new Promise(r => setTimeout(r, waitMs))
      } else if (err.status === 529) {
        // Overloaded — longer wait
        await new Promise(r => setTimeout(r, 30000))
      } else {
        console.error(`[CLAUDE] Error on attempt ${attempt}:`, err.message)
        if (attempt === maxRetries) return null
      }
    }
  }
  return null
}
```

---

## 7. DAILY SPEND CAP (NEEDS IMPLEMENTATION)

```typescript
// Add to ai-classifier.ts before every Claude call
async function checkDailySpendCap(): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0]
  const key = `ai_spend:${today}`
  const spent = parseFloat(await redis.get(key) || '0')
  const CAP_USD = 10.00 // $10/day hard cap
  if (spent >= CAP_USD) {
    console.error(`[SPEND CAP] Daily AI spend cap of $${CAP_USD} reached. Pausing classification.`)
    return false // Do not proceed
  }
  return true
}

// After every Claude call, log cost:
async function logAiCost(model: string, inputTokens: number, outputTokens: number) {
  // ⚠️ UPDATED 2026-08-19 — these model keys/rates are stale (spec-only code, never
  // implemented — see "NEEDS IMPLEMENTATION" heading above). The IDs actually in use
  // now are `claude-haiku-4-5-20251001` and `claude-sonnet-5` (docs/brain/14_CHANGELOG.md
  // v0.27.0); if this spend-cap feature gets built, look up current per-model pricing at
  // implementation time rather than reusing these numbers.
  const costs: Record<string, [number, number]> = {
    'claude-3-5-haiku-latest': [0.0000008, 0.000001],
    'claude-3-5-sonnet-latest': [0.000003, 0.000015],
  }
  const [inRate, outRate] = costs[model] || [0, 0]
  const cost = (inputTokens * inRate) + (outputTokens * outRate)
  const today = new Date().toISOString().split('T')[0]
  await redis.incrbyfloat(`ai_spend:${today}`, cost)
  await redis.expire(`ai_spend:${today}`, 86400 * 2) // 48hr TTL
}
```
