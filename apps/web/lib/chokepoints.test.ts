import assert from "node:assert/strict";
import {
  CHOKEPOINTS,
  COMMODITIES,
} from "@blue-beacon-research/shared";

const validSymbols = new Set(COMMODITIES.map((c) => c.symbol));

for (const cp of CHOKEPOINTS) {
  for (const symbol of cp.commodities) {
    assert.ok(
      validSymbols.has(symbol),
      `${cp.id}: commodity "${symbol}" is not a member of COMMODITIES`,
    );
  }

  assert.ok(
    cp.lat >= -90 && cp.lat <= 90,
    `${cp.id}: lat ${cp.lat} out of valid range`,
  );
  assert.ok(
    cp.lng >= -180 && cp.lng <= 180,
    `${cp.id}: lng ${cp.lng} out of valid range`,
  );
}

// Every declared chokepoint id is unique.
assert.equal(
  new Set(CHOKEPOINTS.map((cp) => cp.id)).size,
  CHOKEPOINTS.length,
);

// Spot-check: Hormuz should sit near 26.6 N, 56.25 E.
const hormuz = CHOKEPOINTS.find((cp) => cp.id === "strait-of-hormuz");
assert.ok(hormuz, "strait-of-hormuz entry missing");
assert.ok(Math.abs(hormuz!.lat - 26.6) < 1, "Hormuz lat not near 26.6 N");
assert.ok(Math.abs(hormuz!.lng - 56.25) < 1, "Hormuz lng not near 56.25 E");

console.log("chokepoints.test.ts ok");
