import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CANONICAL_REGIONS } from "./region-registry.js";

const fixture = JSON.parse(
  readFileSync(new URL("./region-registry-parity.fixture.json", import.meta.url), "utf8"),
) as Array<{ id: string; label: string }>;

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

runTest("region-registry matches the shared fixture ids and labels, in order", () => {
  assert.deepEqual(
    CANONICAL_REGIONS.map((region) => ({ id: region.id, label: region.label })),
    fixture,
  );
});

runTest("legacy americas is not one of the 8 canonical ids", () => {
  const ids: readonly string[] = CANONICAL_REGIONS.map((region) => region.id);
  assert.equal(ids.includes("americas"), false);
});
