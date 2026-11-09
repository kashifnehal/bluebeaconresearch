import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Recharts' ResponsiveContainer needs a real measured size, which doesn't
// resolve under react-dom/server (or react-dom/client + linkedom) without a
// layout engine — PositioningPanel.test.tsx (the other Recharts component
// here) hits the same limit and reads its own source for anything that
// depends on the SVG internals Recharts only emits once it has a measured
// box. The title/wrapper above the chart still renders and is asserted here.
import { MarketImpactChart } from "./MarketImpactChart";
import { MARKET_IMPACT_CHART_TITLE } from "@/lib/market-impact-assessment";

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

function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

runTest("chart renders the up-or-down title above the chart wrapper", () => {
  const html = renderToStaticMarkup(
    createElement(MarketImpactChart, {
      checkpoints: [
        { checkpointHours: 24, medianMovePct: 0.97, sampleSize: 1232, unchangedCount: 0 },
        { checkpointHours: 48, medianMovePct: 1.4, sampleSize: 900, unchangedCount: 0 },
      ],
    }),
  );
  assert.match(html, /data-testid="market-impact-chart-title"/);
  assert.match(visibleText(html), new RegExp(MARKET_IMPACT_CHART_TITLE));
  assert.match(html, /data-testid="market-impact-chart"/);
  const titleIndex = html.indexOf('data-testid="market-impact-chart-title"');
  const chartIndex = html.indexOf('data-testid="market-impact-chart"');
  assert.ok(titleIndex > -1 && chartIndex > -1 && titleIndex < chartIndex);
});

runTest("bar fill is the muted-text token, not the brand accent, regardless of direction", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(path.join(dir, "MarketImpactChart.tsx"), "utf8");
  assert.match(source, /<Bar dataKey="medianMovePct" fill="var\(--text-muted\)"/);
  assert.equal(source.includes("var(--accent)"), false);
});
