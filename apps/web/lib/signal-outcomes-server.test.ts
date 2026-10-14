import assert from "node:assert/strict";

import {
  MARKET_IMPACT_CHECKPOINT_HOURS,
  computeMarketImpactCheckpoints,
  computeMarketImpactMagnitude,
  type SignalOutcomeRow,
} from "./market-impact-assessment";
import { fetchSignalOutcomeRows, type OutcomeRowsObservation } from "./signal-outcomes-server";
import type { RouteSupabaseClients } from "./supabase-server";

function runTest(name: string, fn: () => Promise<void> | void) {
  return (async () => {
    try {
      await fn();
      console.log(`✔ ${name}`);
    } catch (err) {
      console.error(`✖ ${name}`);
      console.error(err);
      process.exitCode = 1;
    }
  })();
}

type RawRow = {
  asset: string;
  checkpoint_hours: number;
  actual_pct_change: number | null;
  signals: { event_date: string | null } | { event_date: string | null }[] | null;
};

type RangeCall = { from: number; to: number };

function makeOutcomeClient(
  rows: RawRow[],
  opts?: { failFrom?: number },
) {
  const rangeCalls: RangeCall[] = [];
  const orderCalls: Array<{ column: string; ascending: boolean | undefined }> = [];
  let countCalls = 0;
  let openRemaining = 0;
  let maxOpenRemaining = 0;

  function chain() {
    let head = false;
    const api = {
      select(_columns: string, options?: { head?: boolean }) {
        head = options?.head === true;
        return api;
      },
      in() {
        return api;
      },
      not() {
        if (head) {
          countCalls += 1;
          return Promise.resolve({ count: rows.length, data: null, error: null });
        }
        return api;
      },
      order(column: string, options?: { ascending?: boolean }) {
        orderCalls.push({ column, ascending: options?.ascending });
        return api;
      },
      range(from: number, to: number) {
        rangeCalls.push({ from, to });
        if (opts?.failFrom === from) {
          return Promise.resolve({ data: null, error: { message: "boom" } });
        }
        const data = rows.slice(from, to + 1);
        if (from > 0) {
          openRemaining += 1;
          maxOpenRemaining = Math.max(maxOpenRemaining, openRemaining);
          return Promise.resolve({ data, error: null }).then((value) => {
            openRemaining -= 1;
            return value;
          });
        }
        return Promise.resolve({ data, error: null });
      },
    };
    return api;
  }

  return {
    client: { from: () => chain() } as unknown as RouteSupabaseClients["supabase"],
    rangeCalls,
    orderCalls,
    get countCalls() {
      return countCalls;
    },
    get maxOpenRemaining() {
      return maxOpenRemaining;
    },
  };
}

function rowsWithPct(n: number, asset: string): RawRow[] {
  return Array.from({ length: n }, (_, index) => ({
    asset,
    checkpoint_hours: 24,
    actual_pct_change: index + 1,
    signals: { event_date: "2026-01-01T00:00:00Z" },
  }));
}

function mapFixture(row: RawRow): SignalOutcomeRow {
  const signals = row.signals;
  const embedded = !signals ? null : Array.isArray(signals) ? signals[0] : signals;
  return {
    asset: row.asset,
    checkpoint_hours: row.checkpoint_hours,
    actual_pct_change: row.actual_pct_change,
    eventDate: embedded?.event_date ?? null,
  };
}

async function main() {
  await runTest(
    "2,500 rows return all 2,500 once, in id order, with no duplicates",
    async () => {
      const fake = makeOutcomeClient(rowsWithPct(2500, "ROWS2500"));
      const fetched = await fetchSignalOutcomeRows(fake.client, ["ROWS2500"]);
      const values = fetched.map((row) => row.actual_pct_change);

      assert.equal(fetched.length, 2500);
      assert.deepEqual(values, Array.from({ length: 2500 }, (_, index) => index + 1));
      assert.equal(new Set(values).size, 2500);
      assert.deepEqual(
        fake.rangeCalls,
        [
          { from: 0, to: 999 },
          { from: 1000, to: 1999 },
          { from: 2000, to: 2999 },
        ],
      );
      assert.equal(fake.countCalls, 1);
      assert.ok(fake.maxOpenRemaining >= 2);
      assert.ok(fake.orderCalls.every((call) => call.column === "id" && call.ascending === true));
    },
  );

  await runTest(
    "a failed page returns the rows collected before it and is not cached",
    async () => {
      const fake = makeOutcomeClient(rowsWithPct(2500, "FAILPAGE"), { failFrom: 1000 });
      const first = await fetchSignalOutcomeRows(fake.client, ["FAILPAGE"]);
      assert.deepEqual(
        first.map((row) => row.actual_pct_change),
        Array.from({ length: 1000 }, (_, index) => index + 1),
      );
      const callsAfterFirst = fake.rangeCalls.length + fake.countCalls;

      const second = await fetchSignalOutcomeRows(fake.client, ["FAILPAGE"]);
      assert.equal(second.length, 1000);
      assert.ok(fake.rangeCalls.length + fake.countCalls > callsAfterFirst);
    },
  );

  await runTest("a second call within the time-to-live does not call the client again", async () => {
    const fake = makeOutcomeClient(rowsWithPct(3, "TTL_A").concat(rowsWithPct(2, "TTL_B")));
    const firstWatch: OutcomeRowsObservation = { cacheStatus: "hit" };
    const first = await fetchSignalOutcomeRows(fake.client, ["TTL_B", "TTL_A"], firstWatch);
    const callsAfterFirst = fake.rangeCalls.length + fake.countCalls;
    assert.equal(first.length, 5);
    assert.equal(firstWatch.cacheStatus, "miss");

    const secondWatch: OutcomeRowsObservation = { cacheStatus: "miss" };
    const second = await fetchSignalOutcomeRows(fake.client, ["TTL_A", "TTL_B"], secondWatch);
    assert.equal(fake.rangeCalls.length + fake.countCalls, callsAfterFirst);
    assert.deepEqual(second, first);
    assert.equal(secondWatch.cacheStatus, "hit");
  });

  await runTest("two simultaneous calls share one read", async () => {
    const fake = makeOutcomeClient(rowsWithPct(2500, "SHARE"));
    const leftWatch: OutcomeRowsObservation = { cacheStatus: "hit" };
    const rightWatch: OutcomeRowsObservation = { cacheStatus: "hit" };
    const [first, second] = await Promise.all([
      fetchSignalOutcomeRows(fake.client, ["SHARE"], leftWatch),
      fetchSignalOutcomeRows(fake.client, ["SHARE"], rightWatch),
    ]);

    assert.equal(first.length, 2500);
    assert.deepEqual(second, first);
    assert.deepEqual([leftWatch.cacheStatus, rightWatch.cacheStatus].sort(), ["inflight", "miss"]);
    assert.equal(fake.rangeCalls.length, 3);
    assert.equal(fake.countCalls, 1);
  });

  await runTest(
    "a fixed fixture gives the same magnitude and checkpoints before and after the paged read",
    async () => {
      const checkpoints = [1, 4, 24, 48];
      const raw: RawRow[] = Array.from({ length: 1500 }, (_, index) => ({
        asset: index % 7 === 0 ? "WHEAT" : "USOIL",
        checkpoint_hours: checkpoints[index % 4],
        actual_pct_change: index % 11 === 0 ? 0 : ((index % 40) - 20) * 0.1,
        signals:
          index % 2 === 0
            ? { event_date: "2026-03-01T00:00:00Z" }
            : [{ event_date: "2026-03-02T00:00:00Z" }],
      }));
      const before = raw.map(mapFixture);
      const fake = makeOutcomeClient(raw);
      const fetched = await fetchSignalOutcomeRows(fake.client, ["USOIL", "WHEAT"]);

      assert.equal(fetched.length, before.length);
      for (const asset of ["USOIL", "WHEAT"]) {
        const beforeMagnitude = computeMarketImpactMagnitude(
          before,
          asset,
          MARKET_IMPACT_CHECKPOINT_HOURS,
        );
        const beforeCheckpoints = computeMarketImpactCheckpoints(before, asset);
        assert.ok(beforeMagnitude);
        assert.ok(beforeCheckpoints.length > 0);
        assert.deepEqual(
          computeMarketImpactMagnitude(fetched, asset, MARKET_IMPACT_CHECKPOINT_HOURS),
          beforeMagnitude,
        );
        assert.deepEqual(computeMarketImpactCheckpoints(fetched, asset), beforeCheckpoints);
      }
    },
  );
}

void main();
