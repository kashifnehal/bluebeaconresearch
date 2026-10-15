import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REGIONS } from "./commodities.js";

const fixture = JSON.parse(
  readFileSync(
    new URL("../../../../apps/backend/src/lib/region-registry-parity.fixture.json", import.meta.url),
    "utf8",
  ),
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

runTest("REGIONS ids and labels match the region-registry fixture, in order", () => {
  assert.deepEqual(
    REGIONS.map((region) => ({ id: region.id, label: region.label })),
    fixture,
  );
});
