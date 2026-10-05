import assert from "node:assert/strict";
import { COMMODITIES } from "./commodities.js";

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

// W7-ASSET-LISTS: COPPER/XAGUSD/USDINR added to the /v1/commodities catalog.
runTest("COMMODITIES includes COPPER, XAGUSD, and USDINR with no duplicate symbols", () => {
  const symbols = COMMODITIES.map((c) => c.symbol);
  assert.ok(symbols.includes("COPPER"));
  assert.ok(symbols.includes("XAGUSD"));
  assert.ok(symbols.includes("USDINR"));
  assert.equal(new Set(symbols).size, symbols.length);
});

runTest("USDINR entry has the fx category and USD/INR label", () => {
  const usdinr = COMMODITIES.find((c) => c.symbol === "USDINR");
  assert.ok(usdinr, "expected a USDINR entry");
  assert.equal(usdinr?.category, "fx");
  assert.equal(usdinr?.label, "USD/INR");
});
