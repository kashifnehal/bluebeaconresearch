// TASK NQW3-FILTER1 Part 3 — tests for shownDirection(), the CLASSIFIER_DIRECTION_V3
// parse/sanitize path, and the flag-off/flag-on no-new-keys behavior.
import assert from "node:assert/strict";
import {
  ClaudeService,
  shownDirection,
  buildDirectionV3InsertFields,
  type ClassificationResult,
} from "./claude.service.js";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";
delete process.env.REDIS_URL;
delete process.env.UPSTASH_REDIS_REST_URL;

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

type Direction = "up" | "down" | "volatile" | "neutral";
const DIRECTIONS: Direction[] = ["up", "down", "volatile", "neutral"];
const CHANNELS = [
  "supply_transit_risk",
  "demand_macro",
  "opec_supply_news",
  "policy_other",
  "unclear",
] as const;

async function main() {
  // ── shownDirection truth table — every channel x direction x empty/non-empty basis ──
  await runTest("shownDirection truth table covers every channel x direction x basis combination", () => {
    for (const direction of DIRECTIONS) {
      for (const channel of CHANNELS) {
        for (const basis of ["", "Strait of Hormuz tanker traffic"]) {
          const result = shownDirection(direction, channel, basis);
          const hasBasis = basis.length > 0;
          const expectUp =
            direction === "up" && hasBasis && (channel === "supply_transit_risk" || channel === "opec_supply_news");
          const expectDown =
            direction === "down" && hasBasis && (channel === "demand_macro" || channel === "opec_supply_news");
          const expected = expectUp ? "up" : expectDown ? "down" : "none";
          assert.equal(
            result,
            expected,
            `direction=${direction} channel=${channel} basis="${basis}" expected ${expected}, got ${result}`,
          );
        }
      }
    }
  });

  await runTest("shownDirection treats whitespace-only channelBasis as empty", () => {
    assert.equal(shownDirection("up", "supply_transit_risk", "   "), "none");
  });

  await runTest("shownDirection treats null/undefined channelBasis and channel as no-show", () => {
    assert.equal(shownDirection("up", null, null), "none");
    assert.equal(shownDirection("down", undefined, undefined), "none");
  });

  // ── buildDirectionV3InsertFields ──────────────────────────────────────────
  await runTest("buildDirectionV3InsertFields returns {} when impactChannel is undefined (flag off)", () => {
    const classification = { impactChannel: undefined } as unknown as ClassificationResult;
    assert.deepEqual(buildDirectionV3InsertFields(classification), {});
  });

  await runTest("buildDirectionV3InsertFields returns the three columns when impactChannel is set (flag on)", () => {
    const classification = {
      impactChannel: "supply_transit_risk",
      channelBasis: "Strait of Hormuz",
      geoType: "act",
    } as unknown as ClassificationResult;
    assert.deepEqual(buildDirectionV3InsertFields(classification), {
      impact_channel: "supply_transit_risk",
      channel_basis: "Strait of Hormuz",
      geo_type: "act",
    });
  });

  // ── classifyEvent() parse path — flag off/on, bad values, unchanged `direction` ──
  function mockClient(responseJson: Record<string, unknown>) {
    return {
      messages: {
        create: async () => ({
          content: [{ type: "text", text: JSON.stringify(responseJson) }],
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      },
    };
  }

  const BASE_RESPONSE = {
    severity: 7,
    confidence: 0.7,
    commodityImpacts: [{ asset: "Crude Oil", direction: "up", confidence: 0.8 }],
    currencyPairImpacts: [],
    isBreaking: false,
    title: "Tanker blocked in Strait of Hormuz",
    summary: "Tanker blocked in Strait of Hormuz",
    region: "middle-east",
    country: "Iran",
    relevance: 0.9,
    novelty: 0.8,
    eventCategory: "supply_disruption_logistics",
    marketMechanism: "Blocks tanker traffic",
    isPreview: false,
    sourceConfirmation: "reported",
    materialityPass: true,
    materialityReasoning: "names a real supply route",
    mediaImpactEntity: null,
    invalidationCondition: "if the blockage is not independently confirmed",
  };

  await runTest("flag off: classifyEvent writes no impactChannel/channelBasis/geoType and no direction_shown key", async () => {
    delete process.env.CLASSIFIER_DIRECTION_V3;
    const service = new ClaudeService();
    (service as unknown as { client: unknown }).client = mockClient({
      ...BASE_RESPONSE,
      impactChannel: "supply_transit_risk",
      channelBasis: "Strait of Hormuz",
      geoType: "act",
    });
    process.env.ANTHROPIC_API_KEY = "test-invalid-key-forces-client";
    try {
      const classification = await service.classifyEvent({
        title: "Tanker blocked in Strait of Hormuz",
        summary: "Tanker blocked",
        event_type: "news",
        country: "Iran",
        event_date: new Date().toISOString(),
      });
      assert.equal(classification.impactChannel, undefined);
      assert.equal(classification.channelBasis, undefined);
      assert.equal(classification.geoType, undefined);
      assert.equal(classification.commodityImpacts.length, 1);
      assert.ok(!("direction_shown" in classification.commodityImpacts[0]));
      assert.equal(classification.commodityImpacts[0].direction, "up");
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  await runTest("flag on: classifyEvent writes impactChannel/channelBasis/geoType and direction_shown on each commodity impact", async () => {
    process.env.CLASSIFIER_DIRECTION_V3 = "true";
    const service = new ClaudeService();
    (service as unknown as { client: unknown }).client = mockClient({
      ...BASE_RESPONSE,
      impactChannel: "supply_transit_risk",
      channelBasis: "Strait of Hormuz tanker traffic",
      geoType: "act",
    });
    process.env.ANTHROPIC_API_KEY = "test-invalid-key-forces-client";
    try {
      const classification = await service.classifyEvent({
        title: "Tanker blocked in Strait of Hormuz",
        summary: "Tanker blocked",
        event_type: "news",
        country: "Iran",
        event_date: new Date().toISOString(),
      });
      assert.equal(classification.impactChannel, "supply_transit_risk");
      assert.equal(classification.channelBasis, "Strait of Hormuz tanker traffic");
      assert.equal(classification.geoType, "act");
      assert.equal(classification.commodityImpacts[0].direction, "up");
      assert.equal(classification.commodityImpacts[0].direction_shown, "up");
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CLASSIFIER_DIRECTION_V3;
    }
  });

  await runTest("flag on: original `direction` value is never changed by direction_shown", async () => {
    process.env.CLASSIFIER_DIRECTION_V3 = "true";
    const service = new ClaudeService();
    (service as unknown as { client: unknown }).client = mockClient({
      ...BASE_RESPONSE,
      commodityImpacts: [{ asset: "Crude Oil", direction: "up", confidence: 0.8 }],
      // demand_macro + "up" -> direction_shown "none", but `direction` itself must stay "up".
      impactChannel: "demand_macro",
      channelBasis: "global demand slowdown",
      geoType: "act",
    });
    process.env.ANTHROPIC_API_KEY = "test-invalid-key-forces-client";
    try {
      const classification = await service.classifyEvent({
        title: "Demand slowdown story",
        summary: "Demand slowdown",
        event_type: "news",
        country: "US",
        event_date: new Date().toISOString(),
      });
      assert.equal(classification.commodityImpacts[0].direction, "up");
      assert.equal(classification.commodityImpacts[0].direction_shown, "none");
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CLASSIFIER_DIRECTION_V3;
    }
  });

  await runTest("flag on: invalid/missing impactChannel/geoType/channelBasis never throw and fall back per spec", async () => {
    process.env.CLASSIFIER_DIRECTION_V3 = "true";
    const service = new ClaudeService();
    (service as unknown as { client: unknown }).client = mockClient({
      ...BASE_RESPONSE,
      impactChannel: "not-a-real-channel",
      channelBasis: null,
      geoType: "not-a-real-geo-type",
    });
    process.env.ANTHROPIC_API_KEY = "test-invalid-key-forces-client";
    try {
      const classification = await service.classifyEvent({
        title: "Garbled channel fields",
        summary: "Garbled",
        event_type: "news",
        country: "US",
        event_date: new Date().toISOString(),
      });
      assert.equal(classification.impactChannel, "unclear");
      assert.equal(classification.channelBasis, "");
      assert.equal(classification.geoType, null);
      assert.equal(classification.commodityImpacts[0].direction_shown, "none");
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CLASSIFIER_DIRECTION_V3;
    }
  });

  await runTest("flag on: missing impactChannel/geoType/channelBasis keys entirely never throw", async () => {
    process.env.CLASSIFIER_DIRECTION_V3 = "true";
    const service = new ClaudeService();
    (service as unknown as { client: unknown }).client = mockClient({ ...BASE_RESPONSE });
    process.env.ANTHROPIC_API_KEY = "test-invalid-key-forces-client";
    try {
      const classification = await service.classifyEvent({
        title: "No channel fields at all",
        summary: "No channel fields",
        event_type: "news",
        country: "US",
        event_date: new Date().toISOString(),
      });
      assert.equal(classification.impactChannel, "unclear");
      assert.equal(classification.channelBasis, "");
      assert.equal(classification.geoType, null);
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CLASSIFIER_DIRECTION_V3;
    }
  });

  // ── heuristic fallback path (no client => classifyEvent() takes the no_client path) ──
  await runTest("heuristic fallback: flag off writes no impactChannel/channelBasis/geoType/direction_shown keys", async () => {
    delete process.env.CLASSIFIER_DIRECTION_V3;
    delete process.env.ANTHROPIC_API_KEY;
    const service = new ClaudeService();
    const classification = await service.classifyEvent({
      title: "OPEC considers production cut amid oil price pressure",
      summary: "OPEC oil production cut discussion",
      event_type: "news",
      country: "Saudi Arabia",
      event_date: new Date().toISOString(),
    });
    assert.equal(classification.classificationMethod, "heuristic");
    assert.equal(classification.impactChannel, undefined);
    assert.equal(classification.geoType, undefined);
    if (classification.commodityImpacts.length > 0) {
      assert.ok(!("direction_shown" in classification.commodityImpacts[0]));
    }
  });

  await runTest("heuristic fallback: flag on sets impactChannel 'unclear' and direction_shown 'none' on every commodity impact", async () => {
    process.env.CLASSIFIER_DIRECTION_V3 = "true";
    delete process.env.ANTHROPIC_API_KEY;
    const service = new ClaudeService();
    try {
      const classification = await service.classifyEvent({
        title: "OPEC considers production cut amid oil price pressure",
        summary: "OPEC oil production cut discussion",
        event_type: "news",
        country: "Saudi Arabia",
        event_date: new Date().toISOString(),
      });
      assert.equal(classification.classificationMethod, "heuristic");
      assert.equal(classification.impactChannel, "unclear");
      assert.equal(classification.channelBasis, "");
      assert.equal(classification.geoType, null);
      assert.ok(classification.commodityImpacts.length > 0, "expected at least one heuristic commodity impact for this oil-keyword text");
      for (const impact of classification.commodityImpacts) {
        assert.equal(impact.direction_shown, "none");
      }
    } finally {
      delete process.env.CLASSIFIER_DIRECTION_V3;
    }
  });
}

main();
