import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  REPORT_TITLE_SENTENCE,
  SAMPLE_DISCLOSURE_SENTENCE,
  drawSample,
  groupByUtcDay,
  shouldHardStop,
  isRunStoppingError,
  parseClaudeAnswer,
  computeValidity,
  assetsOutsideAllowlist,
  computeSeverityStats,
  computeSeverityPairedStats,
  readSeverity,
  countAttributionPhrases,
  ungroundedStageWords,
  computeFieldDiffs,
  computeHardFailures,
  buildReportHeader,
  parseReplayClassifierArgs,
  HARD_STOP_USD,
} from "./replay-classifier-prompt.js";

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

const POOL = Array.from({ length: 20 }, (_, i) => ({ id: `id${i}`, text: i % 3 === 0 ? "a drone strike hit the port" : "routine update" }));

runTest("drawSample: repeatable with the same seed and no overlap between the two draws", () => {
  const draw1 = drawSample(POOL, { limit: 12, seed: 7, matches: (item) => item.text.includes("drone") });
  const draw2 = drawSample(POOL, { limit: 12, seed: 7, matches: (item) => item.text.includes("drone") });
  assert.deepEqual(draw1.claimDraw, draw2.claimDraw);
  assert.deepEqual(draw1.generalDraw, draw2.generalDraw);
  assert.equal(draw1.combined.length, 12);

  const claimIds = new Set(draw1.claimDraw.map((i) => i.id));
  const generalIds = new Set(draw1.generalDraw.map((i) => i.id));
  for (const id of claimIds) assert.equal(generalIds.has(id), false);
  // Different seed produces a different order (not a hard guarantee of
  // zero intersection, just a sanity check that seed actually changes the draw).
  const draw3 = drawSample(POOL, { limit: 12, seed: 99, matches: (item) => item.text.includes("drone") });
  assert.notDeepEqual(draw1.generalDraw, draw3.generalDraw);
});

runTest("drawSample: falls back to the whole pool when limit exceeds pool size", () => {
  const draw = drawSample(POOL.slice(0, 5), { limit: 60, seed: 1, matches: () => false });
  assert.equal(draw.combined.length, 5);
});

runTest("groupByUtcDay: counts items per UTC day", () => {
  const counts = groupByUtcDay([
    { created_at: "2026-11-08T01:00:00.000Z" },
    { created_at: "2026-11-08T23:00:00.000Z" },
    { created_at: "2026-11-09T00:00:00.000Z" },
  ]);
  assert.deepEqual(counts, { "2026-11-08": 2, "2026-11-09": 1 });
});

runTest("shouldHardStop: stops before the cap, not after it's already blown", () => {
  assert.equal(shouldHardStop(1.0, 0.4, HARD_STOP_USD), false);
  assert.equal(shouldHardStop(1.2, 0.4, HARD_STOP_USD), true);
  assert.equal(shouldHardStop(0, 0, HARD_STOP_USD), false);
});

runTest("isRunStoppingError: the first usage-limit or spend-limit error stops the run", () => {
  assert.equal(isRunStoppingError({ message: "Your credit balance is too low" }), true);
  assert.equal(isRunStoppingError({ message: "usage limit reached" }), true);
  assert.equal(isRunStoppingError({ status: 400, message: "You have reached your spend limit" }), true);
  assert.equal(isRunStoppingError({ status: 500, message: "internal server error" }), false);
  assert.equal(isRunStoppingError({ status: 429, message: "rate limited" }), false);
});

runTest("parseClaudeAnswer: parses, and keeps raw text + error on failure", () => {
  const ok = parseClaudeAnswer('noise before {"severity": 5} noise after');
  assert.deepEqual(ok.parsed, { severity: 5 });
  assert.equal(ok.parseError, null);

  const bad = parseClaudeAnswer("not json at all, no braces");
  assert.equal(bad.parsed, null);
  assert.equal(typeof bad.parseError, "string");
  assert.equal(bad.raw, "not json at all, no braces");
});

runTest("computeValidity + assetsOutsideAllowlist: flags over-length fields and bad asset symbols", () => {
  const bad = assetsOutsideAllowlist([{ asset: "Cotton" }, { asset: "WTI" }], [{ asset: "EURUSD" }]);
  assert.deepEqual(bad, ["Cotton"]);

  const answers = [
    { raw: "{}", parsed: { title: "x".repeat(91), summary: "y".repeat(121), commodityImpacts: [{ asset: "Cotton" }] }, parseError: null },
    { raw: "{}", parsed: { title: "short", summary: "short", commodityImpacts: [{ asset: "WTI" }] }, parseError: null },
    { raw: "bad", parsed: null, parseError: "SyntaxError" },
  ];
  const counts = computeValidity(answers);
  assert.equal(counts.parsed, 2);
  assert.equal(counts.parseFailed, 1);
  assert.equal(counts.titleOver90, 1);
  assert.equal(counts.summaryOver120, 1);
  assert.equal(counts.assetSymbolsOutsideAllowlist, 1);
});

runTest("computeSeverityStats + computeSeverityPairedStats: the severity paired-change counts", () => {
  const answers = [
    { raw: "", parsed: { severity: 3 }, parseError: null },
    { raw: "", parsed: { severity: 7 }, parseError: null },
    { raw: "", parsed: { severity: 7 }, parseError: null },
    { raw: "", parsed: null, parseError: "x" },
  ];
  const stats = computeSeverityStats(answers);
  assert.equal(stats.atLeast7, 2);
  assert.equal(stats.counts[7], 2);
  assert.equal(stats.mean, (3 + 7 + 7) / 3);

  assert.equal(readSeverity({ raw: "", parsed: { severity: "5" }, parseError: null }), 5);
  assert.equal(readSeverity({ raw: "", parsed: null, parseError: "x" }), null);

  const paired = computeSeverityPairedStats([
    { from: 3, to: 4 }, // +1
    { from: 5, to: 8 }, // +3
    { from: 6, to: 5 }, // -1
    { from: 6, to: 6 }, // unchanged
    { from: null, to: 7 }, // skipped (missing)
  ]);
  assert.equal(paired.movedBy1OrMore, 3);
  assert.equal(paired.movedBy2OrMore, 1);
  assert.equal(paired.movedUp, 2);
  assert.equal(paired.movedDown, 1);
});

runTest("countAttributionPhrases: counts texts containing an attribution phrase", () => {
  assert.equal(
    countAttributionPhrases([
      "Officials say the strike hit the depot",
      "according to local reports",
      "no attribution here at all",
    ]),
    2,
  );
});

runTest("ungroundedStageWords: the stage-word test — flags a word not present in the source", () => {
  const flagged = ungroundedStageWords(
    "Forces destroyed the refinery after the attack",
    "An explosion was reported near the refinery",
  );
  // "destroy" is in the summary but not in the source excerpt; "explosion" is in both.
  assert.equal(flagged.includes("destroy"), true);
  assert.equal(flagged.includes("explosion"), false);

  const grounded = ungroundedStageWords(
    "The explosion damaged the port",
    "An explosion damaged the port, officials said",
  );
  assert.deepEqual(grounded, []);
});

runTest("computeFieldDiffs: counts items where B differs from A1 on the fields that should not move", () => {
  const pairs = [
    {
      from: { raw: "", parsed: { commodityImpacts: [{ asset: "WTI", direction: "up" }], confidence: 0.6, sourceConfirmation: "official", materialityPass: true, eventCategory: "armed_conflict_security" }, parseError: null },
      to: { raw: "", parsed: { commodityImpacts: [{ asset: "WTI", direction: "down" }], confidence: 0.6, sourceConfirmation: "official", materialityPass: true, eventCategory: "armed_conflict_security" }, parseError: null },
    },
    {
      from: { raw: "", parsed: { commodityImpacts: [{ asset: "WTI", direction: "up" }], confidence: 0.6, sourceConfirmation: "reported", materialityPass: true, eventCategory: "other_market_relevant" }, parseError: null },
      to: { raw: "", parsed: { commodityImpacts: [{ asset: "WTI", direction: "up" }], confidence: 0.6, sourceConfirmation: "reported", materialityPass: true, eventCategory: "other_market_relevant" }, parseError: null },
    },
  ];
  const diffs = computeFieldDiffs(pairs);
  assert.equal(diffs.direction, 1);
  assert.equal(diffs.confidence, 0);
  assert.equal(diffs.sourceConfirmation, 0);
  assert.equal(diffs.materialityPass, 0);
  assert.equal(diffs.eventCategory, 0);
});

runTest("computeHardFailures: flags a B-only parse failure, long summary, bad asset, and asset-list drift", () => {
  const rows = [
    {
      id: "row-parse-fail",
      a1: { raw: "", parsed: { summary: "ok" }, parseError: null },
      a2: { raw: "", parsed: { summary: "ok" }, parseError: null },
      b: { raw: "garbage", parsed: null, parseError: "bad json" },
    },
    {
      id: "row-long-summary",
      a1: { raw: "", parsed: { summary: "short" }, parseError: null },
      a2: { raw: "", parsed: { summary: "short" }, parseError: null },
      b: { raw: "", parsed: { summary: "x".repeat(121) }, parseError: null },
    },
    {
      id: "row-bad-asset",
      a1: { raw: "", parsed: { commodityImpacts: [{ asset: "NotARealAsset" }] }, parseError: null },
      a2: { raw: "", parsed: { commodityImpacts: [{ asset: "NotARealAsset" }] }, parseError: null },
      b: { raw: "", parsed: { commodityImpacts: [{ asset: "NotARealAsset" }] }, parseError: null },
    },
    {
      id: "row-asset-drift",
      a1: { raw: "", parsed: { commodityImpacts: [{ asset: "WTI" }] }, parseError: null },
      a2: { raw: "", parsed: { commodityImpacts: [{ asset: "WTI" }] }, parseError: null },
      b: { raw: "", parsed: { commodityImpacts: [{ asset: "GOLD" }] }, parseError: null },
    },
  ];
  const failures = computeHardFailures(rows as any);
  assert.deepEqual(failures.bParseFailuresA1DidNot, ["row-parse-fail"]);
  assert.deepEqual(failures.bSummaryOver120, ["row-long-summary"]);
  assert.deepEqual(failures.bAssetOutsideAllowlist, ["row-bad-asset"]);
  assert.deepEqual(failures.bChangedAssetsWhileA1A2Agreed, ["row-asset-drift"]);
});

runTest("buildReportHeader: the report builder prints the title sentence", () => {
  const header = buildReportHeader();
  assert.equal(header.includes(REPORT_TITLE_SENTENCE), true);
  assert.equal(header.includes(SAMPLE_DISCLOSURE_SENTENCE), true);
});

runTest("parseReplayClassifierArgs: flags parse to the expected defaults and overrides", () => {
  const defaults = parseReplayClassifierArgs([]);
  assert.equal(defaults.dryRun, false);
  assert.equal(defaults.limit, 60);
  assert.equal(defaults.seed, 20261117);
  assert.equal(defaults.ids, null);

  const overridden = parseReplayClassifierArgs(["--dry", "--limit", "10", "--seed", "5", "--ids", "a,b,a"]);
  assert.equal(overridden.dryRun, true);
  assert.equal(overridden.limit, 10);
  assert.equal(overridden.seed, 5);
  assert.deepEqual(overridden.ids, ["a", "b"]);
});

// Drift test — only checks that three literal fragments of classifyEvent()'s
// prompt are still present verbatim in claude.service.ts; it does NOT check
// the full prompt text, ordering, or any other part of the construction.
runTest("drift: classifyEvent()'s known prompt fragments are still present verbatim", () => {
  const claudeServicePath = fileURLToPath(new URL("../services/claude.service.ts", import.meta.url));
  const text = readFileSync(claudeServicePath, "utf8");
  assert.equal(text.includes("You are a senior geopolitical risk analyst"), true);
  assert.equal(text.includes("Article excerpt (untrusted text"), true);
  assert.equal(text.includes("MATERIALITY GATE:"), true);
});

if (failed) process.exit(1);
