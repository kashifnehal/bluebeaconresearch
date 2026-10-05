import assert from "node:assert/strict";
import { SYMBOLS } from "./prices.js";

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

// W7-ASSET-LISTS: USDINR added to the Redis-fallback symbol bound list.
runTest("SYMBOLS includes USDINR exactly once", () => {
  assert.equal(SYMBOLS.filter((s) => s === "USDINR").length, 1);
});

runTest("SYMBOLS has no duplicates", () => {
  assert.equal(new Set(SYMBOLS).size, SYMBOLS.length);
});
