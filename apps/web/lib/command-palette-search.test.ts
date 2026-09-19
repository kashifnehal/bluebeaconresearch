import assert from "node:assert/strict";
import { STATIC_PAGES, matchStaticPages, matchCommodities, matchAlertRules } from "./command-palette-search";

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

const COMMODITIES = [
  { symbol: "USOIL", label: "WTI Crude" },
  { symbol: "UKOIL", label: "Brent Crude" },
  { symbol: "XAUUSD", label: "Gold" },
  { symbol: "WHEAT", label: "Wheat" },
  { symbol: "NGAS", label: "Natural Gas" },
  { symbol: "CORN", label: "Corn" },
  { symbol: "COPPER", label: "Copper" },
];

const RULES = [
  { id: "r1", name: "Severe Middle East oil", regions: ["Middle East"], commodities: ["USOIL"] },
];

runTest("STATIC_PAGES has 8 entries, each with real keywords, and matches the AI-assist page catalog's URLs", () => {
  assert.equal(STATIC_PAGES.length, 8);
  assert.equal(
    STATIC_PAGES.every((p) => Array.isArray(p.keywords) && p.keywords.length > 0),
    true,
  );
  // Mirrors apps/backend/src/lib/search-catalog.ts's SEARCH_PAGE_ENTRIES url set
  // (see that file's own catalog test) — Change 3's cross-app consistency check.
  assert.deepEqual(
    STATIC_PAGES.map((p) => p.href).sort(),
    ["/alerts", "/backtesting", "/calendar", "/dashboard", "/help", "/map", "/settings", "/watchlist"],
  );
});

runTest('fuzzy keyword match: "charts" finds Watchlist (previously required the literal word "watchlist")', () => {
  const labels = matchStaticPages("charts").map((p) => p.label);
  assert.ok(labels.includes("Watchlist"), `expected Watchlist in ${JSON.stringify(labels)}`);
});

runTest('fuzzy keyword match: "what are the commodity news" finds the Intelligence Feed (Dashboard)', () => {
  const labels = matchStaticPages("what are the commodity news").map((p) => p.label);
  assert.ok(labels.includes("Intelligence Feed"), `expected Intelligence Feed in ${JSON.stringify(labels)}`);
});

runTest('regression: "gold" still matches the Gold commodity exactly as the old substring check did', () => {
  const labels = matchCommodities("gold", COMMODITIES).map((c) => c.label);
  assert.deepEqual(labels, ["Gold"]);
});

runTest('"smb" (no real match) returns nothing for pages, commodities, or rules — zero results is correct here', () => {
  assert.deepEqual(matchStaticPages("smb"), []);
  assert.deepEqual(matchCommodities("smb", COMMODITIES), []);
  assert.deepEqual(matchAlertRules("smb", RULES), []);
});

runTest("does not fabricate a page match for unrelated noise input", () => {
  assert.deepEqual(matchStaticPages("xyz garbage input"), []);
});

runTest("empty query returns every static page unfiltered (pre-typing palette state)", () => {
  assert.equal(matchStaticPages("").length, STATIC_PAGES.length);
});

runTest("alert-rule keyword match still works against name/region/commodity haystack", () => {
  const names = matchAlertRules("middle east", RULES).map((r) => r.name);
  assert.ok(names.includes("Severe Middle East oil"));
});

runTest("Economic Calendar page is findable by real user words, not just its title", () => {
  const labels = matchStaticPages("fed meeting").map((p) => p.label);
  assert.ok(labels.includes("Economic Calendar"), `expected Economic Calendar in ${JSON.stringify(labels)}`);
  const cpiLabels = matchStaticPages("cpi").map((p) => p.label);
  assert.ok(cpiLabels.includes("Economic Calendar"));
});
