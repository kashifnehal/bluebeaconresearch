# 20_RISKS.md — Risk Register & Mitigations

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

**Classification: Internal — CTO Level**

---

## 1. BUSINESS RISKS

### BR1 — WorldMonitor goes fully free with all Pro features
**Probability: Medium | Impact: High**
WorldMonitor already has 59K GitHub stars and launched a paid tier. If they reverse that and offer all Pro features free, BBR's $49 price point becomes very hard to justify.
**Mitigation:** BBR's moat is personalization + commodity-specific backtesting + trader framing — features WorldMonitor has explicitly not built. Double down on these. Never compete on data breadth. If WorldMonitor goes free: lean harder into "personal intelligence terminal" framing vs "one-size-fits-all dashboard."

### BR2 — Signal quality too poor to retain users
**Probability: High (currently) | Impact: Critical**
The current state (FIFA Vancouver as top signal) will cause immediate churn if shown to real users. One bad first impression = user never returns.

> ⚠️ UPDATED 2026-08-19 — this specific FIFA-Vancouver-as-top-signal quality bug is long since resolved (it's from an earlier project phase also referenced in this tree's `09_BACKLOG.md`); it's not reflective of current signal quality.
**Mitigation:** Fix signal pre-filter BEFORE opening to any users. Set PROJECT_READY=false until signal quality is verified. Benchmark: at least 5 consecutive high-quality signals (real geopolitical events, severity ≥ 7, correct commodity mapping) before enabling access.

### BR3 — No paying customers after 3 months
**Probability: Medium | Impact: High**
BBR is currently all free (Stripe stubbed). If organic conversion is low, revenue never materializes.
**Mitigation:** Implement Stripe at Month 3. Target institutional customers directly (boutique funds, commodity trading firms) with outbound — higher conversion than consumer inbound. Have a clear "enterprise demo" path for anyone spending > $5K/month on alternative tools.

### BR4 — Geopolitical events go quiet
**Probability: Low | Impact: Medium**
If the world somehow becomes peaceful, high-severity signals stop firing. Users see an empty feed. Churn spikes.
**Mitigation:** Economic calendar (scheduled events: CPI, Fed decisions, OPEC meetings) is NOT dependent on conflict. Always generates content. This is why the calendar is critical — it provides daily value regardless of geopolitical state.

### BR5 — Wrong legal positioning (classified as financial advisor)
**Probability: Low | Impact: Critical**
If a regulator interprets BBR's signals as "financial advice" or "investment recommendations," the business could face regulatory action.
**Mitigation:** Disclaimer on every signal card, every email, every alert delivery: "Intelligence for informational purposes only. Not financial advice." Never use language like "buy," "sell," "position," "trade," "profit." Always frame as "market implications" and "historical patterns" not "predictions" or "recommendations." Consult a financial regulation attorney before institutional sales. Consider an explicit "For sophisticated investors and professionals only" gate on the API tier.

---

## 2. TECHNICAL RISKS

### TR1 — Claude API breaks or price doubles
**Probability: Medium | Impact: High**
Anthropic changed pricing once (Sonnet 3.5 → 3.6 pricing change). A sudden 2x price increase would double AI costs.
**Mitigation:** Never lock into single AI provider. Maintain Gemini Flash-Lite and Groq as tested fallbacks. The classification prompt works on all three. Switch takes < 1 day if needed. Implement daily spend cap ($10/day) to limit exposure.

### TR2 — GDELT changes format or goes offline
**Probability: Low | Impact: High**
GDELT has been running since 2013 and has never had a major outage. However, it is maintained by a single researcher (Kalev Leetaru). If the project is abandoned, BBR loses its primary data source.
**Mitigation:** ACLED + GNews + Guardian + RSS feeds provide independent signal sources. GDELT going down reduces volume significantly but doesn't eliminate the pipeline. Maintain ACLED as primary alternative. Consider adding NewsAPI, Mediastack, or Currents API as additional sources.

### TR3 — Yahoo Finance blocks the unofficial API
**Probability: Medium | Impact: High**
yahoo-finance2 uses an unofficial Yahoo Finance API. Yahoo has been known to break third-party libraries without warning.
**Mitigation:** Maintain hardcoded FALLBACK_PRICES in code. Add Alpha Vantage paid ($50/mo) as verified backup. Consider Finnhub (free tier, 60 req/min) or Twelve Data (free tier) as alternatives. The Redis cache TTL (15 min) means short outages (< 15 min) are invisible to users.

### TR4 — Supabase RLS misconfiguration leads to data leak
**Probability: Low | Impact: Critical**
A misconfigured RLS policy could allow User A to see User B's alert rules, API keys, or Telegram chat ID.
**Mitigation:** All sensitive tables have RLS enabled. The backend uses service role key (bypasses RLS) only in apps/backend — never in frontend code. Regular RLS audit: run the test query `SELECT * FROM alert_rules WHERE user_id != auth.uid()` — should return 0 rows. Add this to the CI/CD pipeline as a test.

### TR5 — Railway credits run out, services stop
**Probability: Very High (imminent) | Impact: Critical**
Railway shows $1.00 credit remaining. When it hits $0, ALL services in the project stop.
**Mitigation:** Add credit card to Railway IMMEDIATELY. Estimated monthly cost with 2 services: $5-15/month. Set up Railway billing alerts at $10, $20, $50 thresholds.

### TR6 — SSE overloads Supabase at scale
**Probability: Medium at 5K+ users | Impact: High**
Current SSE polls Supabase every 60 seconds per connection. At 10K users: 10,000 queries/min on Supabase free tier = overload.
**Mitigation:** At 1K users: upgrade Supabase to Pro ($25/mo). At 5K users: switch SSE to Redis pub/sub fan-out (signal-generator publishes to Redis channel, SSE subscribes). This reduces DB queries to O(1) regardless of user count.

### TR7 — Claude produces hallucinated sanctions matches
**Probability: Medium | Impact: High**
If Claude incorrectly matches a legitimate actor (company, government official) to a sanctions list, BBR could be displaying false information that affects financial decisions.
**Mitigation:** Sanctions matching is done via DB full-text search against official OFAC/EU/UN data — NOT via Claude. Claude never decides who is sanctioned. Only entities explicitly in the sanctions_entities table (synced from official sources daily) are shown as matches.

---

## 3. LEGAL RISKS

### LR1 — Financial advice classification
**Details in BR5 above.** Most important legal risk. Ensure all disclaimers are prominent, consistent, and legally reviewed before institutional sales.

### LR2 — GDELT data attribution requirements
**Probability: Low | Impact: Low**
GDELT data is available under open access but Leetaru's terms ask for attribution.
**Mitigation:** Include "Powered by GDELT" attribution in the product (footer of data pages). This is cosmetically fine and protects attribution.

### LR3 — User data privacy (GDPR / India PDPB)
**Probability: Low | Impact: Medium**
BBR collects: email, name, Telegram chat ID, alert preferences, usage patterns.
**Mitigation:** Privacy policy covers all data collected. No personal data shared with third parties except Stripe (billing). Supabase is GDPR-compliant (EU data residency available). Data deletion: Settings → Data tab → Delete account (anonymizes all personal data). Do NOT sell or share user data with any third party including advertisers.

### LR4 — Telegram bot terms of service
**Probability: Low | Impact: Low**
Telegram bots cannot be used for spam or unsolicited commercial messages.
**Mitigation:** BBR only sends Telegram alerts to users who explicitly connected their account and set up alert rules. All messages are solicited and actionable. No promotional messages via the bot.

---

## 4. MARKET RISKS

### MR1 — Geopolitical intelligence market consolidates
**Probability: Medium | Impact: Medium**
Bloomberg, Refinitiv, or MSCI acquires WorldMonitor or a similar tool and offers it as a free add-on to existing subscriptions.
**Mitigation:** BBR's $49 price point is competitive even against a "free" bundled tool if the personalization and trader-specific framing are noticeably better. The API tier ($499/mo) serves a customer who would use BBR regardless of free alternatives because they need the structured JSON feed for their own systems.

### MR2 — AI democratization eliminates the intelligence gap
**Probability: High over 3 years | Impact: Medium**
As LLMs improve, every trader could theoretically prompt ChatGPT to analyze geopolitical events for free. Why pay BBR?
**Mitigation:** BBR's value is NOT the LLM — it's the pipeline. Continuous monitoring, pre-filtering, GDELT/ACLED ingestion, real-time alert delivery, historical backtesting, and accuracy tracking cannot be replicated by asking ChatGPT. The value is in the automation and delivery, not just the analysis. Emphasize this in positioning: "You shouldn't have to remember to ask. We tell you before you know to ask."

---

## 5. SCALING RISKS

### SR1 — AI cost explodes at scale
**Probability: High without mitigation | Impact: Critical**
At 10K users with high engagement: 500 events/15min × 24% pass filter × 96 cycles = 11,520 classified events/day. With Sonnet briefings for all severity 7+ events (~30% of classified = 3,456/day × ~$0.01/briefing = $34.56/day = $1,037/month) — this exceeds expected revenue at early scale.
**Mitigation:** (1) Daily spend cap prevents runaway costs. (2) Only generate Sonnet briefings for severity 8+ (not 7). (3) Cache briefings: if the same geopolitical situation generates multiple signals over 4 hours, reuse the existing briefing. (4) Switch Haiku classification to Gemini Flash-Lite (free 1K/day). (5) Charge enough that AI costs are a small % of revenue.
> ⚠️ UPDATED 2026-08-19 — Status on each, checked against the real implementation, not assumed: (1) daily spend cap — still not built (see `18_AI_ENGINE.md` §7, "NEEDS IMPLEMENTATION"). (2) actual live gate is severity **>= 7**, not 8+ as written here — a real discrepancy between this doc and the code, worth a founder decision on which was intended. (3) **done**, though not exactly as envisioned: rather than a time-based cache, a cross-source signal merge (`docs/brain/10_DECISIONS.md` ADR 010) now detects the same event via classified-summary similarity within an 8h window and reuses the existing briefing instead of generating a new one — functionally the mitigation this risk called for, verified live against real production data. (4) not done — still Anthropic-only, no Gemini fallback exists. (5) a pricing/business decision, not a code question — status not evaluated here. Also worth noting: a cost-scaling audit done the same day (`14_CHANGELOG.md` v0.27.0) confirmed no user-triggered Claude call path exists anywhere in `apps/web`, so this risk's premise ("At 10K users...") should really be modeled against ingestion volume, not user count — the two are decoupled in this architecture.

### SR2 — Database size grows unmanageably
**Probability: Low short-term | Impact: Medium**
signals table growing at ~50 records/day = 18,250/year. raw_events at ~1,000/day = 365,000/year. commodity_prices at ~8 symbols × 96 cycles/day = 768 records/day = 280,320/year.
**Mitigation:** Purge raw_events older than 90 days (irrelevant, signals are the processed output). Purge commodity_prices older than 30 days. Archive old signals to cold storage (Supabase does this automatically). Add created_at-based partitioning to signals table at 500K+ records.

### SR3 — Single-point Railway failure
**Probability: Low | Impact: High**
Railway has had occasional outages. If Railway goes down, both the API and workers stop.
**Mitigation:** Workers are cron-based — they will resume on restart with no data loss (raw_events and signals are in Supabase). API downtime: users see stale data. Add UptimeRobot monitoring on /health endpoint with email alert. In future: migrate workers to separate cloud function (Render, Fly.io, or AWS Lambda) for redundancy.
