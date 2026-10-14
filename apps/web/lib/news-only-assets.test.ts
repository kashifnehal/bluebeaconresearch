import assert from "node:assert/strict";

import { KNOWN_WATCHLIST, NEWS_ONLY_SYMBOLS, followMarketOptions, parseNewsOnlyCardSignals } from "./news-only-assets";

const SEVEN = ["VEG_OILS", "SOYBEANS", "SUGAR", "COFFEE", "COCOA", "ALUMINIUM", "NICKEL"];

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

runTest("KNOWN_WATCHLIST includes the seven news-only symbols", () => {
  assert.deepEqual([...NEWS_ONLY_SYMBOLS], SEVEN);
  for (const symbol of SEVEN) {
    assert.equal(KNOWN_WATCHLIST.has(symbol), true);
  }
  assert.equal(KNOWN_WATCHLIST.has("USOIL"), true);
  assert.equal(KNOWN_WATCHLIST.has("NOT_A_SYMBOL"), false);
});

runTest("follow market options label news-only assets and keep them selectable", () => {
  const options = followMarketOptions();
  for (const symbol of SEVEN) {
    const row = options.find((o) => o.symbol === symbol);
    assert.ok(row, symbol);
    assert.match(row.label, /\(news only\)$/);
  }
  const usoil = options.find((o) => o.symbol === "USOIL");
  assert.ok(usoil);
  assert.equal(usoil.label.includes("(news only)"), false);
});

runTest("parseNewsOnlyCardSignals reads total and the latest headline", () => {
  const parsed = parseNewsOnlyCardSignals({
    total: 4,
    signals: [{ title: "Sugar exports paused", eventDate: "2026-10-13T00:00:00.000Z" }],
  });
  assert.equal(parsed.count, 4);
  assert.equal(parsed.headline, "Sugar exports paused");
  assert.equal(parsed.headlineAt, "2026-10-13T00:00:00.000Z");
});

runTest("parseNewsOnlyCardSignals leaves the count null when total is missing", () => {
  const parsed = parseNewsOnlyCardSignals({
    signals: [{ title: "Nickel output cut", createdAt: "2026-10-12T00:00:00.000Z" }],
  });
  assert.equal(parsed.count, null);
  assert.equal(parsed.headline, "Nickel output cut");
  assert.equal(parsed.headlineAt, "2026-10-12T00:00:00.000Z");
});
