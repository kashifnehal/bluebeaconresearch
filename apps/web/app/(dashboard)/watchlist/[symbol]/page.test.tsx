import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchPriceRequest, isNewsOnlySymbol } from "@/lib/news-only-assets";

// This page renders inside next/navigation's useParams, which throws outside
// a mounted App Router — renderToStaticMarkup can't exercise it in this
// plain-node test runner (same constraint as components/layout/Sidebar.test.tsx
// and ../WatchlistClient.test.tsx, which cover the shared display-state/parsing
// logic this page reuses from WatchlistClient.tsx directly). Source-text
// assertions guard the wiring that's specific to this file.

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

const dir = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(dir, "page.tsx"), "utf8");

runTest("both db-backed queries (historyPoints, overlayHistoryPoints) parse through parsePriceHistoryPoints", () => {
  const matches = [...source.matchAll(/return parsePriceHistoryPoints\(true, json\);/g)];
  assert.equal(matches.length, 2, "expected both the primary and overlay history queryFns to throw via parsePriceHistoryPoints");
});

runTest("chartError only applies to the db source, never the 5-year (Yahoo) range", () => {
  assert.match(source, /const chartError = activeRange\.source === "db" && historyError;/);
});

runTest("the chart error state shows the honest message plus a Retry button wired to refetchHistory", () => {
  const block = source.match(/chartDisplay === "error" \? \(([\s\S]*?)\) : chartDisplay === "insufficient"/);
  assert.ok(block, "expected to find the chartDisplay 'error' branch");
  assert.match(block![1], /DATA_SLOW_MESSAGE/);
  assert.match(block![1], /refetchHistory\(\)/);
  assert.match(block![1], /refetchHistory5y\(\)/);
  assert.match(block![1], />\s*Retry\s*</);
});

runTest("the insufficient-data branch keeps the original 5-year vs 1-month copy", () => {
  const block = source.match(/chartDisplay === "insufficient" \? \(([\s\S]*?)\) : \(/);
  assert.ok(block, "expected to find the chartDisplay 'insufficient' branch");
  assert.match(block![1], /Not enough 5-year price history available for this symbol/);
  assert.match(block![1], /Not enough price history yet for a chart view/);
});

runTest("pulse tiles mount under the header, before the price chart", () => {
  const header = source.indexOf("{/* Header */}");
  const pulse = source.indexOf("<PulseTiles");
  const chart = source.indexOf('data-testid="watchlist-chart-ranges"');
  assert.ok(header > -1 && pulse > header && chart > pulse);
  assert.match(source, /<PulseTiles symbol=\{symbol\} \/>/);
});

runTest("a priced symbol still takes the chart path", () => {
  assert.equal(isNewsOnlySymbol("USOIL"), false);
  const gate = source.indexOf("{!isNewsOnly && (");
  const chart = source.indexOf('data-testid="watchlist-chart-ranges"');
  const drivers = source.indexOf("<DriverBreakdownChart");
  assert.ok(gate > -1 && chart > gate && drivers > chart);
  assert.match(source, /<LineChart/);
});

runTest("news-only detail queries go through priceRequestUrl and stay disabled", () => {
  assert.equal(isNewsOnlySymbol("COCOA"), true);
  assert.match(source, /enabled: !isNewsOnly/);
  assert.match(source, /priceRequestUrl\(symbol, "latest"\)/);
  assert.match(source, /priceRequestUrl\(symbol, "history"\)/);
  assert.match(source, /priceRequestUrl\(symbol, "history5y"\)/);
  assert.match(source, /enabled: !isNewsOnly && Boolean\(overlaySymbol\)/);
  assert.match(source, /data-testid="news-only-detail-label"/);
  assert.match(source, /data-testid="watchlist-follow-toggle"/);
});

runTest("event markers replace the dashed reference lines and use a stable label element", () => {
  assert.doesNotMatch(source, /strokeDasharray="2 4"/);
  assert.doesNotMatch(source, /Dashed lines mark/);
  assert.match(source, /content: \(\s*<ChartMarkerLabel/);
  assert.doesNotMatch(source, /content: \(props\)/);
  assert.match(source, /buildMarkers\(inputs, domain\)/);
});

runTest("clicking a marker reuses the existing click-to-attribute handler", () => {
  const fn = source.match(/function handleMarkerSelect\(marker: ChartMarker\) \{([\s\S]*?)\n  \}\n/);
  assert.ok(fn, "expected handleMarkerSelect");
  assert.match(fn![1], /handleChartPointClick\(nearest\)/);
});

async function runAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

void runAsync("a news-only symbol makes no price request; a priced symbol still requests the chart routes", async () => {
  const calls: string[] = [];
  const mockFetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  for (const kind of ["latest", "history", "history5y"] as const) {
    const res = await fetchPriceRequest("COCOA", kind, mockFetch);
    assert.equal(res, null);
  }
  assert.deepEqual(calls, []);

  for (const kind of ["latest", "history", "history5y"] as const) {
    const res = await fetchPriceRequest("USOIL", kind, mockFetch);
    assert.ok(res);
  }
  assert.deepEqual(calls, [
    "/api/prices",
    "/api/prices/history?symbol=USOIL&days=90",
    "/api/prices/history-5y?symbol=USOIL",
  ]);
});
