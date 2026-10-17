import assert from "node:assert/strict";

import {
  buildMarkers,
  directionLabel,
  markerAriaLabel,
  medianGapMs,
  snapToSeries,
  severityBand,
  signalsToMarkerSignals,
  type MarkerInput,
} from "./chart-markers";

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

const DAY = 24 * 3_600_000;
const T0 = Date.UTC(2026, 8, 1);
const domain: [number, number] = [T0, T0 + 100 * DAY];

function input(id: string, dayOffset: number, severity = 5, direction: MarkerInput["direction"] = null): MarkerInput {
  const t = T0 + dayOffset * DAY;
  return { id, title: `Signal ${id}`, eventMs: t, t, severity, direction, sourcesCount: 2 };
}

runTest("severity bands follow the SeverityBadge cut-offs", () => {
  assert.equal(severityBand(10), "critical");
  assert.equal(severityBand(9), "critical");
  assert.equal(severityBand(8), "high");
  assert.equal(severityBand(7), "elevated");
  assert.equal(severityBand(6), "base");
  assert.equal(severityBand(1), "base");
});

// Pixel-based merge tests use a domain/box width pair where 1ms of t == 1px,
// so the examples below can be read directly as pixel positions.
const PX_LO = 0;
const PX_HI = 1000;
const pxDomain: [number, number] = [PX_LO, PX_HI];
const pxBoxWidth = PX_HI - PX_LO;
function pxInput(id: string, px: number, severity = 5, direction: MarkerInput["direction"] = null): MarkerInput {
  return { id, title: `Signal ${id}`, eventMs: px, t: px, severity, direction, sourcesCount: 2 };
}

runTest("markers 24px or farther apart are never merged", () => {
  const markers = buildMarkers([pxInput("a", 0), pxInput("b", 24), pxInput("c", 60)], pxDomain, pxBoxWidth);
  assert.equal(markers.length, 3);
  assert.ok(markers.every((m) => m.count === 1));
});

runTest("markers closer than 24px merge into one marker with the total count", () => {
  const markers = buildMarkers([pxInput("a", 0, 4), pxInput("b", 10, 7), pxInput("c", 20, 5)], pxDomain, pxBoxWidth);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].count, 3);
  assert.equal(markers[0].severity, 7);
  // Anchored at its highest-severity member's real position.
  assert.equal(markers[0].t, 10);
});

runTest("a merge group's distance is measured from its anchor, not chained point-to-point", () => {
  // 0->20 is 20px (joins), 20->40 is within 24px of 20 but 40px from the
  // anchor at 0, so it starts a new group rather than chaining forward.
  const markers = buildMarkers([pxInput("a", 0), pxInput("b", 20), pxInput("c", 40)], pxDomain, pxBoxWidth);
  assert.equal(markers.length, 2);
  assert.deepEqual(markers.map((m) => m.count), [2, 1]);
});

runTest("markers at the exact same position always share one marker, even unmeasured (boxWidthPx 0)", () => {
  const markers = buildMarkers([input("x", 5, 6), input("y", 5, 9)], domain, 0);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].count, 2);
  assert.equal(markers[0].severity, 9);
});

runTest("an unmeasured chart (boxWidthPx 0) does not merge otherwise-distinct markers", () => {
  const markers = buildMarkers([pxInput("a", 0), pxInput("b", 10)], pxDomain, 0);
  assert.equal(markers.length, 2);
});

runTest("markers outside the visible range are dropped", () => {
  const markers = buildMarkers([input("in", 10), input("before", -5), input("after", 150)], domain, 1000);
  assert.deepEqual(markers.map((m) => m.members[0].id), ["in"]);
});

runTest("an empty range or empty input gives no markers", () => {
  assert.deepEqual(buildMarkers([], domain, 1000), []);
});

runTest("direction arrow shows only for up or down and only when members agree", () => {
  assert.equal(buildMarkers([input("u", 1, 5, "up")], domain, 1000)[0].direction, "up");
  assert.equal(buildMarkers([input("d", 1, 5, "down")], domain, 1000)[0].direction, "down");
  assert.equal(buildMarkers([input("v", 1, 5, "volatile")], domain, 1000)[0].direction, null);
  assert.equal(buildMarkers([input("n", 1, 5, null)], domain, 1000)[0].direction, null);
  const mixed = buildMarkers([input("m1", 1, 5, "up"), input("m2", 1, 4, "down")], domain, 1000);
  assert.equal(mixed[0].direction, null);
  const same = buildMarkers([input("s1", 1, 5, "down"), input("s2", 1, 4, "down")], domain, 1000);
  assert.equal(same[0].direction, "down");
});

runTest("signalsToMarkerSignals reads the direction for this asset, event date first", () => {
  const out = signalsToMarkerSignals(
    [
      {
        id: "s1",
        title: "T",
        severity: 8,
        sourcesCount: 3,
        eventDate: "2026-09-10T00:00:00.000Z",
        createdAt: "2026-09-12T00:00:00.000Z",
        commodityImpacts: [
          { asset: "GOLD", direction: "up", confidence: 0.5 },
          { asset: "USOIL", direction: "down", confidence: 0.5 },
        ],
      } as never,
      { id: "bad", title: "B", severity: 1, sourcesCount: 1, createdAt: "not a date", commodityImpacts: [] } as never,
    ],
    "USOIL",
    false,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].direction, "down");
  assert.equal(out[0].eventMs, Date.UTC(2026, 8, 10));
  assert.equal(out[0].sourcesCount, 3);
});

runTest("labels are descriptive and contain no buy or sell wording", () => {
  const m = buildMarkers([input("u", 1, 8, "up")], domain, 1000)[0];
  const text = `${markerAriaLabel(m)} ${directionLabel("up")} ${directionLabel(null)}`;
  assert.doesNotMatch(text, /\b(buy|sell|caused|because)\b/i);
  assert.equal(directionLabel(null), "Not stated");
});

const WEEK = 7 * DAY;
const weekly = Array.from({ length: 10 }, (_, i) => T0 + i * WEEK);
const sig = (id: string, dayOffset: number) => ({
  id,
  title: id,
  eventMs: T0 + dayOffset * DAY,
  severity: 6,
  direction: null,
  sourcesCount: 1,
});

runTest("medianGapMs reads the series spacing", () => {
  assert.equal(medianGapMs(weekly), WEEK);
  assert.equal(medianGapMs([1]), 0);
  assert.equal(medianGapMs([]), 0);
});

runTest("snapToSeries places a signal on the nearest weekly point and keeps its event time", () => {
  const out = snapToSeries([sig("a", 9), sig("b", 11)], weekly);
  assert.equal(out[0].t, T0 + 7 * DAY); // 9 days -> nearest is day 7
  assert.equal(out[1].t, T0 + 14 * DAY); // 11 days -> nearest is day 14
  assert.equal(out[0].eventMs, T0 + 9 * DAY);
});

runTest("a signal in the current week after the last point still snaps to it; one far outside is dropped", () => {
  const last = T0 + 9 * WEEK;
  const out = snapToSeries(
    [
      { ...sig("near", 0), eventMs: last + 5 * DAY },
      { ...sig("far", 0), eventMs: last + 40 * DAY },
      { ...sig("early", 0), eventMs: T0 - 60 * DAY },
    ],
    weekly,
  );
  assert.deepEqual(out.map((o) => o.id), ["near"]);
  assert.equal(out[0].t, last);
});

runTest("snapped signals sharing a week share one marker, and merging follows the same rule", () => {
  const sameWeek = snapToSeries([sig("a", 8), sig("b", 9), sig("c", 10)], weekly);
  const range: [number, number] = [weekly[0], weekly[9]];
  // Any box width works here: these three all snap to the same weekly point,
  // so they merge on the always-on exact-position rule, not pixel distance.
  const markers = buildMarkers(sameWeek, range, 1000);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].count, 3);
  // 14 signals across 10 weeks snapped onto weekly points ~111px apart at
  // this box width (well over the 24px merge distance), so only the signals
  // that land on the exact same weekly point merge.
  const many = snapToSeries(
    Array.from({ length: 14 }, (_, i) => sig(`m${i}`, i * 4)),
    weekly,
  );
  const merged = buildMarkers(many, range, 1000);
  assert.ok(merged.length < 14);
  assert.equal(merged.reduce((n, m) => n + m.count, 0), many.filter((m) => m.t <= range[1]).length);
});

runTest("snapToSeries returns nothing for an empty series", () => {
  assert.deepEqual(snapToSeries([sig("a", 1)], []), []);
});
