# 17_SIGNAL_ENGINE.md — Signal Generation Logic (brain annex)

> This file mirrors `docs/claude_project/17_SIGNAL_ENGINE.md` section 2.2 only. `docs/claude_project/17_SIGNAL_ENGINE.md` is canonical; see CLAUDE.md doc-precedence rule.

### 2.2 Severity Calculation (Multi-factor)

The AI classifier considers these factors in severity scoring:

**Factor 1: Goldstein Scale (from GDELT) — planned, not built**
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

**Factor 3: Chokepoint proximity — planned, not built**
- Event within 50km of Hormuz/Suez/Malacca/Bab-el-Mandeb: +1 to severity
- Event within 50-200km: +0.5
- Event beyond 200km: no adjustment

**Factor 4: Actor significance — planned, not built**
- Named state actor (Iran, Russia, China, US): no change (expected)
- Named non-state actor (Houthis, Hezbollah): +0.5 (unpredictability premium)
- Sanctions match in actor names: +0.5

No such scoring exists in apps/backend/src/services/claude.service.ts as of 2026-10-01.

**Factor 5: AI re-scoring**
Claude's output severity is the final arbiter. The Goldstein-based estimate is provided as context in the prompt, but Claude can override it based on the full event context.
