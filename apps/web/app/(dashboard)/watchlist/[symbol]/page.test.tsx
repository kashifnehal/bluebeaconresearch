import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  const matches = [...source.matchAll(/return parsePriceHistoryPoints\(res\.ok, json\);/g)];
  assert.equal(matches.length, 2, "expected both the primary and overlay history queryFns to throw via parsePriceHistoryPoints");
});

runTest("chartError only applies to the db source, never the 5-year (Yahoo) range", () => {
  assert.match(source, /const chartError = activeRange\.source === "db" && historyError;/);
});

runTest("the chart error state shows the honest message plus a Retry button wired to refetchHistory", () => {
  const block = source.match(/chartDisplay === "error" \? \(([\s\S]*?)\) : chartDisplay === "insufficient"/);
  assert.ok(block, "expected to find the chartDisplay 'error' branch");
  assert.match(block![1], /Price history unavailable right now/);
  assert.match(block![1], /onClick=\{\(\) => refetchHistory\(\)\}/);
  assert.match(block![1], />\s*Retry\s*</);
});

runTest("the insufficient-data branch keeps the original 5-year vs 1-month copy", () => {
  const block = source.match(/chartDisplay === "insufficient" \? \(([\s\S]*?)\) : \(/);
  assert.ok(block, "expected to find the chartDisplay 'insufficient' branch");
  assert.match(block![1], /Not enough 5-year price history available for this symbol/);
  assert.match(block![1], /Not enough price history yet for a chart view/);
});
