import assert from "node:assert/strict";
import { EVENT_CATEGORY_VALUES } from "@blue-beacon-research/shared";
import {
  DEFAULT_FILTERS,
  eventCategoryQueryParam,
  FILTER_COMMODITIES,
  symbolsForCommodityFilter,
} from "./signal-filters";

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

runTest("eventCategoryQueryParam(null) omits the param entirely", () => {
  assert.equal(eventCategoryQueryParam(null), "");
});

runTest("eventCategoryQueryParam(category) builds eventCategory=<value>", () => {
  assert.equal(
    eventCategoryQueryParam("armed_conflict_security"),
    "eventCategory=armed_conflict_security",
  );
});

runTest('eventCategoryQueryParam("uncategorized") builds eventCategory=uncategorized', () => {
  assert.equal(eventCategoryQueryParam("uncategorized"), "eventCategory=uncategorized");
});

runTest("DEFAULT_FILTERS.eventCategory defaults to null (All)", () => {
  assert.equal(DEFAULT_FILTERS.eventCategory, null);
});

runTest("EVENT_CATEGORY_VALUES has exactly 9 entries with no duplicates", () => {
  assert.equal(EVENT_CATEGORY_VALUES.length, 9);
  assert.equal(new Set(EVENT_CATEGORY_VALUES).size, 9);
});

// W7-ASSET-LISTS: COPPER/XAGUSD/USDINR added to the filter catalog.
runTest("FILTER_COMMODITIES includes COPPER, XAGUSD, and USDINR with no duplicate symbols", () => {
  const symbols = FILTER_COMMODITIES.map((c) => c.symbol);
  assert.ok(symbols.includes("COPPER"));
  assert.ok(symbols.includes("XAGUSD"));
  assert.ok(symbols.includes("USDINR"));
  assert.equal(new Set(symbols).size, symbols.length);
});

runTest("symbolsForCommodityFilter(cat:metals) includes COPPER and XAGUSD", () => {
  const symbols = symbolsForCommodityFilter("cat:metals");
  assert.ok(symbols.includes("COPPER"));
  assert.ok(symbols.includes("XAGUSD"));
  assert.ok(symbols.includes("XAUUSD"));
});

runTest("symbolsForCommodityFilter(USDINR) returns just USDINR", () => {
  assert.deepStrictEqual(symbolsForCommodityFilter("USDINR"), ["USDINR"]);
});

// W-ASSETS-ENERGY-3: TTF_GAS added to the filter catalog.
runTest("FILTER_COMMODITIES includes TTF_GAS with no duplicate symbols", () => {
  const symbols = FILTER_COMMODITIES.map((c) => c.symbol);
  assert.ok(symbols.includes("TTF_GAS"));
  assert.equal(new Set(symbols).size, symbols.length);
});

runTest("symbolsForCommodityFilter(cat:energy) includes TTF_GAS", () => {
  const symbols = symbolsForCommodityFilter("cat:energy");
  assert.ok(symbols.includes("TTF_GAS"));
});

runTest("symbolsForCommodityFilter(TTF_GAS) returns just TTF_GAS", () => {
  assert.deepStrictEqual(symbolsForCommodityFilter("TTF_GAS"), ["TTF_GAS"]);
});

// W-ASSETS-ENERGY-3: RBOB added to the filter catalog.
runTest("FILTER_COMMODITIES includes RBOB with no duplicate symbols", () => {
  const symbols = FILTER_COMMODITIES.map((c) => c.symbol);
  assert.ok(symbols.includes("RBOB"));
  assert.equal(new Set(symbols).size, symbols.length);
});

runTest("symbolsForCommodityFilter(cat:energy) includes RBOB", () => {
  const symbols = symbolsForCommodityFilter("cat:energy");
  assert.ok(symbols.includes("RBOB"));
});

runTest("symbolsForCommodityFilter(RBOB) returns just RBOB", () => {
  assert.deepStrictEqual(symbolsForCommodityFilter("RBOB"), ["RBOB"]);
});

// W-ASSETS-ENERGY-3: HEATING_OIL added to the filter catalog.
runTest("FILTER_COMMODITIES includes HEATING_OIL with no duplicate symbols", () => {
  const symbols = FILTER_COMMODITIES.map((c) => c.symbol);
  assert.ok(symbols.includes("HEATING_OIL"));
  assert.equal(new Set(symbols).size, symbols.length);
});

runTest("symbolsForCommodityFilter(cat:energy) includes HEATING_OIL", () => {
  const symbols = symbolsForCommodityFilter("cat:energy");
  assert.ok(symbols.includes("HEATING_OIL"));
});

runTest("symbolsForCommodityFilter(HEATING_OIL) returns just HEATING_OIL", () => {
  assert.deepStrictEqual(symbolsForCommodityFilter("HEATING_OIL"), ["HEATING_OIL"]);
});
