import assert from "node:assert/strict";

import { mergeSignalRows, type DriverSignalRow } from "./driver-breakdown";

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
