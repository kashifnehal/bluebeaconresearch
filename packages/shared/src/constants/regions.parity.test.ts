import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REGIONS } from "./commodities.js";

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

// Same fixture apps/backend/src/lib/region-registry-parity.test.ts reads.
const fixture = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../../../apps/backend/src/lib/region-registry-parity.fixture.json"),
    "utf-8",
  ),
);

runTest("REGIONS ids and labels match the region-registry fixture, in order", () => {
  assert.deepStrictEqual(
    REGIONS.map((region) => ({ id: region.id, label: region.label })),
    fixture,
  );
});
