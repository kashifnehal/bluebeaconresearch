import assert from "node:assert/strict";
import { FOREX_SYMBOLS } from "./price-syncer.js";

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

// W7-ASSET-LISTS: USDINR added to the live Yahoo Finance forex sync map.
// USDINR=X was verified against a real yf.quote() call before this was written
// (regularMarketPrice 96.2925, currency INR, marketState REGULAR) — this test
// only guards the static mapping, not Yahoo's live API.
runTest("FOREX_SYMBOLS maps USDINR to the verified USDINR=X Yahoo symbol", () => {
  assert.equal(FOREX_SYMBOLS.USDINR, "USDINR=X");
});

runTest("FOREX_SYMBOLS has no duplicate Yahoo symbol values", () => {
  const values = Object.values(FOREX_SYMBOLS);
  assert.equal(new Set(values).size, values.length);
});
