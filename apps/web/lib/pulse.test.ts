import assert from "node:assert/strict";
import { computePulse, type PulseImpact, type PulseSignalRow } from "./pulse";

const now = new Date("2026-10-15T12:00:00.000Z");

function row(
  createdAt: string,
  commodity: PulseImpact[] | null = [],
  currency: PulseImpact[] | null = [],
): PulseSignalRow {
  return {
    created_at: createdAt,
    commodity_impacts: commodity,
    currency_pair_impacts: currency,
  };
}

const empty = computePulse([], "USOIL", now);
assert.deepEqual(empty, {
  last24h: 0,
  prior24h: 0,
  changePct: null,
  peakHourUtc: null,
  peakHourCount: 0,
  up: 0,
  down: 0,
  other: 0,
});

{
  const priorZero = computePulse(
    [row("2026-10-15T03:00:00.000Z", [{ asset: "USOIL", direction: "up" }])],
    "USOIL",
    now,
  );
  assert.equal(priorZero.last24h, 1);
  assert.equal(priorZero.prior24h, 0);
  assert.equal(priorZero.changePct, null);
  assert.equal(priorZero.peakHourUtc, 3);
  assert.equal(priorZero.up, 1);
  assert.equal(priorZero.down, 0);
  assert.equal(priorZero.other, 0);
}

{
  const tie = computePulse(
    [
      row("2026-10-15T10:00:00.000Z", [{ asset: "USOIL", direction: "up" }]),
      row("2026-10-15T10:30:00.000Z", [{ asset: "USOIL", direction: "down" }]),
      row("2026-10-15T08:00:00.000Z", [{ asset: "USOIL", direction: "up" }]),
      row("2026-10-15T08:15:00.000Z", [{ asset: "USOIL", direction: "volatile" }]),
      row("2026-10-14T18:00:00.000Z", [{ asset: "USOIL", direction: "down" }]),
    ],
    "USOIL",
    now,
  );
  assert.equal(tie.last24h, 5);
  assert.equal(tie.peakHourUtc, 8, "a tie keeps the earlier UTC hour");
  assert.equal(tie.peakHourCount, 2);
}

{
  const fx = computePulse(
    [
      row(
        "2026-10-15T06:00:00.000Z",
        [{ asset: "EURUSD", direction: "down" }],
        [
          { asset: "GBPUSD", direction: "down" },
          { asset: "EURUSD", direction: "up" },
        ],
      ),
    ],
    "EURUSD",
    now,
  );
  assert.equal(fx.last24h, 1);
  assert.equal(fx.up, 1);
  assert.equal(fx.down, 0);
  assert.equal(fx.other, 0);
}

{
  const ignored = computePulse(
    [
      row("2026-10-15T06:00:00.000Z", [
        { asset: "UKOIL", direction: "up" },
        { asset: "USOIL", direction: "down" },
      ]),
      row("2026-10-14T06:00:00.000Z", [{ asset: "USOIL", direction: "up" }]),
    ],
    "USOIL",
    now,
  );
  assert.equal(ignored.last24h, 1);
  assert.equal(ignored.prior24h, 1);
  assert.equal(ignored.changePct, 0);
  assert.equal(ignored.up, 0);
  assert.equal(ignored.down, 1);
  assert.equal(ignored.other, 0);
  assert.equal(ignored.peakHourUtc, 6);
}

{
  const windows = computePulse(
    [
      row("2026-10-14T12:00:00.000Z", [{ asset: "USOIL", direction: "up" }]),
      row("2026-10-14T11:59:00.000Z", [{ asset: "USOIL", direction: "down" }]),
      row("2026-10-13T12:00:00.000Z", [{ asset: "USOIL", direction: "down" }]),
      row("2026-10-13T11:59:00.000Z", [{ asset: "USOIL", direction: "up" }]),
    ],
    "USOIL",
    now,
  );
  assert.equal(windows.last24h, 1);
  assert.equal(windows.prior24h, 2);
  assert.equal(windows.changePct, -50);
  assert.equal(windows.up, 1);
  assert.equal(windows.down, 0);
}

{
  const allNull = computePulse([], null, now);
  assert.equal(allNull.last24h, 0);
  assert.equal(allNull.up, 0);
}

{
  // All-assets mode: one vote per distinct asset per signal, across both
  // columns, and the row with no impacts still counts toward last24h but
  // contributes no direction vote.
  const all = computePulse(
    [
      row("2026-10-15T06:00:00.000Z", [
        { asset: "UKOIL", direction: "up" },
        { asset: "USOIL", direction: "down" },
      ]),
      row(
        "2026-10-15T07:00:00.000Z",
        [{ asset: "EURUSD", direction: "down" }],
        [{ asset: "EURUSD", direction: "down" }, { asset: "GBPUSD", direction: "up" }],
      ),
      row("2026-10-15T08:00:00.000Z", [], []),
    ],
    null,
    now,
  );
  assert.equal(all.last24h, 3);
  // UKOIL up, USOIL down, EURUSD down (counted once despite both columns), GBPUSD up.
  assert.equal(all.up, 2);
  assert.equal(all.down, 2);
  assert.equal(all.other, 0);
}

console.log("pulse.test.ts ok");
