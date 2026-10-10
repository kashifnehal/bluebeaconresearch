import assert from "node:assert/strict";
import { COMMODITY_REGISTRY, COMMODITIES } from "./commodities.js";
import { COMMODITY_REGISTRY as BACKEND_COMMODITY_REGISTRY } from "../../../../apps/backend/src/lib/commodity-registry.js";

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

runTest("COMMODITIES has the same symbol/label/unit/category, in the same order, as the registry", () => {
  assert.deepStrictEqual(
    COMMODITIES.map((c) => ({ symbol: c.symbol, label: c.label, unit: c.unit, category: c.category })),
    COMMODITY_REGISTRY.map((c) => ({ symbol: c.symbol, label: c.label, unit: c.unit, category: c.category })),
  );
});
