import assert from "node:assert/strict";
import {
  parseCommodityImpacts,
  computePerDay,
  computeSeverityDistribution,
  computeStoryGroupStats,
  computeDirectionCountsByAsset,
  renderReport,
  type MergeEffectsSignalRow,
} from "./measure-merge-effects.js";

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

function row(overrides: Partial<MergeEffectsSignalRow>): MergeEffectsSignalRow {
  return {
    id: "id-1",
    created_at: "2026-11-01T00:00:00.000Z",
    event_category: "armed_conflict_security",
    severity: 5,
    sources_count: 1,
    raw_event_ids: [],
    commodity_impacts: [],
    title: "A story",
    summary: "A story",
    ...overrides,
  };
}

async function main() {
  await runTest("parseCommodityImpacts: ignores malformed entries", () => {
    const parsed = parseCommodityImpacts([
      { asset: "USOIL", direction: "up" },
      { asset: "UKOIL" }, // missing direction
      { direction: "down" }, // missing asset
      null,
      "not an object",
      { asset: 5, direction: "up" }, // wrong type
    ]);
    assert.deepStrictEqual(parsed, [{ asset: "USOIL", direction: "up" }]);
  });

  await runTest("parseCommodityImpacts: non-array input returns []", () => {
    assert.deepStrictEqual(parseCommodityImpacts(null), []);
    assert.deepStrictEqual(parseCommodityImpacts(undefined), []);
    assert.deepStrictEqual(parseCommodityImpacts("foo"), []);
  });

  await runTest("computePerDay: buckets by UTC day, counts sources_count > 1", () => {
    const rows = [
      row({ id: "a", created_at: "2026-11-01T01:00:00.000Z", sources_count: 1 }),
      row({ id: "b", created_at: "2026-11-01T23:00:00.000Z", sources_count: 2 }),
      row({ id: "c", created_at: "2026-11-02T00:00:00.000Z", sources_count: null }),
      row({ id: "d", created_at: "2026-11-02T05:00:00.000Z", sources_count: 3 }),
    ];
    const result = computePerDay(rows);
    assert.deepStrictEqual(result, [
      { day: "2026-11-01", signalsCreated: 2, signalsMultiSource: 1 },
      { day: "2026-11-02", signalsCreated: 2, signalsMultiSource: 1 },
    ]);
  });

  await runTest("computeSeverityDistribution: splits single vs multi source, floors/caps severity", () => {
    const rows = [
      row({ id: "a", sources_count: 1, severity: 7 }),
      row({ id: "b", sources_count: 1, severity: 3 }),
      row({ id: "c", sources_count: 2, severity: 8 }),
      row({ id: "d", sources_count: null, severity: 5 }), // treated as 1 (default)
    ];
    const { singleSource, multiSource } = computeSeverityDistribution(rows);
    assert.strictEqual(singleSource.total, 3);
    assert.strictEqual(singleSource.counts[7], 1);
    assert.strictEqual(singleSource.counts[3], 1);
    assert.strictEqual(singleSource.counts[5], 1);
    assert.strictEqual(singleSource.shareSevereOrAbove, 1 / 3);
    assert.strictEqual(multiSource.total, 1);
    assert.strictEqual(multiSource.counts[8], 1);
    assert.strictEqual(multiSource.shareSevereOrAbove, 1);
  });

  await runTest("computeSeverityDistribution: empty group has zero share, not NaN", () => {
    const { multiSource } = computeSeverityDistribution([row({ sources_count: 1 })]);
    assert.strictEqual(multiSource.total, 0);
    assert.strictEqual(multiSource.shareSevereOrAbove, 0);
  });

  await runTest("computeStoryGroupStats: groups by story-threads rule, flags opposite-direction conflicts", () => {
    const rows = [
      row({
        id: "a",
        title: "Pipeline explosion halts crude export from Saudi refinery",
        created_at: "2026-11-01T00:00:00.000Z",
        event_category: "armed_conflict_security",
        commodity_impacts: [{ asset: "USOIL", direction: "up" }],
      }),
      row({
        id: "b",
        title: "Pipeline explosion halts crude export from Saudi refinery plant",
        created_at: "2026-11-01T02:00:00.000Z",
        event_category: "armed_conflict_security",
        commodity_impacts: [{ asset: "USOIL", direction: "down" }],
      }),
      row({
        id: "c",
        title: "Completely unrelated diplomatic talks continue ahead of trade negotiations",
        created_at: "2026-11-05T00:00:00.000Z",
        event_category: "elections_political_transition",
        commodity_impacts: [],
      }),
    ];
    const stats = computeStoryGroupStats(rows);
    assert.strictEqual(stats.groupsSize2Plus, 1);
    assert.strictEqual(stats.conflictingDirectionGroups, 1);
  });

  await runTest("computeStoryGroupStats: same-direction group is not flagged as conflicting", () => {
    const rows = [
      row({
        id: "a",
        title: "Pipeline explosion halts crude export from Saudi refinery",
        created_at: "2026-11-01T00:00:00.000Z",
        commodity_impacts: [{ asset: "USOIL", direction: "up" }],
      }),
      row({
        id: "b",
        title: "Pipeline explosion halts crude export from Saudi refinery plant",
        created_at: "2026-11-01T02:00:00.000Z",
        commodity_impacts: [{ asset: "USOIL", direction: "up" }],
      }),
    ];
    const stats = computeStoryGroupStats(rows);
    assert.strictEqual(stats.groupsSize2Plus, 1);
    assert.strictEqual(stats.conflictingDirectionGroups, 0);
  });

  await runTest("computeDirectionCountsByAsset: tallies each direction per asset", () => {
    const rows = [
      row({ id: "a", commodity_impacts: [{ asset: "USOIL", direction: "up" }] }),
      row({ id: "b", commodity_impacts: [{ asset: "USOIL", direction: "neutral" }] }),
      row({
        id: "c",
        commodity_impacts: [
          { asset: "USOIL", direction: "down" },
          { asset: "XAUUSD", direction: "volatile" },
        ],
      }),
    ];
    const counts = computeDirectionCountsByAsset(rows);
    assert.deepStrictEqual(counts.get("USOIL"), { up: 1, down: 1, volatile: 0, neutral: 1 });
    assert.deepStrictEqual(counts.get("XAUUSD"), { up: 0, down: 0, volatile: 1, neutral: 0 });
  });

  await runTest("renderReport: includes the descriptive-counts label and does not throw on empty input", () => {
    const report = renderReport([]);
    assert.ok(
      report.includes(
        "Descriptive counts, not a validation. Merge history is not stored, so severity before merging is unknown.",
      ),
    );
    assert.ok(report.includes("## (a) Per day"));
    assert.ok(report.includes("## (b) Severity distribution"));
    assert.ok(report.includes("## (c) Story groups"));
    assert.ok(report.includes("## (d) Per asset: direction counts"));
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
