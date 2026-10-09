import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import {
  buildShadowInstruction,
  maybeScheduleGateShadow,
  __flushGateShadowQueueForTests,
  __resetGateShadowCountersForTests,
  type GateShadowCallParams,
} from "./gate-shadow.js";
import { MATERIALITY_GATE_INSTRUCTION } from "../services/claude.service.js";
import { formatWatchlistPromptBlock } from "./media-impact-watchlist.js";

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then(() => console.log(`✔ ${name}`))
        .catch((err) => {
          console.error(`✖ ${name}`);
          console.error(err);
          process.exitCode = 1;
        });
    }
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function makeMockClient(opts: { fail?: boolean } = {}) {
  let callCount = 0;
  return {
    callCount: () => callCount,
    client: {
      messages: {
        create: async () => {
          callCount++;
          if (opts.fail) throw new Error("simulated shadow Anthropic failure");
          return {
            content: [
              { type: "text", text: JSON.stringify({ materialityPass: true, materialityReasoning: "ok" }) },
            ],
            usage: { input_tokens: 100, output_tokens: 40 },
          };
        },
      },
    } as unknown as GateShadowCallParams["client"],
  };
}

function baseParams(overrides: Partial<GateShadowCallParams> = {}): Omit<GateShadowCallParams, "client" | "model"> {
  return {
    liveInstruction: MATERIALITY_GATE_INSTRUCTION,
    rawEvent: { id: "11111111-1111-1111-1111-111111111111", country: "Iran", event_type: "test" },
    title: "Test event",
    snippet: null,
    watchlist: [],
    similarStoryLast48h: false,
    liveVerdict: false,
    liveReason: "test reject",
    ...overrides,
  } as Omit<GateShadowCallParams, "client" | "model">;
}

const watchlist = [
  {
    entityName: "Test Central Bank Governor",
    entityAliases: [],
    tier: "institutional_official" as const,
    markets: ["USDRUB"],
    statementType: "monetary_policy",
    evidenceSummary: "test fixture",
    evidenceSources: [],
    caveat: "Explicitly transient — statistically insignificant after 5 trading days.",
  },
];

const liveGateText =
  formatWatchlistPromptBlock(watchlist) + "\n\nMATERIALITY GATE: " + MATERIALITY_GATE_INSTRUCTION;

async function main() {
  runTest("buildShadowInstruction moves the clarification sentence to the first lines", () => {
    const shadow = buildShadowInstruction(liveGateText);
    assert.ok(shadow.startsWith("Clarification of (a):"));
    assert.ok(!shadow.slice(200).includes("Clarification of (a):"));
  });

  runTest("buildShadowInstruction adds the CHANNELS block after criterion (b)", () => {
    const shadow = buildShadowInstruction(liveGateText);
    assert.ok(shadow.includes("CHANNELS (an additional way to satisfy criterion (b))"));
    assert.ok(
      shadow.includes(
        "it does not need to name a watchlist entity",
      ),
    );
  });

  runTest("buildShadowInstruction rewrites the watchlist caveat as a magnitude-only note", () => {
    const shadow = buildShadowInstruction(liveGateText);
    assert.ok(shadow.includes("- Test Central Bank Governor — Expected reaction size only:"));
    assert.ok(shadow.includes("This is a magnitude note, not a reason to reject the story."));
    // Entity itself must survive unchanged.
    assert.ok(shadow.includes("Test Central Bank Governor"));
  });

  runTest("buildShadowInstruction changes only those three things vs. the live text", () => {
    const shadow = buildShadowInstruction(liveGateText);
    // Strip the three known-changed regions out of both strings, then the
    // remainder must be identical — proof nothing else was touched.
    const liveStripped = liveGateText
      .replace(
        "Clarification of (a): a decision, quota, price announcement or data release that is reported today IS new information, even when the number is unchanged from last time or the outcome was widely expected; only a story that merely reminds the reader of an upcoming scheduled date, with no decision or data in it, fails (a).",
        "",
      )
      .replace(
        "- Test Central Bank Governor — Explicitly transient — statistically insignificant after 5 trading days.",
        "",
      );
    const shadowStripped = shadow
      .replace(
        "Clarification of (a): a decision, quota, price announcement or data release that is reported today IS new information, even when the number is unchanged from last time or the outcome was widely expected; only a story that merely reminds the reader of an upcoming scheduled date, with no decision or data in it, fails (a).",
        "",
      )
      .replace(
        " CHANNELS (an additional way to satisfy criterion (b)): 1) supply (production, exports, outages, sanctions, chokepoints, ports, pipelines, inventories); 2) demand and macro (central banks, growth data, import data); 3) trade policy (tariffs, export bans, quotas, licences); 4) currency and rates; 5) risk premium (threats, military build-ups, basing, alliances, escalation). A story qualifies if it plausibly acts on a tracked asset through any one of these channels; it does not need to name a watchlist entity.",
        "",
      )
      .replace(
        "- Test Central Bank Governor — Expected reaction size only: Explicitly transient — statistically insignificant after 5 trading days. This is a magnitude note, not a reason to reject the story.",
        "",
      );
    const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
    assert.equal(normalize(shadowStripped), normalize(liveStripped));
  });

  runTest("buildShadowInstruction is a no-op on text with no known anchors", () => {
    const unrelated = "some unrelated text with no watchlist lines or gate clauses";
    assert.equal(buildShadowInstruction(unrelated), unrelated);
  });

  await runTest("maybeScheduleGateShadow does nothing when GATE_SHADOW_ENABLED is not \"true\"", async () => {
    delete process.env.GATE_SHADOW_ENABLED;
    __resetGateShadowCountersForTests();
    const { client, callCount } = makeMockClient();
    maybeScheduleGateShadow({ ...baseParams(), client, model: "test-model" });
    await __flushGateShadowQueueForTests();
    assert.equal(callCount(), 0);

    process.env.GATE_SHADOW_ENABLED = "false";
    maybeScheduleGateShadow({ ...baseParams(), client, model: "test-model" });
    await __flushGateShadowQueueForTests();
    assert.equal(callCount(), 0);
  });

  await runTest("a shadow Anthropic error does not throw or break the next scheduled call", async () => {
    process.env.GATE_SHADOW_ENABLED = "true";
    __resetGateShadowCountersForTests();
    const failing = makeMockClient({ fail: true });
    maybeScheduleGateShadow({ ...baseParams(), client: failing.client, model: "test-model" });
    await __flushGateShadowQueueForTests();
    assert.equal(failing.callCount(), 1);

    // Queue must still be usable afterwards — one failure must not wedge it.
    const healthy = makeMockClient();
    maybeScheduleGateShadow({ ...baseParams(), client: healthy.client, model: "test-model" });
    await __flushGateShadowQueueForTests();
    assert.equal(healthy.callCount(), 1);
  });

  await runTest("the reject daily cap is respected", async () => {
    process.env.GATE_SHADOW_ENABLED = "true";
    process.env.GATE_SHADOW_MAX_REJECTS_PER_DAY = "2";
    __resetGateShadowCountersForTests();
    const { client, callCount } = makeMockClient();
    for (let i = 0; i < 5; i++) {
      maybeScheduleGateShadow({ ...baseParams({ liveVerdict: false }), client, model: "test-model" });
    }
    await __flushGateShadowQueueForTests();
    assert.equal(callCount(), 2);
    delete process.env.GATE_SHADOW_MAX_REJECTS_PER_DAY;
  });

  await runTest("the pass daily cap is respected (and passes are sampled, not every one called)", async () => {
    process.env.GATE_SHADOW_ENABLED = "true";
    process.env.GATE_SHADOW_MAX_PASSES_PER_DAY = "3";
    __resetGateShadowCountersForTests();
    const { client, callCount } = makeMockClient();
    for (let i = 0; i < 500; i++) {
      maybeScheduleGateShadow({ ...baseParams({ liveVerdict: true }), client, model: "test-model" });
    }
    await __flushGateShadowQueueForTests();
    assert.ok(callCount() <= 3, `expected at most 3 calls, got ${callCount()}`);
    delete process.env.GATE_SHADOW_MAX_PASSES_PER_DAY;
  });
}

main();
