import assert from "node:assert/strict";
import calendarData from "./economic-calendar.json";

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

type CalendarEvent = {
  id: string;
  date: string;
  time: string | null;
  timeApprox: boolean;
  event: string;
  category: string;
  sourceUrl: string;
  sourceLabel: string;
  creditLine?: string;
  status?: "confirmed" | "tentative";
};

const events = calendarData.events as CalendarEvent[];
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function utcWeekday(date: string): string {
  return WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

runTest("every event has a unique id", () => {
  const ids = events.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

runTest("every event date is a real calendar date in YYYY-MM-DD form", () => {
  for (const e of events) {
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/, `${e.id}: ${e.date}`);
    const d = new Date(`${e.date}T00:00:00Z`);
    assert.ok(!Number.isNaN(d.getTime()), `${e.id}: ${e.date} does not parse`);
    assert.equal(d.toISOString().slice(0, 10), e.date, `${e.id}: ${e.date} round-trips to a different date`);
  }
});

const eiaEvents = events.filter((e) => e.event === "EIA Weekly Petroleum Status Report");
const newEiaDates = [
  "2026-11-04",
  "2026-11-12",
  "2026-11-18",
  "2026-11-25",
  "2026-12-02",
  "2026-12-09",
  "2026-12-16",
];

runTest("the EIA weekly report extends through the next-60-day window with the expected dates", () => {
  const dates = eiaEvents.map((e) => e.date).sort();
  for (const expected of newEiaDates) {
    assert.ok(dates.includes(expected), `missing EIA date ${expected}`);
  }
});

runTest("every EIA date is a Wednesday, except the two eia.gov-documented holiday shifts to Thursday", () => {
  const knownThursdayShifts = new Set(["2026-10-15", "2026-11-12"]);
  for (const e of eiaEvents) {
    const weekday = utcWeekday(e.date);
    if (knownThursdayShifts.has(e.date)) {
      assert.equal(weekday, "Thu", `${e.date} should be the documented Thursday shift`);
    } else {
      assert.equal(weekday, "Wed", `${e.date} should be a plain Wednesday`);
    }
  }
});

runTest("every EIA row carries the required visible credit line, and only EIA rows do", () => {
  for (const e of events) {
    if (e.event === "EIA Weekly Petroleum Status Report") {
      assert.equal(e.creditLine, "Source: U.S. Energy Information Administration", e.id);
    } else {
      assert.equal(e.creditLine, undefined, `${e.id} should not have a creditLine`);
    }
  }
});

runTest("USDA WASDE and Crop Production land on Nov 10 and Dec 10, 2026, per NASS's own PFEI schedule", () => {
  const wasde = events.filter((e) => e.event.startsWith("USDA WASDE")).map((e) => e.date).sort();
  const cropProd = events.filter((e) => e.event === "USDA Crop Production").map((e) => e.date).sort();
  assert.deepEqual(wasde, ["2026-10-09", "2026-11-10", "2026-12-10"]);
  assert.deepEqual(cropProd, ["2026-10-09", "2026-11-10", "2026-12-10"]);
  // Real calendar weekdays (not assumed to fall on any one weekday) — the
  // NASS PDF gives day-of-month only, these are what that resolves to.
  assert.equal(utcWeekday("2026-11-10"), "Tue");
  assert.equal(utcWeekday("2026-12-10"), "Thu");
});

runTest("no USDA Grain Stocks entry was invented for Nov/Dec 2026 — NASS's own schedule has none in that window", () => {
  const grainStocks = events.filter((e) => e.event.startsWith("USDA Grain Stocks"));
  assert.deepEqual(grainStocks.map((e) => e.date), ["2026-09-30"]);
});

runTest("every event has a real source URL and label — nothing invented with a placeholder", () => {
  for (const e of events) {
    assert.match(e.sourceUrl, /^https:\/\//, e.id);
    assert.ok(e.sourceLabel.length > 0, e.id);
  }
});

runTest("every row with status 'tentative' has timeApprox true — an unconfirmed date is never shown as a firm time", () => {
  for (const e of events) {
    if (e.status === "tentative") {
      assert.equal(e.timeApprox, true, `${e.id} is tentative but timeApprox is not true`);
    }
  }
});

runTest("forecast/previous/actual stay null — no fabricated placeholder numbers", () => {
  for (const e of calendarData.events as Array<{ forecast: unknown; previous: unknown; actual: unknown }>) {
    assert.equal(e.forecast, null);
    assert.equal(e.previous, null);
    assert.equal(e.actual, null);
  }
});
