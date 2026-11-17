import assert from "node:assert/strict";
import {
  categorizeLabel,
  confusionForRule,
  cutoffTable,
  joinWithKey,
  loadLabelledRows,
  parseCsv,
  ruleDisagreements,
  runScoring,
  wilson95,
  type KeyFile,
} from "./score-event-pairs.js";

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

function closeTo(actual: number, expected: number, tolerance = 1e-4) {
  assert.equal(Math.abs(actual - expected) <= tolerance, true, `${actual} not close to ${expected}`);
}

runTest("(a) Wilson 95% interval matches hand-computed values", () => {
  // 0/10: textbook Wilson result is (0, ~0.2775).
  const a = wilson95(0, 10);
  closeTo(a.low, 0, 1e-6);
  closeTo(a.high, 0.27756, 1e-4);

  // 5/20 (p=0.25): hand-computed via the standard Wilson formula
  // (z=1.96, denom=1.19208, center=0.34604, margin=0.212814) -> [0.11177, 0.46881].
  const b = wilson95(5, 20);
  closeTo(b.estimate, 0.25, 1e-9);
  closeTo(b.low, 0.11177, 1e-3);
  closeTo(b.high, 0.46881, 1e-3);

  const zero = wilson95(0, 0);
  assert.deepEqual(zero, { estimate: 0, low: 0, high: 0 });
});

runTest("(b) labels categorize into positive/negative/dropped; cannot-tell drops", () => {
  assert.equal(categorizeLabel("same event"), "positive");
  assert.equal(categorizeLabel(" Update "), "positive");
  assert.equal(categorizeLabel("different"), "negative");
  assert.equal(categorizeLabel("cannot tell"), "dropped");
  assert.equal(categorizeLabel(""), "dropped");
  assert.equal(categorizeLabel("garbage"), "dropped");
});

runTest("(c) parseCsv round-trips quoted fields with embedded commas/quotes", () => {
  const csv = 'a,b,c\n"x, y","she said ""hi""",plain\n1,2,3\n';
  const rows = parseCsv(csv);
  assert.deepEqual(rows, [
    ["a", "b", "c"],
    ["x, y", 'she said "hi"', "plain"],
    ["1", "2", "3"],
  ]);
});

runTest("(d) positives and negatives are counted correctly; cannot tell is dropped", () => {
  const csv =
    "pair_id,A_title,A_summary,A_published,A_feed,A_url,B_title,B_summary,B_published,B_feed,B_url,hours_apart,label\n" +
    'p01,Title A1,,,,,"Title B1",,,,,1.00,same event\n' +
    "p02,Title A2,,,,,Title B2,,,,,2.00,update\n" +
    "p03,Title A3,,,,,Title B3,,,,,3.00,different\n" +
    "p04,Title A4,,,,,Title B4,,,,,4.00,cannot tell\n" +
    "p05,Title A5,,,,,Title B5,,,,,5.00,\n";
  const key: KeyFile = {};
  for (const id of ["p01", "p02", "p03", "p04", "p05"]) {
    key[id] = {
      stratum: "S1",
      signalIds: ["x", "y"],
      summaryJaccard: 0.5,
      titleJaccard: 0.5,
      embeddingCosine: 0.5,
      eventCategoryEqual: true,
      countryEqual: true,
      sharedAsset: true,
      liveMergeJoins: id === "p01" || id === "p03", // one true-merge, one false-merge
      storyThreadsJoins: false,
    };
  }
  const { counts, scored, missingKeys } = runScoring(csv, JSON.stringify(key));
  assert.equal(missingKeys.length, 0);
  assert.equal(counts.n, 5);
  assert.equal(counts.positive, 2);
  assert.equal(counts.negative, 1);
  assert.equal(counts.dropped, 2);

  const confusion = confusionForRule(scored, "liveMergeJoins");
  // p01 positive+joins=true_merge, p02 positive+joins=false=false_split,
  // p03 negative+joins=true=false_merge. Dropped rows excluded.
  assert.deepEqual(confusion, { trueMerge: 1, falseMerge: 1, falseSplit: 1, trueKeep: 0 });

  const disagreements = ruleDisagreements(scored, "liveMergeJoins");
  assert.deepEqual(disagreements.map((p) => p.pairId).sort(), ["p02", "p03"]);
});

runTest("(e) loadLabelledRows maps the exact pairs-to-label.csv column names", () => {
  const csv =
    "pair_id,A_title,A_summary,A_published,A_feed,A_url,B_title,B_summary,B_published,B_feed,B_url,hours_apart,label\n" +
    "p01,Alpha,sum,2026-01-01,feedA,urlA,Beta,sum2,2026-01-02,feedB,urlB,1.00,same event\n";
  const rows = loadLabelledRows(csv);
  assert.deepEqual(rows, [
    { pairId: "p01", aTitle: "Alpha", bTitle: "Beta", rawLabel: "same event", category: "positive" },
  ]);
});

runTest("(f) cutoffTable sweeps every distinct score and counts false merges/splits", () => {
  const key: KeyFile = {
    p1: {
      stratum: "S1", signalIds: ["a", "b"], summaryJaccard: 0.1, titleJaccard: 0, embeddingCosine: 0,
      eventCategoryEqual: true, countryEqual: true, sharedAsset: true, liveMergeJoins: false, storyThreadsJoins: false,
    },
    p2: {
      stratum: "S1", signalIds: ["c", "d"], summaryJaccard: 0.5, titleJaccard: 0, embeddingCosine: 0,
      eventCategoryEqual: true, countryEqual: true, sharedAsset: true, liveMergeJoins: false, storyThreadsJoins: false,
    },
  };
  const rows = joinWithKey(
    [
      { pairId: "p1", aTitle: "a", bTitle: "b", rawLabel: "different", category: "negative" },
      { pairId: "p2", aTitle: "c", bTitle: "d", rawLabel: "same event", category: "positive" },
    ],
    key,
  ).scored;
  const table = cutoffTable(rows, "summaryJaccard");
  assert.deepEqual(table, [
    { cutoff: 0.1, falseMerge: 1, falseSplit: 0 }, // cutoff 0.1: both score>=0.1 "join" -> p1(neg) false_merge
    { cutoff: 0.5, falseMerge: 0, falseSplit: 0 }, // cutoff 0.5: only p2(pos) joins -> correct
  ]);
});

if (failed) process.exit(1);
