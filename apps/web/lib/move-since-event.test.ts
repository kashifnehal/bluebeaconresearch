import assert from "node:assert/strict";

import { HORIZON_TOLERANCE_MS, moveSinceEvent, type SeriesPoint } from "./move-since-event";

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

const H = 3_600_000;
const E = Date.UTC(2026, 9, 1, 12, 0, 0);
const pt = (hoursAfter: number, price: number): SeriesPoint => ({ t: E + hoursAfter * H, price });

runTest("takes the first point at or after the event and the latest point", () => {
  const r = moveSinceEvent(E, [pt(-2, 90), pt(0.25, 100), pt(1, 101), pt(30, 110)]);
  assert.equal(r.atEvent?.price, 100);
  assert.equal(r.latest?.price, 110);
  assert.ok(Math.abs((r.sincePct ?? NaN) - 10) < 1e-9);
});

runTest("a point exactly at the event time counts as at the event", () => {
  const r = moveSinceEvent(E, [pt(0, 100), pt(2, 102)]);
  assert.equal(r.atEvent?.t, E);
  assert.ok(Math.abs((r.sincePct ?? NaN) - 2) < 1e-9);
});

runTest("1h, 4h and 24h use points that exist; never interpolated", () => {
  const r = moveSinceEvent(E, [pt(0, 100), pt(1, 101), pt(4, 96), pt(24.25, 120), pt(50, 130)]);
  assert.ok(Math.abs((r.after1hPct ?? NaN) - 1) < 1e-9);
  assert.ok(Math.abs((r.after4hPct ?? NaN) - -4) < 1e-9);
  assert.ok(Math.abs((r.after24hPct ?? NaN) - 20) < 1e-9);
});

runTest("a horizon with no point within the tolerance is null, not estimated", () => {
  // Daily-style series: next point is 24h after, nothing near 1h or 4h.
  const r = moveSinceEvent(E, [pt(0, 100), pt(24, 105), pt(48, 110)]);
  assert.equal(r.after1hPct, null);
  assert.equal(r.after4hPct, null);
  assert.ok(Math.abs((r.after24hPct ?? NaN) - 5) < 1e-9);
  assert.equal(r.latest?.price, 110);
});

runTest("a point just outside the tolerance does not count", () => {
  const r = moveSinceEvent(E, [pt(0, 100), { t: E + H + HORIZON_TOLERANCE_MS + 1, price: 101 }]);
  assert.equal(r.after1hPct, null);
});

runTest("an event after the last point has no price at the event", () => {
  const r = moveSinceEvent(E, [pt(-5, 90), pt(-1, 95)]);
  assert.equal(r.atEvent, null);
  assert.equal(r.latest, null);
  assert.equal(r.sincePct, null);
  assert.equal(r.after1hPct, null);
});

runTest("when the event point is the last point there is no 'since then'", () => {
  const r = moveSinceEvent(E, [pt(-3, 90), pt(0.5, 100)]);
  assert.equal(r.atEvent?.price, 100);
  assert.equal(r.latest, null);
  assert.equal(r.sincePct, null);
});

runTest("a horizon never reuses the event point itself", () => {
  // First point at/after the event is already past +1h; the 1h horizon must not point back at it.
  const r = moveSinceEvent(E, [pt(1.2, 100), pt(30, 103)]);
  assert.equal(r.atEvent?.price, 100);
  assert.equal(r.after1hPct, null);
});

runTest("empty series, NaN event time, and zero base price give nulls", () => {
  assert.equal(moveSinceEvent(E, []).atEvent, null);
  assert.equal(moveSinceEvent(Number.NaN, [pt(0, 1)]).atEvent, null);
  const r = moveSinceEvent(E, [pt(0, 0), pt(1, 5)]);
  assert.equal(r.sincePct, null);
  assert.equal(r.after1hPct, null);
});

runTest("unsorted input and non-finite points are handled", () => {
  const r = moveSinceEvent(E, [pt(30, 110), { t: Number.NaN, price: 1 }, pt(0, 100), pt(1, 99)]);
  assert.equal(r.atEvent?.price, 100);
  assert.equal(r.latest?.price, 110);
  assert.ok(Math.abs((r.after1hPct ?? NaN) - -1) < 1e-9);
});

runTest("does not mutate the input series", () => {
  const series = [pt(30, 110), pt(0, 100)];
  const copy = JSON.stringify(series);
  moveSinceEvent(E, series);
  assert.equal(JSON.stringify(series), copy);
});
