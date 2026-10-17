import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PositioningPanelView } from "./PositioningPanel";
import { normalizeCotRows } from "@/lib/cot";

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

const rows = normalizeCotRows([
  { report_date: "2026-09-29", mm_long: 100000, mm_short: 70000, mm_spread: 4000 },
  { report_date: "2026-10-06", mm_long: 120000, mm_short: 50000, mm_spread: 5000 },
]);

runTest("shows latest long, short, spread, change, report date and the CFTC sentence", () => {
  const html = renderToStaticMarkup(createElement(PositioningPanelView, { rows }));
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(text, /120,000/);
  assert.match(text, /50,000/);
  assert.match(text, /5,000/);
  assert.match(text, /\+40,000/);
  assert.match(text, /Report date Oct 6, 2026/);
  assert.match(
    text,
    /Weekly report by the US Commodity Futures Trading Commission, positions as of Oct 6, 2026, published with a lag\. Descriptive only\./,
  );
  assert.doesNotMatch(text, /\b(buy|sell|bullish|bearish)\b/i);
});

runTest("renders nothing when there are no rows", () => {
  assert.equal(renderToStaticMarkup(createElement(PositioningPanelView, { rows: [] })), "");
});

runTest("a missing spread shows a dash, not a made-up number", () => {
  const html = renderToStaticMarkup(
    createElement(PositioningPanelView, { rows: normalizeCotRows([{ report_date: "2026-10-06", mm_long: 3, mm_short: 1 }]) }),
  );
  assert.match(html, />—</);
});

runTest("the panel mounts below the price chart on the asset page, for priced symbols only", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const page = readFileSync(path.join(dir, "../../app/(dashboard)/watchlist/[symbol]/page.tsx"), "utf8");
  const chart = page.indexOf('data-testid="watchlist-chart-ranges"');
  const panel = page.indexOf("<PositioningPanel ");
  const drivers = page.indexOf("<DriverBreakdownChart");
  assert.ok(chart > -1 && panel > chart && drivers > panel);
  assert.match(page, /\{!isNewsOnly && <PositioningPanel symbol=\{symbol\} \/>\}/);
});
