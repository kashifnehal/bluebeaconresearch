import assert from "node:assert/strict";
import { CANONICAL_REGION_IDS } from "./region-registry.js";
import { canonicalizeRegion, regionMatches } from "./region-variants.js";

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

runTest("old label rule ('Middle East') matches new label signal ('middle-east')", () => {
  assert.equal(regionMatches(["Middle East"], "middle-east"), true);
});

runTest("new label rule ('middle-east') matches old label signal ('Middle East')", () => {
  assert.equal(regionMatches(["middle-east"], "Middle East"), true);
});

runTest("unknown label with no known variant falls back to exact match", () => {
  assert.equal(regionMatches(["middle-east"], "Middle East - Iran"), false);
  assert.equal(regionMatches(["Caribbean/Americas"], "Caribbean/Americas"), true);
});

runTest("empty rule regions never match", () => {
  assert.equal(regionMatches([], "middle-east"), false);
});

runTest("empty/falsy signal region never matches", () => {
  assert.equal(regionMatches(["middle-east"], ""), false);
});

runTest("no overlap across different regions does not match", () => {
  assert.equal(regionMatches(["africa"], "middle-east"), false);
});

runTest("North America matches north-america through regionMatches", () => {
  assert.equal(regionMatches(["North America"], "north-america"), true);
  assert.equal(regionMatches(["north-america"], "North America"), true);
});

runTest("canonicalizeRegion maps the named cases onto the 8 ids", () => {
  const cases: Array<[string | null, string | null, string]> = [
    ["Middle East / Europe", null, "middle-east"],
    ["Europe/Russia", null, "europe"],
    ["United States", "United States", "north-america"],
    ["Black Sea", "Ukraine", "eastern-europe"],
    ["South Asia", null, "asia-pacific"],
    ["N/A", null, "global"],
    [null, null, "global"],
  ];
  for (const [raw, country, expected] of cases) {
    const actual = canonicalizeRegion(raw, country);
    assert.equal(actual, expected, `${String(raw)} / ${String(country)}`);
    assert.equal(CANONICAL_REGION_IDS.includes(actual), true);
  }
});

runTest("every canonicalizeRegion output is one of the 8 ids", () => {
  const inputs: Array<[string | null, string | null]> = [
    ["Middle East", null],
    ["americas", null],
    ["americas", "Brazil"],
    ["Latin America", "Mexico"],
    ["Arctic", null],
    ["", "France"],
    ["not a region", null],
    ["North America / Russia", "United States"],
  ];
  for (const [raw, country] of inputs) {
    const actual = canonicalizeRegion(raw, country);
    assert.equal(CANONICAL_REGION_IDS.includes(actual), true, actual);
  }
  assert.equal(canonicalizeRegion("americas", null), "global");
  assert.equal(canonicalizeRegion("americas", "Brazil"), "south-america");
  assert.equal(canonicalizeRegion("Latin America", "Mexico"), "global");
});
