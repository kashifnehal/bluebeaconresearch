import assert from "node:assert/strict";
import {
  DEFAULT_SEED,
  buildKeyJson,
  buildStrata,
  candidatePairs,
  pairKey,
  renderCsv,
  type PoolSignal,
} from "./sample-event-pairs.js";

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

function sig(partial: Partial<PoolSignal> & { id: string; created_at: string }): PoolSignal {
  return {
    event_date: partial.created_at,
    title: `Title ${partial.id}`,
    summary: `Summary for ${partial.id} about oil tankers near the strait`,
    event_category: "supply_disruption_logistics",
    country: "Iran",
    region: "Middle East",
    symbols: ["CL"],
    primaryAsset: "CL",
    feed: "Reuters",
    url: `https://example.com/${partial.id}`,
    ...partial,
  };
}

// A fixture pool of 8 signals, all within 24h of each other, with distinct
// titles/summaries so Jaccard and cosine vary, plus a couple of outliers for
// the country/category/asset control stratum.
const FIXTURE: PoolSignal[] = [
  sig({ id: "a1", created_at: "2026-11-08T00:00:00Z", title: "Tankers struck near Hormuz", summary: "Tankers struck near the strait of Hormuz by drones" }),
  sig({ id: "a2", created_at: "2026-11-08T02:00:00Z", title: "Drone strike hits tankers near Hormuz", summary: "Drone strike hits tankers near the strait of Hormuz" }),
  sig({ id: "a3", created_at: "2026-11-08T04:00:00Z", title: "OPEC trims output forecast", summary: "OPEC trims its 2027 output forecast citing demand" }),
  sig({ id: "a4", created_at: "2026-11-08T06:00:00Z", title: "OPEC cuts demand outlook again", summary: "OPEC cuts its demand outlook again for next year" }),
  sig({ id: "a5", created_at: "2026-11-08T08:00:00Z", title: "Wheat exports resume from port", summary: "Wheat exports resume from the blockaded port this week", country: "Ukraine", region: "Europe", symbols: ["ZW"], primaryAsset: "ZW" }),
  sig({ id: "a6", created_at: "2026-11-08T10:00:00Z", title: "Grain corridor reopens for shipments", summary: "Grain corridor reopens for shipments after talks", country: "Ukraine", region: "Europe", symbols: ["ZW"], primaryAsset: "ZW" }),
  sig({ id: "a7", created_at: "2026-11-08T12:00:00Z", title: "Central bank holds rates steady", summary: "Central bank holds rates steady amid inflation concerns", country: "Iran", region: "Middle East", event_category: "central_bank_monetary_policy", symbols: [], primaryAsset: null }),
  sig({ id: "a8", created_at: "2026-11-09T14:00:00Z", title: "Unrelated election result announced", summary: "Unrelated election result announced in distant country", country: "Brazil", region: "Americas", event_category: "elections_political_transition", symbols: ["SB"], primaryAsset: "SB" }),
];

// Fixed fake cosine: near-duplicate pairs (a1/a2, a3/a4, a5/a6) score high;
// everything else scores low but deterministic from the id pair.
function fakeCosine(aId: string, bId: string): number {
  const high: Record<string, number> = {
    [pairKey("a1", "a2")]: 0.95,
    [pairKey("a3", "a4")]: 0.9,
    [pairKey("a5", "a6")]: 0.88,
  };
  const key = pairKey(aId, bId);
  if (high[key] !== undefined) return high[key]!;
  // Deterministic low value derived from the key so distinct pairs differ.
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) % 1000;
  return (h % 100) / 1000; // 0.000 - 0.099
}

runTest("(a) candidatePairs only links signals within 24h", () => {
  const pairs = candidatePairs(FIXTURE);
  const has = (x: string, y: string) => pairs.some(([a, b]) => pairKey(a.id, b.id) === pairKey(x, y));
  assert.equal(has("a1", "a7"), true); // 12h apart
  assert.equal(has("a1", "a8"), false); // 38h apart
});

runTest("(b) the draw is repeatable with the same seed", () => {
  const run1 = buildStrata(FIXTURE, fakeCosine, DEFAULT_SEED);
  const run2 = buildStrata(FIXTURE, fakeCosine, DEFAULT_SEED);
  assert.deepEqual(run1.pairs.map((p) => p.pairId), run2.pairs.map((p) => p.pairId));
  assert.deepEqual(
    run1.pairs.map((p) => pairKey(p.a.id, p.b.id)),
    run2.pairs.map((p) => pairKey(p.a.id, p.b.id)),
  );
  assert.deepEqual(run1.sizes, run2.sizes);

  const runDifferentSeed = buildStrata(FIXTURE, fakeCosine, DEFAULT_SEED + 1);
  // Not asserting inequality of the whole draw (small fixture could coincide),
  // just that the function accepts a different seed and still returns a valid result.
  assert.equal(runDifferentSeed.pairs.length > 0, true);
});

runTest("(c) no pair appears twice across strata", () => {
  const { pairs } = buildStrata(FIXTURE, fakeCosine, DEFAULT_SEED);
  const keys = pairs.map((p) => pairKey(p.a.id, p.b.id));
  assert.equal(keys.length, new Set(keys).size);
});

runTest("(d) S1 is the highest-cosine pairs, deterministic (not shuffled by seed)", () => {
  const { pairs } = buildStrata(FIXTURE, fakeCosine, DEFAULT_SEED);
  const s1 = pairs.filter((p) => p.stratum === "S1").sort((x, y) => y.embeddingCosine - x.embeddingCosine);
  assert.equal(s1[0]!.embeddingCosine, 0.95);
  assert.equal(s1.some((p) => pairKey(p.a.id, p.b.id) === pairKey("a1", "a2")), true);
});

runTest("(e) the CSV has no score columns and an empty label column", () => {
  const { pairs } = buildStrata(FIXTURE, fakeCosine, DEFAULT_SEED);
  const csv = renderCsv(pairs);
  const [header, ...rows] = csv.trim().split("\n");
  assert.equal(/jaccard|cosine|score|stratum/i.test(header!), false);
  assert.deepEqual(
    header!.split(","),
    ["pair_id", "A_title", "A_summary", "A_published", "A_feed", "A_url", "B_title", "B_summary", "B_published", "B_feed", "B_url", "hours_apart", "label"],
  );
  for (const row of rows) {
    assert.equal(row.endsWith(","), true); // empty label column
  }
});

runTest("(f) the key file has all pair ids", () => {
  const { pairs } = buildStrata(FIXTURE, fakeCosine, DEFAULT_SEED);
  const key = buildKeyJson(pairs);
  assert.deepEqual(Object.keys(key).sort(), pairs.map((p) => p.pairId).sort());
});

if (failed) process.exit(1);
