import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

// PERS-Pn: computeMatchReason() and buildAlertBody() are pure given their inputs —
// importing the module only constructs a lazy Supabase client + HTTP service
// wrappers (no network call happens at import time), same as the other worker tests
// in this directory.
const { computeMatchReason, buildAlertBody } = await import("./alert-dispatcher.js");

let failed = false;
function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    failed = true;
    console.error(`✖ ${name}`);
    console.error(err);
  }
}

runTest("a signal asset on the user's watchlist yields tier 1, even when commodity+region also match", () => {
  const signal = { region: "south-america" };
  const rule = { regions: ["south-america"], commodities: ["COPPER"], forex_pairs: [] };
  const result = computeMatchReason(signal, rule, ["COPPER"], [], ["COPPER"]);
  assert.strictEqual(result.tier, 1);
  assert.deepStrictEqual(result.matched.watchlist, ["COPPER"]);
  // Tier 1 doesn't erase the other matched dimensions — they're still true, just not
  // the reason surfaced for tier purposes.
  assert.deepStrictEqual(result.matched.commodity, ["COPPER"]);
  assert.deepStrictEqual(result.matched.region, ["south-america"]);
});

runTest("commodity AND region matching (no watchlist hit) yields tier 2", () => {
  const signal = { region: "south-america" };
  const rule = { regions: ["south-america"], commodities: ["COPPER"], forex_pairs: [] };
  const result = computeMatchReason(signal, rule, ["COPPER"], [], []);
  assert.strictEqual(result.tier, 2);
  assert.deepStrictEqual(result.matched.commodity, ["COPPER"]);
  assert.deepStrictEqual(result.matched.region, ["south-america"]);
  assert.strictEqual(result.matched.watchlist, undefined);
});

runTest("forex AND region matching (no watchlist hit) also yields tier 2", () => {
  const signal = { region: "europe" };
  const rule = { regions: ["europe"], commodities: [], forex_pairs: ["EURUSD"] };
  const result = computeMatchReason(signal, rule, [], ["EURUSD"], []);
  assert.strictEqual(result.tier, 2);
  assert.deepStrictEqual(result.matched.forex, ["EURUSD"]);
});

runTest("commodity match with no region filter on the rule yields tier 3", () => {
  const signal = { region: "south-america" };
  const rule = { regions: [], commodities: ["COPPER"], forex_pairs: [] };
  const result = computeMatchReason(signal, rule, ["COPPER"], [], []);
  assert.strictEqual(result.tier, 3);
  assert.deepStrictEqual(result.matched.commodity, ["COPPER"]);
  assert.strictEqual(result.matched.region, undefined);
});

runTest("region match with no commodity/forex filter on the rule yields tier 3", () => {
  const signal = { region: "south-america" };
  const rule = { regions: ["south-america"], commodities: [], forex_pairs: [] };
  const result = computeMatchReason(signal, rule, [], [], []);
  assert.strictEqual(result.tier, 3);
  assert.deepStrictEqual(result.matched.region, ["south-america"]);
});

runTest("an unfiltered, severity-only rule yields tier 3 with an empty matched object", () => {
  const signal = { region: "south-america" };
  const rule = { regions: [], commodities: [], forex_pairs: [] };
  const result = computeMatchReason(signal, rule, ["COPPER"], [], []);
  assert.strictEqual(result.tier, 3);
  assert.deepStrictEqual(result.matched, {});
});

// The tier/matched object is computed from the already-matched rule purely for
// display — dispatchAlertsForSignal calls it only inside the loop over rules that
// already passed the hard region/commodity/forex filter (see matchedRules in
// alert-dispatcher.ts), and nothing reads its return value to decide whether to
// send. This sweep proves computeMatchReason can't itself produce a value a future
// caller could mistake for "skip": every combination below returns a concrete
// 1|2|3 tier and a plain object, never throws, undefined, or a falsy sentinel.
runTest("no input combination ever produces a result that could be read as 'skip'", () => {
  const regionsOptions = [[], ["middle-east"]];
  const commodityOptions = [[], ["OIL"]];
  const forexOptions = [[], ["EURUSD"]];
  const watchlistOptions = [[], ["OIL"], ["UNRELATED"]];
  const assetOptions: Array<[string[], string[]]> = [
    [[], []],
    [["OIL"], []],
    [[], ["EURUSD"]],
    [["OIL"], ["EURUSD"]],
  ];

  for (const regions of regionsOptions) {
    for (const commodities of commodityOptions) {
      for (const forex_pairs of forexOptions) {
        for (const watchlist of watchlistOptions) {
          for (const [commodityAssets, forexAssets] of assetOptions) {
            const result = computeMatchReason(
              { region: "middle-east" },
              { regions, commodities, forex_pairs },
              commodityAssets,
              forexAssets,
              watchlist,
            );
            assert.ok(
              result && typeof result === "object",
              "computeMatchReason must always return an object",
            );
            assert.ok(
              result.tier === 1 || result.tier === 2 || result.tier === 3,
              `tier must be 1, 2, or 3 — got ${result.tier}`,
            );
            assert.ok(
              result.matched && typeof result.matched === "object",
              "matched must always be a plain object, never null/undefined",
            );
          }
        }
      }
    }
  }
});

runTest("buildAlertBody appends the plain 'Matched because you follow' line when something matched", () => {
  const signal = { title: "Chile copper export restrictions tighten", commodity_impacts: [], currency_pair_impacts: [] };
  const rule = { name: "My Rule", min_severity: 7 };
  const matchReason = computeMatchReason(
    { region: "Chile" },
    { regions: ["Chile"], commodities: ["COPPER"], forex_pairs: [] },
    ["COPPER"],
    [],
    [],
  );
  const body = buildAlertBody(signal, rule, [], matchReason);
  assert.ok(
    body.includes("Matched because you follow: COPPER, Chile"),
    `expected the matched line in the body, got:\n${body}`,
  );
  // No scoring, no percentages anywhere near the line.
  assert.ok(!/%\s|\bscore\b/i.test(body));
});

runTest("buildAlertBody omits the matched line when nothing beyond severity matched", () => {
  const signal = { title: "Generic signal", commodity_impacts: [], currency_pair_impacts: [] };
  const rule = { name: "My Rule", min_severity: 7 };
  const matchReason = computeMatchReason({ region: null }, { regions: [], commodities: [], forex_pairs: [] }, [], [], []);
  const body = buildAlertBody(signal, rule, [], matchReason);
  assert.ok(!body.includes("Matched because you follow"));
});

runTest("buildAlertBody still works with no matchReason argument at all (backward compatible)", () => {
  const signal = { title: "Generic signal", commodity_impacts: [], currency_pair_impacts: [] };
  const rule = { name: "My Rule", min_severity: 7 };
  const body = buildAlertBody(signal, rule, []);
  assert.ok(!body.includes("Matched because you follow"));
});

process.exitCode = failed ? 1 : 0;
