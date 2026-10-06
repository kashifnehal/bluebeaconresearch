import assert from "node:assert/strict";
import type { getSupabaseAdmin } from "../clients/supabase.js";
import {
  collectPendingPairs,
  fetchExistingOutcomeAssets,
  runOutcomeTrackerOnce,
} from "./outcome-tracker.js";

type Admin = ReturnType<typeof getSupabaseAdmin>;

const HOUR = 3_600_000;

function runTest(name: string, fn: () => Promise<void> | void) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`✔ ${name}`);
    })
    .catch((err: unknown) => {
      console.error(`✖ ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

function pairList(
  pairsByAsset: Map<string, Array<{ impact: { asset: string }; checkpointHours: number }>>,
) {
  return [...pairsByAsset.values()].flat();
}

await runTest("collectPendingPairs skips pairs already present and checkpoints not yet reached", () => {
  const nowMs = Date.parse("2026-09-20T12:00:00.000Z");
  const signal = {
    id: "sig-partial",
    event_date: "2026-09-20T10:00:00.000Z",
    commodity_impacts: [
      { asset: "USOIL", direction: "up" as const },
      { asset: "COPPER", direction: "down" as const },
    ],
  };
  const existing = new Map<string, Set<string>>([["sig-partial", new Set(["USOIL::1"])]]);
  const { pairsByAsset, signalsProcessed } = collectPendingPairs([signal], existing, nowMs);
  const pairs = pairList(pairsByAsset);
  assert.equal(signalsProcessed, 1);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].impact.asset, "COPPER");
  assert.equal(pairs[0].checkpointHours, 1);
  assert.equal(nowMs - Date.parse(signal.event_date), 2 * HOUR);
});

await runTest("a signal created after 2026-09-13 with no outcomes yields all its pairs", () => {
  const signal = {
    id: "sig-after-freeze",
    event_date: "2026-09-14T00:00:00.000Z",
    commodity_impacts: [{ asset: "USOIL", direction: "up" as const }],
  };
  const nowMs = Date.parse("2026-10-06T05:00:00.000Z");
  const { pairsByAsset, signalsProcessed } = collectPendingPairs([signal], new Map(), nowMs);
  const pairs = pairsByAsset.get("USOIL") ?? [];
  assert.equal(signalsProcessed, 1);
  assert.deepEqual(
    pairs.map((pair) => pair.checkpointHours),
    [1, 4, 24, 48],
  );
  assert.equal(pairs.length, 4);
});

await runTest("fetchExistingOutcomeAssets keeps rows past the 1,000-row page", async () => {
  const rows = Array.from({ length: 1020 }, (_, i) => ({
    id: `row-${i}`,
    signal_id: `sig-${i}`,
    asset: "USOIL",
    checkpoint_hours: 1,
  }));
  const ranges: Array<[number, number]> = [];
  const orders: string[] = [];
  const client = {
    from(table: string) {
      if (table !== "signal_outcomes") throw new Error(`unexpected table ${table}`);
      const api = {
        select() {
          return api;
        },
        in() {
          return api;
        },
        order(column: string) {
          orders.push(column);
          return api;
        },
        range(from: number, to: number) {
          ranges.push([from, to]);
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
      };
      return api;
    },
  };

  const bySignal = await fetchExistingOutcomeAssets(client as never as Admin, ["sig-0"]);
  let kept = 0;
  for (const keys of bySignal.values()) kept += keys.size;
  assert.equal(kept, 1020);
  assert.equal(bySignal.size, 1020);
  assert.deepEqual(ranges, [
    [0, 999],
    [1000, 1999],
  ]);
  assert.deepEqual(orders, ["id", "id"]);
});

await runTest("outcome writes use upsert with ignoreDuplicates", async () => {
  const eventMs = Date.now() - 72 * HOUR;
  const eventDate = new Date(eventMs).toISOString();
  const prices = Array.from({ length: 49 }, (_, hour) => ({
    price: 80 + hour,
    fetched_at: new Date(eventMs + hour * HOUR).toISOString(),
  }));
  const upserts: Array<{ rows: unknown; options: unknown }> = [];
  let insertCalled = false;

  const client = {
    from(table: string) {
      const api = {
        select() {
          return api;
        },
        lte() {
          return api;
        },
        eq() {
          return api;
        },
        in() {
          return api;
        },
        order() {
          return api;
        },
        range(from: number) {
          if (table === "signals" && from === 0) {
            return Promise.resolve({
              data: [
                {
                  id: "sig-write",
                  event_date: eventDate,
                  commodity_impacts: [{ asset: "USOIL", direction: "up", confidence: 0.7 }],
                },
              ],
              error: null,
            });
          }
          if (table === "commodity_prices" && from === 0) {
            return Promise.resolve({ data: prices, error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
        insert() {
          insertCalled = true;
          return Promise.resolve({ error: null });
        },
        upsert(rows: unknown, options: unknown) {
          upserts.push({ rows, options });
          return Promise.resolve({ error: null });
        },
      };
      return api;
    },
  };

  const result = await runOutcomeTrackerOnce(client as never as Admin);
  assert.equal(insertCalled, false);
  assert.equal(upserts.length, 1);
  assert.deepEqual(upserts[0].options, {
    onConflict: "signal_id,asset,checkpoint_hours",
    ignoreDuplicates: true,
  });
  assert.equal(Array.isArray(upserts[0].rows), true);
  assert.equal((upserts[0].rows as unknown[]).length, 4);
  assert.equal(result.outcomesWritten, 4);
  assert.equal(result.signalsProcessed, 1);
});
