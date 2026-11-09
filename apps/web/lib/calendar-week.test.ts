import assert from "node:assert/strict";
import { getWeekRangeUTC, isInCurrentWeekUTC } from "./calendar-week.js";

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

function iso(d: Date): string {
  return d.toISOString();
}

// Fixed reference week for every case below: Monday 2026-11-09 00:00 UTC
// through Monday 2026-11-16 00:00 UTC (exclusive).
const WEEK_START = "2026-11-09T00:00:00.000Z";
const NEXT_WEEK_START = "2026-11-16T00:00:00.000Z";

runTest("Monday (mid-morning): the week starts that same Monday", () => {
  const now = new Date("2026-11-09T10:00:00Z");
  const { start, end } = getWeekRangeUTC(now);
  assert.equal(iso(start), WEEK_START);
  assert.equal(iso(end), NEXT_WEEK_START);
});

runTest("Wednesday: still the same Mon-Sun week as the Monday case", () => {
  const now = new Date("2026-11-11T15:00:00Z");
  const { start, end } = getWeekRangeUTC(now);
  assert.equal(iso(start), WEEK_START);
  assert.equal(iso(end), NEXT_WEEK_START);
});

runTest("Sunday 23:59 UTC: belongs to the week that is ending, not the next one", () => {
  const now = new Date("2026-11-15T23:59:00Z");
  const { start, end } = getWeekRangeUTC(now);
  assert.equal(iso(start), WEEK_START, "Sunday night should still resolve to this Monday's start");
  assert.equal(iso(end), NEXT_WEEK_START);
});

runTest("Monday 00:00 UTC: the exact boundary rolls over to the new week", () => {
  const now = new Date("2026-11-16T00:00:00Z");
  const { start, end } = getWeekRangeUTC(now);
  assert.equal(iso(start), NEXT_WEEK_START, "the instant the new week starts, it should be the new week's start");
  assert.equal(iso(end), "2026-11-23T00:00:00.000Z");
});

runTest("every day of a Mon-Sun week maps to the identical {start,end} pair", () => {
  const days = [
    "2026-11-09T00:00:00Z", // Mon 00:00 (start boundary, inclusive)
    "2026-11-10T12:00:00Z", // Tue
    "2026-11-11T12:00:00Z", // Wed
    "2026-11-12T12:00:00Z", // Thu
    "2026-11-13T12:00:00Z", // Fri
    "2026-11-14T12:00:00Z", // Sat
    "2026-11-15T23:59:59Z", // Sun, last instant of the week
  ];
  for (const d of days) {
    const { start, end } = getWeekRangeUTC(new Date(d));
    assert.equal(iso(start), WEEK_START, d);
    assert.equal(iso(end), NEXT_WEEK_START, d);
  }
});

// Regression case for the reported bug: on Sunday 8 Nov 2026, a real event
// dated that same Sunday must still count as "this week" (not last week's),
// and the instant it becomes Monday 9 Nov, that same event must drop out of
// "this week" (it's now in the past, not upcoming either).
runTest("a Sunday-dated event is in-week on that Sunday, and out of the week once Monday starts", () => {
  const sundayEvent = new Date("2026-11-08T18:00:00Z"); // Sunday 8 Nov 2026, 18:00 UTC
  const sundayNow = new Date("2026-11-08T10:00:00Z");
  const mondayNow = new Date("2026-11-09T00:00:00Z");
  assert.equal(isInCurrentWeekUTC(sundayEvent, sundayNow), true);
  assert.equal(isInCurrentWeekUTC(sundayEvent, mondayNow), false);
});

runTest("isInCurrentWeekUTC: start is inclusive, end is exclusive", () => {
  const now = new Date("2026-11-11T12:00:00Z"); // any day in the reference week
  assert.equal(isInCurrentWeekUTC(new Date(WEEK_START), now), true);
  assert.equal(isInCurrentWeekUTC(new Date(NEXT_WEEK_START), now), false);
});
