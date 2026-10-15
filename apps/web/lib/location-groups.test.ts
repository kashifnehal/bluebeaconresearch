import assert from "node:assert/strict";
import type { CommodityImpact } from "@blue-beacon-research/shared";
import {
  NON_PLACE_COUNTRIES,
  groupSignalsByLocation,
  primaryImpactDirection,
  type LocationGroupSignal,
  type LocationOrder,
} from "./location-groups";

function impact(
  direction: CommodityImpact["direction"],
  confidence: number,
  asset = "USOIL",
): CommodityImpact {
  return { asset, direction, confidence };
}

function signal(
  country: string | null | undefined,
  createdAt: string,
  impacts: CommodityImpact[] | null = [],
  updatedAt?: string | null,
): LocationGroupSignal {
  return { country, createdAt, commodityImpacts: impacts, updatedAt };
}

function names(order: LocationOrder, rows: LocationGroupSignal[]): string[] {
  return groupSignalsByLocation(rows, order).groups.map((g) => g.country);
}

const iran = signal("Iran", "2026-10-01T00:00:00.000Z", [impact("up", 0.4)], "2026-10-10T00:00:00.000Z");
const iranOlder = signal("Iran", "2026-09-01T00:00:00.000Z", [impact("down", 0.9)]);
const iraqA = signal("Iraq", "2026-10-01T00:00:00.000Z", [impact("down", 0.8)]);
const iraqB = signal(" Iraq ", "2026-09-15T00:00:00.000Z", [impact("down", 0.2)]);
const yemen = signal("Yemen", "2026-10-03T00:00:00.000Z", [impact("up", 0.7)]);
const blank = signal("", "2026-10-12T00:00:00.000Z", [impact("up", 0.99)]);
const spaces = signal("   ", "2026-10-11T00:00:00.000Z", [impact("down", 0.99)]);
const missing = signal(undefined, "2026-10-11T00:00:00.000Z", [impact("up", 0.5)]);

const rows = [yemen, iraqB, blank, iran, spaces, iraqA, missing, iranOlder];

assert.equal(
  primaryImpactDirection([
    impact("down", 0.5, "USOIL"),
    impact("up", 0.5, "UKOIL"),
  ]),
  "down",
  "equal confidence keeps the earlier impact",
);

assert.equal(
  primaryImpactDirection([
    impact("down", 0.4),
    impact("up", 0.8),
  ]),
  "up",
  "higher confidence wins even when it is later",
);

assert.equal(primaryImpactDirection([]), "other");
assert.equal(primaryImpactDirection([impact("volatile", 0.9)]), "other");
assert.equal(primaryImpactDirection([impact("neutral", 0.9)]), "other");

{
  const grouped = groupSignalsByLocation(rows, "az");
  assert.deepEqual(
    grouped.groups.map((g) => g.country),
    ["Iran", "Iraq", "Yemen"],
    "blank country is not a group",
  );
  assert.equal(grouped.noLocation, 3);
  assert.equal(grouped.withLocation, 5);
  assert.equal(grouped.total, 8);
  assert.equal(grouped.uniqueLocations, 3);
  assert.equal(grouped.up, 2);
  assert.equal(grouped.down, 3);
  assert.equal(
    grouped.groups.some((g) => g.country === "" || g.country === "no location"),
    false,
  );

  const iranGroup = grouped.groups.find((g) => g.country === "Iran");
  assert.ok(iranGroup);
  assert.equal(iranGroup.count, 2);
  assert.equal(iranGroup.up, 1);
  assert.equal(iranGroup.down, 1);
  assert.equal(iranGroup.other, 0);
  assert.equal(iranGroup.latest, "2026-10-10T00:00:00.000Z");

  const iraqGroup = grouped.groups.find((g) => g.country === "Iraq");
  assert.ok(iraqGroup);
  assert.equal(iraqGroup.count, 2);
  assert.equal(iraqGroup.down, 2);
  assert.equal(iraqGroup.latest, "2026-10-01T00:00:00.000Z");
}

{
  const tied = groupSignalsByLocation(
    [
      signal("Iraq", "2026-10-02T00:00:00.000Z", [impact("up", 0.5)]),
      signal("Iran", "2026-10-02T00:00:00.000Z", [impact("up", 0.5)]),
    ],
    "count",
  );
  assert.deepEqual(
    tied.groups.map((g) => g.country),
    ["Iran", "Iraq"],
    "equal count sorts by country name",
  );
  assert.deepEqual(names("recent", [
    signal("Iraq", "2026-10-05T00:00:00.000Z", [impact("down", 0.2)]),
    signal("Iran", "2026-10-05T00:00:00.000Z", [impact("up", 0.2)]),
  ]), ["Iran", "Iraq"]);
  assert.deepEqual(names("up", [
    signal("Yemen", "2026-10-01T00:00:00.000Z", [impact("up", 0.2)]),
    signal("Iran", "2026-10-01T00:00:00.000Z", [impact("up", 0.2)]),
  ]), ["Iran", "Yemen"]);
  assert.deepEqual(names("down", [
    signal("Yemen", "2026-10-01T00:00:00.000Z", [impact("down", 0.2)]),
    signal("Iran", "2026-10-01T00:00:00.000Z", [impact("down", 0.2)]),
  ]), ["Iran", "Yemen"]);
}

assert.deepEqual(names("recent", rows), ["Iran", "Yemen", "Iraq"]);
assert.deepEqual(names("count", rows), ["Iran", "Iraq", "Yemen"]);
assert.deepEqual(names("up", rows), ["Iran", "Yemen", "Iraq"]);
assert.deepEqual(names("down", rows), ["Iraq", "Iran", "Yemen"]);
assert.deepEqual(names("az", rows), ["Iran", "Iraq", "Yemen"]);

{
  const other = groupSignalsByLocation(
    [
      signal("Oman", "2026-10-01T00:00:00.000Z", [impact("volatile", 0.6)]),
      signal("Oman", "2026-10-02T00:00:00.000Z", null),
    ],
    "az",
  );
  assert.equal(other.groups[0]?.other, 2);
  assert.equal(other.up, 0);
  assert.equal(other.down, 0);
}

assert.deepEqual(NON_PLACE_COUNTRIES, ["global"]);

{
  const globalTitle = signal("Global", "2026-10-01T00:00:00.000Z", [impact("up", 0.9)]);
  const globalLower = signal("global", "2026-10-02T00:00:00.000Z", [impact("down", 0.9)]);
  const globalUpper = signal(" GLOBAL ", "2026-10-03T00:00:00.000Z", [impact("up", 0.2)]);
  const eu = signal("European Union", "2026-10-04T00:00:00.000Z", [impact("up", 0.5)]);
  const iranOnly = signal("Iran", "2026-10-05T00:00:00.000Z", [impact("down", 0.4)]);
  const blankCountry = signal("", "2026-10-06T00:00:00.000Z", [impact("up", 0.1)]);
  const grouped = groupSignalsByLocation(
    [globalTitle, globalLower, globalUpper, eu, iranOnly, blankCountry],
    "az",
  );
  assert.equal(grouped.noLocation, 4);
  assert.equal(grouped.withLocation, 2);
  assert.equal(grouped.total, 6);
  assert.equal(grouped.uniqueLocations, 2);
  assert.deepEqual(
    grouped.groups.map((g) => g.country),
    ["European Union", "Iran"],
  );
  assert.equal(grouped.groups.some((g) => g.country.toLowerCase() === "global"), false);
  assert.equal(grouped.up, 1);
  assert.equal(grouped.down, 1);
}

{
  const orders: LocationOrder[] = ["recent", "count", "up", "down", "az"];
  const withGlobal = signal("Global", "2026-10-20T00:00:00.000Z", [impact("up", 0.99)]);
  for (const order of orders) {
    const base = groupSignalsByLocation(rows, order);
    const next = groupSignalsByLocation([...rows, withGlobal], order);
    assert.deepEqual(
      next.groups.map((g) => g.country),
      base.groups.map((g) => g.country),
      `${order} order ignores Global`,
    );
    assert.equal(next.noLocation, base.noLocation + 1);
  }
}

console.log("location-groups.test.ts ok");
