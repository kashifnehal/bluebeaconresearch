import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ChartEventMarker, ChartMarkerLabel } from "./ChartEventMarker";
import { ChartMarkerCard, PRICE_CONTEXT_NOTE } from "./ChartMarkerCard";
import { moveSinceEvent } from "@/lib/move-since-event";
import type { ChartMarker } from "@/lib/chart-markers";

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

function member(id: string, severity: number, direction: "up" | "down" | "volatile" | null) {
  return { id, title: `Title ${id}`, eventMs: Date.UTC(2026, 9, 1), severity, direction, sourcesCount: 4 };
}

function marker(over: Partial<ChartMarker> & { members: ChartMarker["members"] }): ChartMarker {
  return {
    key: "k",
    t: 5,
    count: over.members.length,
    severity: Math.max(...over.members.map((m) => m.severity)),
    direction: null,
    ...over,
  };
}

const noop = () => {};

function renderMarker(m: ChartMarker, active = false) {
  return renderToStaticMarkup(
    createElement(
      "svg",
      null,
      createElement(ChartEventMarker, {
        marker: m,
        x: 50,
        y: 8,
        active,
        describedBy: "card",
        onActivate: noop,
        onDeactivate: noop,
        onSelect: noop,
      }),
    ),
  );
}

runTest("a single critical marker is a focusable button with a triangle and an up arrow", () => {
  const html = renderMarker(marker({ members: [member("a", 9, "up")], direction: "up" }));
  assert.match(html, /role="button"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /data-band="critical"/);
  assert.match(html, /data-testid="chart-event-marker-triangle"/);
  assert.match(html, />↑</);
  assert.doesNotMatch(html, /chart-event-marker-count/);
});

runTest("a merged marker shows its count and no arrow when members disagree", () => {
  const html = renderMarker(
    marker({ members: [member("a", 7, "up"), member("b", 6, "down"), member("c", 5, null)], direction: null }),
  );
  assert.match(html, /data-count="3"/);
  assert.match(html, /chart-event-marker-count[^>]*>3</);
  assert.doesNotMatch(html, /chart-event-marker-arrow/);
});

runTest("fill weight differs by band: base is hollow, critical is solid", () => {
  const base = renderMarker(marker({ members: [member("a", 5, null)] }));
  const critical = renderMarker(marker({ members: [member("a", 10, null)] }));
  assert.match(base, /fill="none"/);
  assert.match(critical, /fill="var\(--danger\)"/);
});

runTest("an active marker links to its card with aria-describedby", () => {
  const m = marker({ members: [member("a", 8, "down")], direction: "down" });
  assert.match(renderMarker(m, true), /aria-describedby="card"/);
  assert.doesNotMatch(renderMarker(m, false), /aria-describedby/);
});

runTest("ChartMarkerLabel draws the marker at the viewBox x and y recharts injects", () => {
  const html = renderToStaticMarkup(
    createElement(
      "svg",
      null,
      createElement(ChartMarkerLabel, {
        marker: marker({ members: [member("a", 8, "up")], direction: "up" }),
        viewBox: { x: 227, y: 8, width: 0, height: 150 },
        active: false,
        onActivate: noop,
        onDeactivate: noop,
        onSelect: noop,
      }),
    ),
  );
  // High band is 10px wide: path starts at x - 5, at y.
  assert.match(html, /d="M 222 8 L 232 8 L 227 18 Z"/);
});

runTest("ChartMarkerLabel draws nothing without a viewBox", () => {
  const html = renderToStaticMarkup(
    createElement(
      "svg",
      null,
      createElement(ChartMarkerLabel, {
        marker: marker({ members: [member("a", 8, null)] }),
        active: false,
        onActivate: noop,
        onDeactivate: noop,
        onSelect: noop,
      }),
    ),
  );
  assert.doesNotMatch(html, /chart-event-marker/);
});

runTest("card for one signal shows title, time, severity, direction for this asset and reports", () => {
  const html = renderToStaticMarkup(
    createElement(ChartMarkerCard, {
      id: "card",
      marker: marker({ members: [member("a", 8, "down")], direction: "down" }),
      x: 100,
      boxWidth: 600,
    }),
  );
  assert.match(html, /role="tooltip"/);
  assert.match(html, /Title a/);
  assert.match(html, />Reported</);
  assert.match(html, />Severity</);
  assert.match(html, />Direction for this asset</);
  assert.match(html, />Down</);
  assert.match(html, />Reports</);
  assert.match(html, />4</);
  assert.doesNotMatch(html, /\b(buy|sell|caused)\b/i);
});

runTest("card for a merged marker lists up to three titles and a remainder", () => {
  const members = ["a", "b", "c", "d", "e"].map((id, i) => member(id, 9 - i, null));
  const html = renderToStaticMarkup(
    createElement(ChartMarkerCard, { id: "card", marker: marker({ members }), x: 10, boxWidth: 600 }),
  );
  assert.match(html, /5 signals reported close together/);
  assert.match(html, /Title a/);
  assert.match(html, /Title c/);
  assert.doesNotMatch(html, /Title d/);
  assert.match(html, /and 2 more/);
});

runTest("card is clamped inside the chart box near the left edge", () => {
  const html = renderToStaticMarkup(
    createElement(ChartMarkerCard, { id: "card", marker: marker({ members: [member("a", 5, null)] }), x: 4, boxWidth: 600 }),
  );
  assert.match(html, /left:132px/);
});

const E = Date.UTC(2026, 9, 1, 12, 0, 0);
const H = 3_600_000;
const one = marker({ members: [{ ...member("a", 8, "up"), eventMs: E }], direction: "up" });

runTest("card shows Price at the event, Since then, horizons and the descriptive note", () => {
  const move = moveSinceEvent(E, [
    { t: E, price: 100 },
    { t: E + H, price: 101 },
    { t: E + 30 * H, price: 110 },
  ]);
  const html = renderToStaticMarkup(
    createElement(ChartMarkerCard, { id: "c", marker: one, x: 100, boxWidth: 600, priceContext: { kind: "series", move } }),
  );
  assert.match(html, />Price at the event</);
  assert.match(html, />100\.00</);
  assert.match(html, />Since then</);
  assert.match(html, /\+10\.00% \(110\.00\)/);
  assert.match(html, /\+1\.00% \/ — \/ —/);
  assert.ok(html.includes(PRICE_CONTEXT_NOTE));
  assert.doesNotMatch(html, /\b(buy|sell|caused|because)\b/i);
});

runTest("card says Not available when the series has no point for the event", () => {
  const move = moveSinceEvent(E, []);
  const html = renderToStaticMarkup(
    createElement(ChartMarkerCard, { id: "c", marker: one, x: 100, boxWidth: 600, priceContext: { kind: "series", move } }),
  );
  assert.equal((html.match(/Not available/g) ?? []).length, 2);
});

runTest("weekly range card shows 'Not available on weekly data' and no price rows", () => {
  const html = renderToStaticMarkup(
    createElement(ChartMarkerCard, { id: "c", marker: one, x: 100, boxWidth: 600, priceContext: { kind: "weekly" } }),
  );
  assert.match(html, /Not available on weekly data/);
  assert.doesNotMatch(html, /Price at the event/);
  assert.ok(html.includes(PRICE_CONTEXT_NOTE));
});

runTest("a merged marker card never shows price context", () => {
  const html = renderToStaticMarkup(
    createElement(ChartMarkerCard, {
      id: "c",
      marker: marker({ members: [member("a", 8, null), member("b", 7, null)] }),
      x: 100,
      boxWidth: 600,
      priceContext: { kind: "weekly" },
    }),
  );
  assert.doesNotMatch(html, /chart-marker-price-context/);
});
