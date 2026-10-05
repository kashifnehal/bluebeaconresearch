import assert from "node:assert/strict";
import { YAHOO_TICKERS } from "./price-history.js";

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

// W7-ASSET-LISTS: USDINR added to the 5y chart ticker map.
runTest("YAHOO_TICKERS maps USDINR to the verified USDINR=X Yahoo symbol", () => {
  assert.equal(YAHOO_TICKERS.USDINR, "USDINR=X");
});

runTest("YAHOO_TICKERS has no duplicate Yahoo symbol values", () => {
  const values = Object.values(YAHOO_TICKERS);
  assert.equal(new Set(values).size, values.length);
});
