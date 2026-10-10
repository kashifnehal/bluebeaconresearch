import assert from "node:assert/strict";

import {
  buildHourlyWindows,
  computeMatchedWindowBaseline,
  startCell,
} from "./price-baseline";

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

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Walks forward from a fixed epoch to the next UTC date with the given
 * getUTCDay() value, then returns that date at the given UTC hour — computed
 * dynamically so the test never hardcodes an assumption about which calendar
 * date falls on which weekday. */
function nextWeekdayAt(targetDay: number, hour: number): Date {
  const base = new Date(Date.UTC(2026, 0, 1, hour, 0, 0));
  for (let i = 0; i < 7; i++) {
    const candidate = new Date(base.getTime() + i * MS_PER_DAY);
    if (candidate.getUTCDay() === targetDay) return candidate;
  }
  throw new Error("unreachable");
}

runTest("startCell maps a Saturday 10:00 UTC to 110 and a Wednesday 14:00 UTC to 14", () => {
  const saturday10 = nextWeekdayAt(6, 10);
  const wednesday14 = nextWeekdayAt(3, 14);
  assert.equal(startCell(saturday10.getTime()), 110);
  assert.equal(startCell(wednesday14.getTime()), 14);
});

runTest("buildHourlyWindows keeps only the first point of each UTC hour", () => {
  const hour = nextWeekdayAt(3, 10).getTime();
  const points = [
    { price: 100, fetchedAt: new Date(hour + 40 * 60 * 1000).toISOString() }, // 10:40 — later, ignored
    { price: 90, fetchedAt: new Date(hour + 5 * 60 * 1000).toISOString() }, // 10:05 — first, kept
    { price: 110, fetchedAt: new Date(hour + 24 * MS_PER_HOUR).toISOString() }, // next day same hour
  ];
  const windows = buildHourlyWindows(points, 24);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].movePct, Math.abs(((110 - 90) / 90) * 100));
});

runTest("a window whose end hour has no snapshot is skipped", () => {
  const hour = nextWeekdayAt(3, 10).getTime();
  const points = [{ price: 100, fetchedAt: new Date(hour).toISOString() }];
  const windows = buildHourlyWindows(points, 24);
  assert.equal(windows.length, 0);
});

runTest("equal prices between the two hours are left out", () => {
  const hour = nextWeekdayAt(3, 10).getTime();
  const points = [
    { price: 100, fetchedAt: new Date(hour).toISOString() },
    { price: 100, fetchedAt: new Date(hour + 24 * MS_PER_HOUR).toISOString() },
  ];
  const windows = buildHourlyWindows(points, 24);
  assert.equal(windows.length, 0);
});

runTest(
  "weighting to the event start-hour distribution changes the result vs. a plain median",
  () => {
    const cell14 = nextWeekdayAt(3, 14).getTime();
    const cell3 = nextWeekdayAt(3, 3).getTime();
    const windows = [
      { startMs: cell14, movePct: 1 },
      { startMs: cell14 + 7 * MS_PER_DAY, movePct: 1 },
      { startMs: cell14 + 14 * MS_PER_DAY, movePct: 1 },
      { startMs: cell3, movePct: 5 },
      { startMs: cell3 + 7 * MS_PER_DAY, movePct: 5 },
      { startMs: cell3 + 14 * MS_PER_DAY, movePct: 5 },
      { startMs: cell3 + 21 * MS_PER_DAY, movePct: 5 },
      { startMs: cell3 + 28 * MS_PER_DAY, movePct: 5 },
      { startMs: cell3 + 35 * MS_PER_DAY, movePct: 5 },
    ];
    // Plain median of all nine windows' movePct would be 5.
    const plainMedian = [...windows.map((w) => w.movePct)].sort((a, b) => a - b)[4];
    assert.equal(plainMedian, 5);

    const events = Array.from({ length: 6 }, (_, i) => cell14 + i * 7 * MS_PER_DAY);
    const result = computeMatchedWindowBaseline(windows, events, 24, 3);
    assert.ok(result);
    assert.equal(result!.medianMovePct, 1);
    assert.equal(result!.windowCount, 3);
    assert.equal(result!.eventRowsMatched, 6);
  },
);

runTest("a cell with events but no matching windows is dropped from eventRowsMatched", () => {
  const cellA = nextWeekdayAt(2, 10).getTime();
  const cellB = nextWeekdayAt(2, 11).getTime();
  const windows = Array.from({ length: 5 }, (_, i) => ({
    startMs: cellA + i * 7 * MS_PER_DAY,
    movePct: 2,
  }));
  const events = [
    ...Array.from({ length: 5 }, (_, i) => cellA + i * 7 * MS_PER_DAY),
    ...Array.from({ length: 2 }, (_, i) => cellB + i * 7 * MS_PER_DAY), // cell B has no windows
  ];
  const result = computeMatchedWindowBaseline(windows, events, 24, 5);
  assert.ok(result);
  assert.equal(result!.eventRowsMatched, 5);
  assert.equal(result!.windowCount, 5);
  assert.equal(result!.medianMovePct, 2);
});

runTest("fewer than minSampleSize events or windows returns null", () => {
  const cell = nextWeekdayAt(4, 9).getTime();
  const windows = [
    { startMs: cell, movePct: 2 },
    { startMs: cell + 7 * MS_PER_DAY, movePct: 3 },
  ];
  const events = [cell, cell + 7 * MS_PER_DAY];
  assert.equal(computeMatchedWindowBaseline(windows, events, 24, 20), null);
});
