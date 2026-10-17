import assert from "node:assert/strict";
import {
  barWidthPct,
  biggestMover,
  buildLedgerRows,
  maxPulseCount,
  resolveLedgerSymbols,
  runWithConcurrency,
} from "./desk-ledger";

function runTest(name: string, fn: () => void | Promise<void>) {
  Promise.resolve()
    .then(fn)
    .then(() => console.log(`✔ ${name}`))
    .catch((err) => {
      console.error(`✖ ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

runTest("runWithConcurrency never exceeds the limit and keeps order", async () => {
  let inFlight = 0;
  let peak = 0;
  const out = await runWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8, 9], 4, async (n) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight -= 1;
    return n * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14, 16, 18]);
  assert.equal(peak, 4);
});

runTest("runWithConcurrency handles empty input", async () => {
  assert.deepEqual(await runWithConcurrency([], 4, async (x: number) => x), []);
});

runTest("resolveLedgerSymbols prefers server, then stored, then default; drops unknown and dupes", () => {
  assert.deepEqual(resolveLedgerSymbols(["USOIL", "USOIL", "NOPE"], ["GOLD"]), ["USOIL"]);
  assert.deepEqual(resolveLedgerSymbols([], ["WHEAT"]), ["WHEAT"]);
  assert.ok(resolveLedgerSymbols(null, null).length > 0);
});

runTest("buildLedgerRows leaves missing price/pulse as null, never zero", () => {
  const rows = buildLedgerRows(
    ["USOIL", "WHEAT"],
    [{ symbol: "USOIL", price: 70.5, change_pct_24h: -1.2 }],
    { USOIL: { last24h: 4, prior24h: 2 } },
  );
  assert.equal(rows[0].price, 70.5);
  assert.equal(rows[0].changePct, -1.2);
  assert.deepEqual(rows[0].pulse, { last24h: 4, prior24h: 2 });
  assert.equal(rows[1].price, null);
  assert.equal(rows[1].changePct, null);
  assert.equal(rows[1].pulse, null);
  assert.equal(rows[0].label, "WTI Crude");
});

runTest("biggestMover uses absolute change and ignores rows without one", () => {
  const rows = buildLedgerRows(
    ["USOIL", "WHEAT", "NGAS"],
    [
      { symbol: "USOIL", price: 1, change_pct_24h: 1.1 },
      { symbol: "WHEAT", price: 1, change_pct_24h: -2.4 },
    ],
    {},
  );
  assert.equal(biggestMover(rows)?.symbol, "WHEAT");
  assert.equal(biggestMover([]), null);
});

runTest("bar helpers scale to the largest count and keep zero at zero", () => {
  const rows = buildLedgerRows(["USOIL", "WHEAT"], [], {
    USOIL: { last24h: 10, prior24h: 5 },
    WHEAT: { last24h: 0, prior24h: 2 },
  });
  const max = maxPulseCount(rows);
  assert.equal(max, 10);
  assert.equal(barWidthPct(10, max), 100);
  assert.equal(barWidthPct(5, max), 50);
  assert.equal(barWidthPct(0, max), 0);
  assert.equal(barWidthPct(3, 0), 0);
});
