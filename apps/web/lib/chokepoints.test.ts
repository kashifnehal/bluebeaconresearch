import assert from "node:assert/strict";
import {
  CHOKEPOINTS,
  COMMODITIES,
} from "@blue-beacon-research/shared";
import type { Chokepoint } from "@blue-beacon-research/shared";
import { signalsNearChokepoint, type ChokepointSignal } from "./chokepoints";

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

// Turkish Straits and Panama Canal were re-sourced from the EIA "World Oil
// Transit Chokepoints" page (last updated March 3, 2026) and should no
// longer be empty — and should not show NGAS/CORN/WHEAT, which the page
// doesn't support.
{
  const turkishStraits = CHOKEPOINTS.find((cp) => cp.id === "turkish-straits");
  assert.ok(turkishStraits, "turkish-straits entry missing");
  assert.deepEqual(
    [...turkishStraits!.commodities].sort(),
    ["UKOIL", "USOIL"],
    "turkish-straits should resolve to USOIL/UKOIL only",
  );

  const panamaCanal = CHOKEPOINTS.find((cp) => cp.id === "panama-canal");
  assert.ok(panamaCanal, "panama-canal entry missing");
  assert.deepEqual(
    [...panamaCanal!.commodities].sort(),
    ["UKOIL", "USOIL"],
    "panama-canal should resolve to USOIL/UKOIL only",
  );
}

// The map's chokepoints list panel renders "No commodity link found (no
// source)" whenever a chokepoint's commodities array is empty (see
// apps/web/app/(dashboard)/map/page.tsx, `hasCommodities` check). Turkish
// Straits and Panama Canal now have sourced commodities, so that panel
// should no longer show that message for them.
for (const id of ["turkish-straits", "panama-canal"]) {
  const cp = CHOKEPOINTS.find((c) => c.id === id);
  assert.ok(cp, `${id} entry missing`);
  assert.ok(
    cp!.commodities.length > 0,
    `${id}: expected non-empty commodities so the map panel no longer shows "No commodity link found (no source)"`,
  );
}

// --- signalsNearChokepoint ---

function makeSignal(overrides: Partial<ChokepointSignal>): ChokepointSignal {
  return {
    id: "sig-1",
    title: "Test signal",
    summary: "",
    severity: 5,
    confidence: 0.8,
    eventType: "test",
    country: "",
    region: "global",
    sourcesCount: 1,
    commodityImpacts: [],
    isBreaking: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    lat: 0,
    lng: 0,
    ...overrides,
  };
}

const hormuzLike: Chokepoint = {
  id: "test-chokepoint",
  name: "Test Chokepoint",
  lat: 26.6,
  lng: 56.25,
  commodities: ["USOIL"],
};

// Signal inside radius with an overlapping commodity counts.
{
  const inside = makeSignal({
    id: "inside",
    lat: 26.7,
    lng: 56.3,
    commodityImpacts: [{ asset: "USOIL", direction: "up", confidence: 0.9 }],
  });
  const result = signalsNearChokepoint([inside], hormuzLike, 500);
  assert.equal(result.length, 1, "expected signal inside radius with overlapping commodity to count");
}

// Signal outside radius does not count, even with an overlapping commodity.
{
  const outside = makeSignal({
    id: "outside",
    lat: -26.6,
    lng: -123.75, // far from the chokepoint — well beyond 500km
    commodityImpacts: [{ asset: "USOIL", direction: "down", confidence: 0.9 }],
  });
  const result = signalsNearChokepoint([outside], hormuzLike, 500);
  assert.equal(result.length, 0, "expected signal outside radius not to count");
}

// Signal inside radius with no overlapping commodity does not count.
{
  const noOverlap = makeSignal({
    id: "no-overlap",
    lat: 26.7,
    lng: 56.3,
    commodityImpacts: [{ asset: "WHEAT", direction: "up", confidence: 0.9 }],
  });
  const result = signalsNearChokepoint([noOverlap], hormuzLike, 500);
  assert.equal(result.length, 0, "expected signal with no overlapping commodity not to count");
}

// Chokepoint with empty commodities counts 0, regardless of nearby signals.
{
  const emptyChokepoint: Chokepoint = { ...hormuzLike, commodities: [] };
  const nearby = makeSignal({
    id: "nearby",
    lat: 26.7,
    lng: 56.3,
    commodityImpacts: [{ asset: "USOIL", direction: "up", confidence: 0.9 }],
  });
  const result = signalsNearChokepoint([nearby], emptyChokepoint, 500);
  assert.equal(result.length, 0, "expected chokepoint with empty commodities to count 0");
}

console.log("chokepoints.test.ts ok");
