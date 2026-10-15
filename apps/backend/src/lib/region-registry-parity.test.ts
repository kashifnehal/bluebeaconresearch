import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CANONICAL_REGIONS, LEGACY_REGION_IDS } from "./region-registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const fixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "./region-registry-parity.fixture.json"), "utf-8"),
);

runTest("region-registry matches the shared fixture ids and labels, in order", () => {
  assert.deepStrictEqual(
    CANONICAL_REGIONS.map((region) => ({ id: region.id, label: region.label })),
    fixture,
  );
});

runTest("legacy americas is not one of the 8 canonical ids", () => {
  assert.deepStrictEqual([...LEGACY_REGION_IDS], ["americas"]);
  const ids: readonly string[] = CANONICAL_REGIONS.map((region) => region.id);
  assert.equal(ids.includes("americas"), false);
});
