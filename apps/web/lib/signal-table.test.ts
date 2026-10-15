import assert from "node:assert/strict";
import {
  formatTableCountLine,
  sortSignalTableRows,
  tableCountLine,
  truncateSignalSummary,
  SIGNAL_TABLE_SUMMARY_MAX_LENGTH,
  type SignalTableSortableRow,
  type TableCountSignal,
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

function counted(overrides: Partial<TableCountSignal> = {}): TableCountSignal {
  return {
    eventDate: "2026-09-01T00:00:00.000Z",
    commodityImpacts: [],
    currencyPairImpacts: [],
    ...overrides,
  };
}

runTest("tableCountLine on an empty list is all zeros", () => {
  const counts = tableCountLine([]);
  assert.deepEqual(counts, {
    loaded: 0,
    days: 0,
    up: 0,
    down: 0,
    volatile: 0,
    neutral: 0,
    noImpact: 0,
  });
  assert.equal(formatTableCountLine(counts), "0 signals loaded · 0 days · Up 0 · Down 0 · Other 0");
});

runTest("tableCountLine counts mixed directions and distinct UTC days", () => {
  const counts = tableCountLine([
    counted({
      eventDate: "2026-09-01T10:00:00.000Z",
      commodityImpacts: [{ direction: "up" }],
      currencyPairImpacts: [{ direction: "down" }],
    }),
    counted({
      eventDate: "2026-09-01T22:00:00.000Z",
      commodityImpacts: [],
      currencyPairImpacts: [{ direction: "down" }],
    }),
    counted({
      eventDate: "2026-09-02T01:00:00.000Z",
      commodityImpacts: [{ direction: "volatile" }],
    }),
    counted({
      eventDate: null,
      createdAt: "2026-09-02T15:00:00.000Z",
      commodityImpacts: [{ direction: "neutral" }],
    }),
    counted({
      eventDate: "2026-09-02T23:30:00-05:00",
      commodityImpacts: [],
      currencyPairImpacts: [],
    }),
    counted({
      eventDate: null,
      createdAt: undefined,
      commodityImpacts: [],
    }),
  ]);
  assert.deepEqual(counts, {
    loaded: 6,
    days: 3,
    up: 1,
    down: 1,
    volatile: 1,
    neutral: 1,
    noImpact: 2,
  });
  assert.equal(formatTableCountLine(counts), "6 signals loaded · 3 days · Up 1 · Down 1 · Other 4");
});

runTest("tableCountLine treats a row with no impacts as noImpact", () => {
  const counts = tableCountLine([
    counted({
      eventDate: "2026-09-04T12:00:00.000Z",
      commodityImpacts: [],
      currencyPairImpacts: [],
    }),
  ]);
  assert.deepEqual(counts, {
    loaded: 1,
    days: 1,
    up: 0,
    down: 0,
    volatile: 0,
    neutral: 0,
    noImpact: 1,
  });
  assert.equal(formatTableCountLine(counts), "1 signal loaded · 1 day · Up 0 · Down 0 · Other 1");
});

runTest("formatTableCountLine uses the singular only when the number is 1", () => {
  assert.equal(
    formatTableCountLine({
      loaded: 1,
      days: 2,
      up: 1,
      down: 0,
      volatile: 0,
      neutral: 0,
      noImpact: 0,
    }),
    "1 signal loaded · 2 days · Up 1 · Down 0 · Other 0",
  );
  assert.equal(
    formatTableCountLine({
      loaded: 2,
      days: 1,
      up: 0,
      down: 1,
      volatile: 0,
      neutral: 0,
      noImpact: 1,
    }),
    "2 signals loaded · 1 day · Up 0 · Down 1 · Other 1",
  );
});
