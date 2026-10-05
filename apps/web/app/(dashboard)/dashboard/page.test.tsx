import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { signalPriceMovePct, SignalRowPriceChip } from "./page";
import type { Signal } from "@blue-beacon-research/shared";

function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

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

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    commodityImpacts: [{ asset: "WTI", direction: "up", confidence: 0.8 }],
    currencyPairImpacts: [],
    ...overrides,
  } as unknown as Signal;
}

runTest("signalPriceMovePct returns null when no asset is associated", () => {
  const move = signalPriceMovePct(signal({ commodityImpacts: [], currencyPairImpacts: [] }), [
    { symbol: "WTI", change_pct_24h: 1.2 },
  ]);
  assert.equal(move, null);
});

runTest("signalPriceMovePct returns null when the price row has no 24h change (never fabricates 0)", () => {
  const move = signalPriceMovePct(signal(), [{ symbol: "WTI" }]);
  assert.equal(move, null);
});

runTest("signalPriceMovePct returns the real pct when present", () => {
  const move = signalPriceMovePct(signal(), [{ symbol: "WTI", change_pct_24h: -2.5 }]);
  assert.deepEqual(move, { asset: "WTI", pct: -2.5 });
});

runTest("SignalRowPriceChip shows an em dash with no associated price", () => {
  const html = renderToStaticMarkup(
    createElement(SignalRowPriceChip, {
      signal: signal({ commodityImpacts: [], currencyPairImpacts: [] }),
      prices: [],
    }),
  );
  assert.equal(visibleText(html), "—");
});

runTest("SignalRowPriceChip shows plain asset/24h/pct text with no hover-only content", () => {
  const html = renderToStaticMarkup(
    createElement(SignalRowPriceChip, {
      signal: signal(),
      prices: [{ symbol: "WTI", change_pct_24h: 3.4 }],
    }),
  );
  assert.equal(visibleText(html), "WTI 24h +3.4%");
  assert.equal(/title=/.test(html), false);
});
