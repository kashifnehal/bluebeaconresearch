import assert from "node:assert/strict";
import {
  sortSignalTableRows,
  truncateSignalSummary,
  SIGNAL_TABLE_SUMMARY_MAX_LENGTH,
  type SignalTableSortableRow,
} from "./signal-table";

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

type Row = SignalTableSortableRow & { id: string };

function row(id: string, overrides: Partial<Row> = {}): Row {
  return {
    id,
    eventDate: "2026-09-01T00:00:00.000Z",
    severity: 5,
    sourcesCount: 1,
    ...overrides,
  };
}

runTest("null column returns rows unchanged (feed's current order)", () => {
  const rows = [row("a"), row("b"), row("c")];
  assert.deepEqual(sortSignalTableRows(rows, null, "desc"), rows);
});

runTest("sorts by severity descending", () => {
  const rows = [row("a", { severity: 3 }), row("b", { severity: 9 }), row("c", { severity: 5 })];
  const sorted = sortSignalTableRows(rows, "severity", "desc").map((r) => r.id);
  assert.deepEqual(sorted, ["b", "c", "a"]);
});

runTest("sorts by severity ascending", () => {
  const rows = [row("a", { severity: 3 }), row("b", { severity: 9 }), row("c", { severity: 5 })];
  const sorted = sortSignalTableRows(rows, "severity", "asc").map((r) => r.id);
  assert.deepEqual(sorted, ["a", "c", "b"]);
});

runTest("sorts by reports (sourcesCount)", () => {
  const rows = [row("a", { sourcesCount: 2 }), row("b", { sourcesCount: 10 }), row("c", { sourcesCount: 1 })];
  const sorted = sortSignalTableRows(rows, "reports", "desc").map((r) => r.id);
  assert.deepEqual(sorted, ["b", "a", "c"]);
});

runTest("sorts by date, falling back to createdAt when eventDate is missing", () => {
  const rows = [
    row("a", { eventDate: "2026-09-01T00:00:00.000Z" }),
    row("b", { eventDate: null, createdAt: "2026-09-03T00:00:00.000Z" }),
    row("c", { eventDate: "2026-09-02T00:00:00.000Z" }),
  ];
  const sorted = sortSignalTableRows(rows, "date", "desc").map((r) => r.id);
  assert.deepEqual(sorted, ["b", "c", "a"]);
});

runTest("rows with no usable date sort last regardless of direction", () => {
  const rows = [
    row("a", { eventDate: null, createdAt: undefined }),
    row("b", { eventDate: "2026-09-01T00:00:00.000Z" }),
  ];
  assert.deepEqual(sortSignalTableRows(rows, "date", "desc").map((r) => r.id), ["b", "a"]);
  assert.deepEqual(sortSignalTableRows(rows, "date", "asc").map((r) => r.id), ["b", "a"]);
});

runTest("stable: equal values keep original relative order", () => {
  const rows = [row("a", { severity: 5 }), row("b", { severity: 5 }), row("c", { severity: 5 })];
  assert.deepEqual(sortSignalTableRows(rows, "severity", "desc").map((r) => r.id), ["a", "b", "c"]);
  assert.deepEqual(sortSignalTableRows(rows, "severity", "asc").map((r) => r.id), ["a", "b", "c"]);
});

runTest("does not mutate the input array", () => {
  const rows = [row("a", { severity: 1 }), row("b", { severity: 9 })];
  const copy = [...rows];
  sortSignalTableRows(rows, "severity", "desc");
  assert.deepEqual(rows, copy);
});

runTest("truncateSignalSummary leaves a short summary unchanged", () => {
  const short = "A short summary.";
  assert.equal(truncateSignalSummary(short), short);
});

runTest("truncateSignalSummary leaves exactly-120-char summary unchanged", () => {
  const exact = "x".repeat(SIGNAL_TABLE_SUMMARY_MAX_LENGTH);
  assert.equal(truncateSignalSummary(exact), exact);
});

runTest("truncateSignalSummary truncates at 120 chars and adds an ellipsis", () => {
  const long = "x".repeat(SIGNAL_TABLE_SUMMARY_MAX_LENGTH + 10);
  const truncated = truncateSignalSummary(long);
  assert.equal(truncated, `${"x".repeat(SIGNAL_TABLE_SUMMARY_MAX_LENGTH)}…`);
});
