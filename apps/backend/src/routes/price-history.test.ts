import assert from "node:assert/strict";
import { NO_PRICE_SYMBOLS, YAHOO_TICKERS, newsOnlyHistoryRejection } from "./price-history.js";

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

const NEWS_ONLY_SYMBOLS = ["VEG_OILS", "SOYBEANS", "SUGAR", "COFFEE", "COCOA", "ALUMINIUM", "NICKEL"];

runTest("provider none symbols are absent from YAHOO_TICKERS and 404", () => {
  assert.equal(NO_PRICE_SYMBOLS.size, NEWS_ONLY_SYMBOLS.length);
  for (const symbol of NEWS_ONLY_SYMBOLS) {
    assert.equal(symbol in YAHOO_TICKERS, false);
    assert.deepStrictEqual(newsOnlyHistoryRejection(symbol), { error: "no_price_data", symbol });
  }
  assert.equal(newsOnlyHistoryRejection("USOIL"), null);
  assert.equal(newsOnlyHistoryRejection("EURUSD"), null);
});
