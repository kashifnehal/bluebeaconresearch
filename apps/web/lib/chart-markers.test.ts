import assert from "node:assert/strict";

import {
  MARKER_MERGE_THRESHOLD,
  buildMarkers,
  directionLabel,
  markerAriaLabel,
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

runTest("12 or fewer markers are never merged, even when close together", () => {
  const inputs = Array.from({ length: MARKER_MERGE_THRESHOLD }, (_, i) => input(`a${i}`, i * 0.1));
  const markers = buildMarkers(inputs, domain);
  assert.equal(markers.length, MARKER_MERGE_THRESHOLD);
  assert.ok(markers.every((m) => m.count === 1));
});

runTest("more than 12 markers merge when less than 2% of the range apart", () => {
  // 13 markers: a tight cluster of 5 within 1 day (1% of 100 days), 8 spread out.
  const cluster = [0, 0.2, 0.4, 0.6, 0.8].map((d, i) => input(`c${i}`, 10 + d, 4 + i));
  const spread = Array.from({ length: 8 }, (_, i) => input(`s${i}`, 20 + i * 5));
  const markers = buildMarkers([...cluster, ...spread], domain);
  assert.equal(markers.length, 9);
  const merged = markers.find((m) => m.count > 1);
  assert.ok(merged);
  assert.equal(merged!.count, 5);
  assert.equal(merged!.severity, 8);
  // Anchored at its highest-severity member's real position.
  assert.equal(merged!.t, T0 + 10.8 * DAY);
});

runTest("markers exactly 2% apart do not merge", () => {
  const inputs = Array.from({ length: 13 }, (_, i) => input(`e${i}`, 10 + i * 2));
  const markers = buildMarkers(inputs, domain);
  assert.equal(markers.length, 13);
});

runTest("markers at the exact same position always share one marker", () => {
  const markers = buildMarkers([input("x", 5, 6), input("y", 5, 9)], domain);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].count, 2);
  assert.equal(markers[0].severity, 9);
});

runTest("markers outside the visible range are dropped", () => {
  const markers = buildMarkers([input("in", 10), input("before", -5), input("after", 150)], domain);
  assert.deepEqual(markers.map((m) => m.members[0].id), ["in"]);
});

runTest("an empty range or empty input gives no markers", () => {
  assert.deepEqual(buildMarkers([], domain), []);
});

runTest("direction arrow shows only for up or down and only when members agree", () => {
  assert.equal(buildMarkers([input("u", 1, 5, "up")], domain)[0].direction, "up");
  assert.equal(buildMarkers([input("d", 1, 5, "down")], domain)[0].direction, "down");
  assert.equal(buildMarkers([input("v", 1, 5, "volatile")], domain)[0].direction, null);
  assert.equal(buildMarkers([input("n", 1, 5, null)], domain)[0].direction, null);
  const mixed = buildMarkers([input("m1", 1, 5, "up"), input("m2", 1, 4, "down")], domain);
  assert.equal(mixed[0].direction, null);
  const same = buildMarkers([input("s1", 1, 5, "down"), input("s2", 1, 4, "down")], domain);
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
  const m = buildMarkers([input("u", 1, 8, "up")], domain)[0];
  const text = `${markerAriaLabel(m)} ${directionLabel("up")} ${directionLabel(null)}`;
  assert.doesNotMatch(text, /\b(buy|sell|caused|because)\b/i);
  assert.equal(directionLabel(null), "Not stated");
});
