import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMMODITY_SYMBOLS, FOREX_SYMBOLS } from "../workers/price-syncer.js";
import { ALLOWED_COMMODITY_ASSETS, COMMODITY_ASSET_ALIASES } from "../services/claude.service.js";
import { TRACKED_COMMODITY_NAMES } from "./relevance-filter.js";
import { YAHOO_TICKERS } from "../routes/price-history.js";

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

// Frozen copy of the five per-asset lists from before the commodity-registry
// refactor (W-REGISTRY). If any of them drift from this fixture, something
// changed asset behavior (a ticker, an alias, a filter anchor) that the
// refactor was explicitly not supposed to touch.
const frozen = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "./commodity-registry-parity.fixture.json"), "utf-8"),
);

/** Order-independent equality for arrays of strings; deep equality otherwise. */
function assertSameContent(actual: unknown, expected: unknown, label: string) {
  const normalize = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      if (v.every((x) => typeof x === "string")) return [...v].sort();
      return v.map(normalize);
    }
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, normalize(val)]));
    }
    return v;
  };
  assert.deepStrictEqual(normalize(actual), normalize(expected), `${label} drifted from the frozen pre-registry snapshot`);
}

runTest("COMMODITY_SYMBOLS matches the pre-registry snapshot", () => {
  assertSameContent(COMMODITY_SYMBOLS, frozen.COMMODITY_SYMBOLS, "COMMODITY_SYMBOLS");
});

runTest("FOREX_SYMBOLS matches the pre-registry snapshot", () => {
  assertSameContent(FOREX_SYMBOLS, frozen.FOREX_SYMBOLS, "FOREX_SYMBOLS");
});

runTest("ALLOWED_COMMODITY_ASSETS matches the pre-registry snapshot", () => {
  assertSameContent([...ALLOWED_COMMODITY_ASSETS], frozen.ALLOWED_COMMODITY_ASSETS, "ALLOWED_COMMODITY_ASSETS");
});

runTest("COMMODITY_ASSET_ALIASES matches the pre-registry snapshot", () => {
  assertSameContent(COMMODITY_ASSET_ALIASES, frozen.COMMODITY_ASSET_ALIASES, "COMMODITY_ASSET_ALIASES");
});

runTest("TRACKED_COMMODITY_NAMES matches the pre-registry snapshot", () => {
  assertSameContent(TRACKED_COMMODITY_NAMES, frozen.TRACKED_COMMODITY_NAMES, "TRACKED_COMMODITY_NAMES");
});

runTest("YAHOO_TICKERS matches the pre-registry snapshot", () => {
  assertSameContent(YAHOO_TICKERS, frozen.YAHOO_TICKERS, "YAHOO_TICKERS");
});
