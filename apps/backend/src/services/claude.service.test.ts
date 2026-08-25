import assert from "node:assert/strict";
import { ClaudeService } from "./claude.service.js";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

const service = new ClaudeService();

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => console.log(`✔ ${name}`));
    }
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function main() {
  runTest(
    "generateAnalysis fallback should read commodity_impacts (snake_case), not commodityImpacts",
    async () => {
      process.env.ANTHROPIC_API_KEY = "test-invalid-key-forces-fallback";
      try {
        const fallbackService = new ClaudeService();
        // Force the catch-block fallback path deterministically instead of relying on a real API failure.
        (fallbackService as unknown as { client: unknown }).client = {
          messages: {
            create: async () => {
              throw new Error("forced failure for fallback test");
            },
          },
        };

        const briefing = await fallbackService.generateAnalysis(
          {
            region: "Middle East",
            commodity_impacts: [
              { asset: "USOIL", direction: "up", confidence: 0.8 },
              { asset: "UKOIL", direction: "up", confidence: 0.7 },
            ],
          },
          { contextNotes: [] },
        );

        assert.ok(
          briefing.includes("USOIL") && briefing.includes("UKOIL"),
          `Expected fallback briefing to list real commodity impacts, got: ${briefing}`,
        );
      } finally {
        delete process.env.ANTHROPIC_API_KEY;
      }
    },
  );

  runTest(
    "unrelated company event should return no commodity impact",
    async () => {
      const classification = await service.classifyEvent({
        title: "Acme Corp announces earnings beat and new product roadmap",
        summary:
          "Shares rally after strong quarterly results and forward guidance.",
        event_type: "news",
        country: "US",
        event_date: new Date().toISOString(),
      });

      assert.deepEqual(classification.commodityImpacts, []);
    },
  );

  runTest("oil disruption should assign oil impacts", async () => {
    const classification = await service.classifyEvent({
      title: "Pipeline explosion halts crude export from Saudi refinery",
      summary:
        "Disruption in the Red Sea supply chain pushes crude oil prices higher.",
      event_type: "news",
      country: "SA",
      event_date: new Date().toISOString(),
    });

    const assets = classification.commodityImpacts.map(
      (impact) => impact.asset,
    );
    assert.ok(assets.includes("USOIL"), "Expected USOIL impact");
    assert.ok(assets.includes("UKOIL"), "Expected UKOIL impact");
    assert.strictEqual(
      classification.commodityImpacts.every((impact) => impact.confidence > 0),
      true,
    );
  });

  runTest(
    "geopolitical conflict with safe-haven mention should only map defensible assets",
    async () => {
      const classification = await service.classifyEvent({
        title:
          "Gold gains as investors seek safe haven after missile strike in eastern Europe",
        summary:
          "Market participants move to bullion amid rising geopolitical risk.",
        event_type: "news",
        country: "UA",
        event_date: new Date().toISOString(),
      });

      assert.deepStrictEqual(
        classification.commodityImpacts.map((impact) => impact.asset),
        ["XAUUSD"],
      );
    },
  );

  runTest(
    "ambiguous event should return empty commodity impact list",
    async () => {
      const classification = await service.classifyEvent({
        title: "Diplomatic talks continue ahead of possible trade negotiations",
        summary:
          "Officials meet to discuss future economic cooperation and policy frameworks.",
        event_type: "news",
        country: "US",
        event_date: new Date().toISOString(),
      });

      assert.deepEqual(classification.commodityImpacts, []);
    },
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
