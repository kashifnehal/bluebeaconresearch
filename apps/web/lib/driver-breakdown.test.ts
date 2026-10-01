import assert from "node:assert/strict";

import {
  mergeSignalRows,
  shouldShowUncategorizedNote,
  partitionCategoryCounts,
  isAllUncategorized,
  orderSeriesKeys,
  UNCATEGORIZED_KEY,
  OTHER_KEY,
  type DriverSignalRow,
} from "./driver-breakdown";

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function row(id: string, eventDate: string): DriverSignalRow {
  return { id, event_date: eventDate, created_at: eventDate, event_category: null };
}

runTest("a single row-set passes through unchanged", () => {
  const rows = [row("a", "2026-01-01"), row("b", "2026-01-02")];
  assert.deepEqual(mergeSignalRows(rows), rows);
});

runTest("a signal present in both row-sets counts once", () => {
  const commodity = [row("a", "2026-01-01"), row("shared", "2026-01-03")];
  const currency = [row("shared", "2026-01-03"), row("b", "2026-01-02")];
  const merged = mergeSignalRows(currency, commodity);
  assert.equal(merged.length, 3);
  assert.deepEqual(
    new Set(merged.map((r) => r.id)),
    new Set(["a", "b", "shared"]),
  );
});

runTest("empty row-sets merge to an empty array", () => {
  assert.deepEqual(mergeSignalRows([], []), []);
});

runTest("no row-sets at all merges to an empty array", () => {
  assert.deepEqual(mergeSignalRows(), []);
});

runTest("the first-seen row for a duplicate id is kept, not overwritten", () => {
  const first = row("shared", "2026-01-01");
  const second = { ...row("shared", "2026-01-01"), event_category: "armed_conflict_security" };
  const merged = mergeSignalRows([first], [second]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].event_category, null);
});

runTest("no note when there are no signals at all", () => {
  assert.equal(shouldShowUncategorizedNote(0, 0), false);
});

runTest("no note when uncategorized is at the 0.8 threshold exactly", () => {
  assert.equal(shouldShowUncategorizedNote(10, 8), false);
});

runTest("note shown once uncategorized share exceeds the 0.8 threshold", () => {
  assert.equal(shouldShowUncategorizedNote(10, 9), true);
});

runTest("no note when uncategorized is a small minority", () => {
  assert.equal(shouldShowUncategorizedNote(100, 2), false);
});

runTest("partitionCategoryCounts: empty input has zero total and no categories", () => {
  const partition = partitionCategoryCounts([]);
  assert.deepEqual(partition.realCategories, []);
  assert.equal(partition.uncategorizedTotal, 0);
  assert.equal(partition.total, 0);
});

runTest("partitionCategoryCounts: mixed input splits real categories from uncategorized", () => {
  const partition = partitionCategoryCounts([
    { category: "armed_conflict_security", count: 5 },
    { category: UNCATEGORIZED_KEY, count: 3 },
    { category: "armed_conflict_security", count: 1 },
    { category: "trade_policy_tariffs", count: 2 },
  ]);
  assert.deepEqual(partition.realCategories, [
    ["armed_conflict_security", 6],
    ["trade_policy_tariffs", 2],
  ]);
  assert.equal(partition.uncategorizedTotal, 3);
  assert.equal(partition.total, 11);
});

runTest("partitionCategoryCounts: all-uncategorized input has no real categories", () => {
  const partition = partitionCategoryCounts([
    { category: UNCATEGORIZED_KEY, count: 4 },
    { category: UNCATEGORIZED_KEY, count: 6 },
  ]);
  assert.deepEqual(partition.realCategories, []);
  assert.equal(partition.uncategorizedTotal, 10);
  assert.equal(partition.total, 10);
});

runTest("isAllUncategorized: true only when every row is uncategorized and there is at least one", () => {
  assert.equal(
    isAllUncategorized(partitionCategoryCounts([{ category: UNCATEGORIZED_KEY, count: 10 }])),
    true,
  );
});

runTest("isAllUncategorized: false for empty input (nothing to show, not a backfill gap)", () => {
  assert.equal(isAllUncategorized(partitionCategoryCounts([])), false);
});

runTest("isAllUncategorized: false for mixed input", () => {
  assert.equal(
    isAllUncategorized(
      partitionCategoryCounts([
        { category: "armed_conflict_security", count: 1 },
        { category: UNCATEGORIZED_KEY, count: 10 },
      ]),
    ),
    false,
  );
});

runTest("orderSeriesKeys: uncategorized is always last, even when it has the largest count", () => {
  const partition = partitionCategoryCounts([
    { category: "trade_policy_tariffs", count: 2 },
    { category: "armed_conflict_security", count: 5 },
    { category: UNCATEGORIZED_KEY, count: 999 },
  ]);
  assert.deepEqual(orderSeriesKeys(partition, 7), [
    "armed_conflict_security",
    "trade_policy_tariffs",
    UNCATEGORIZED_KEY,
  ]);
});

runTest("orderSeriesKeys: real categories beyond the own-category budget fold into 'other' before uncategorized", () => {
  const partition = partitionCategoryCounts([
    { category: "a", count: 10 },
    { category: "b", count: 9 },
    { category: "c", count: 8 },
    { category: UNCATEGORIZED_KEY, count: 1 },
  ]);
  assert.deepEqual(orderSeriesKeys(partition, 2), ["a", "b", OTHER_KEY, UNCATEGORIZED_KEY]);
});

runTest("orderSeriesKeys: no uncategorized key when there is no uncategorized data", () => {
  const partition = partitionCategoryCounts([{ category: "armed_conflict_security", count: 1 }]);
  assert.deepEqual(orderSeriesKeys(partition, 7), ["armed_conflict_security"]);
});

runTest("orderSeriesKeys: empty input orders to an empty list", () => {
  assert.deepEqual(orderSeriesKeys(partitionCategoryCounts([]), 7), []);
});
