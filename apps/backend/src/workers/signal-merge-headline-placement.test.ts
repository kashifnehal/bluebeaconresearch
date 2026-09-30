import assert from "node:assert/strict";
import { ClaudeService } from "../services/claude.service.js";

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
    // Never let classifyEvent() build a real Anthropic SDK client in this file.
    // .env.local may contain a live key; a 401 still leaves the machine. Forcing
    // the mocked client to throw exercises heuristicClassify(), which is what
    // this test needs (a real Claude read is covered by claude.service.test.ts).
    (service as unknown as { client: unknown }).client = {
      messages: {
        create: async () => {
          throw new Error("mocked anthropic — tests must not call the live API");
        },
      },
    };
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
