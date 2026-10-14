import assert from "node:assert/strict";
import { COMMODITY_REGISTRY, COMMODITIES, NEWS_ONLY_COMMODITIES, PRICED_COMMODITIES } from "./commodities.js";
import {
  COMMODITY_REGISTRY as BACKEND_COMMODITY_REGISTRY,
  PRICED_COMMODITIES as BACKEND_PRICED_COMMODITIES,
} from "../../../../apps/backend/src/lib/commodity-registry.js";

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

runTest("packages/shared and apps/backend commodity registries are deep-equal", () => {
  assert.deepStrictEqual(BACKEND_COMMODITY_REGISTRY, COMMODITY_REGISTRY);
});

runTest("backend PRICED_COMMODITIES matches the shared priced list", () => {
  assert.deepStrictEqual(BACKEND_PRICED_COMMODITIES, PRICED_COMMODITIES);
});

runTest("COMMODITIES matches priced registry entries, in order", () => {
  assert.deepStrictEqual(
    COMMODITIES.map((c) => ({ symbol: c.symbol, label: c.label, unit: c.unit, category: c.category })),
    PRICED_COMMODITIES.map((c) => ({ symbol: c.symbol, label: c.label, unit: c.unit, category: c.category })),
  );
});

runTest("NEWS_ONLY_COMMODITIES is exactly the provider none entries", () => {
  const fromRegistry = COMMODITY_REGISTRY.filter((c) => c.provider === "none");
  assert.deepStrictEqual(NEWS_ONLY_COMMODITIES, fromRegistry);
  for (const entry of NEWS_ONLY_COMMODITIES) {
    assert.equal(entry.provider, "none");
    assert.equal("yahooTicker" in entry, false);
    assert.equal("quoteCurrency" in entry, false);
    assert.deepStrictEqual([...entry.filterAnchors], []);
  }
});

runTest("priced and news-only lists cover every registry entry once", () => {
  assert.deepStrictEqual(
    [...PRICED_COMMODITIES, ...NEWS_ONLY_COMMODITIES].map((c) => c.symbol),
    COMMODITY_REGISTRY.map((c) => c.symbol),
  );
});
