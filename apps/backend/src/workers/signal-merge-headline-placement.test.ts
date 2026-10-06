import assert from "node:assert/strict";
import { ClaudeService } from "../services/claude.service.js";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-supabase-role-key";

function runTest(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`✔ ${name}`);
    } catch (err) {
      console.error(`✖ ${name}`);
      console.error(err);
      process.exitCode = 1;
    }
  })();
}

// claude/277 A6 follow-up, founder decision D9 (2026-10-01): with
// HEADLINE_PLACEMENT_SEVERITY_BONUS disabled (0), signal-merge.ts's escalation
// branch (fires when classification.severity > match.severity — see
// workers/signal-merge.ts) must not be triggered purely by a duplicate article
// reporting the same event with different headline/body placement. This does
// not touch signal-merge.ts itself; it proves the severity classifyEvent()
// hands to signal-merge is placement-invariant now that the bonus is off.
await runTest(
  "an identical duplicate article with headline vs body placement produces the same severity (bonus disabled)",
  async () => {
    const service = new ClaudeService();
    // Leave client unset. getClient() returns null when NODE_ENV=test, so this
    // takes the no_client heuristic path. A throwing client is now api_error →
    // deferred (founder decision 2026-10-06), not heuristicClassify().
    const event = {
      title: "Central bank discloses gold reserves data",
      summary: "A routine disclosure with no severity-tier keyword present.",
      event_type: "news",
      country: "US",
      event_date: new Date().toISOString(),
    };

    const headline = await service.classifyEvent(event, { headlinePlacement: "headline" });
    const body = await service.classifyEvent(event, { headlinePlacement: "body" });

    assert.strictEqual(headline.classificationMethod, "heuristic");
    assert.strictEqual(
      headline.severity,
      body.severity,
      "headline vs body placement must not produce different severities while the bonus is disabled " +
        "— a difference here would wrongly take signal-merge.ts's escalation branch for a duplicate " +
        "article whose only difference is placement, not new information",
    );
  },
);
