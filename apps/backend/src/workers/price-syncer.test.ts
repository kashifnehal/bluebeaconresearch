import assert from "node:assert/strict";

// Discard port — refused instantly, so recordServiceHealth's own (un-injected)
// getSupabaseAdmin() call fails fast and is swallowed rather than hanging or
// making a real network call.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

import { FOREX_SYMBOLS, runPriceSyncOnce } from "./price-syncer.js";

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => console.log(`✔ ${name}`));
    }
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

runTest("FOREX_SYMBOLS maps USDINR to the verified USDINR=X Yahoo symbol", () => {
  assert.equal(FOREX_SYMBOLS.USDINR, "USDINR=X");
});

runTest("FOREX_SYMBOLS has no duplicate Yahoo symbol values", () => {
  const values = Object.values(FOREX_SYMBOLS);
  assert.equal(new Set(values).size, values.length);
});

const fakeQuote = async () => ({
  regularMarketPrice: 100,
  regularMarketChange: 1,
  regularMarketChangePercent: 1,
  regularMarketDayHigh: 101,
  regularMarketDayLow: 99,
});

function fakeSupabase(insertImpl: (rows: any[]) => Promise<{ error: { message: string } | null }>) {
  return {
    from(_table: string) {
      return { insert: insertImpl };
    },
  };
}

function okInsert() {
  return async () => ({ error: null });
}

function failingInsert(message = "db insert failed") {
  return async () => ({ error: { message } });
}

// Mirrors real Redis LTRIM semantics (including negative start/stop) closely
// enough for the outbox's own usage (RPUSH + LTRIM -500 -1, LPOP/LPUSH).
function fakeRedis() {
  let list: string[] = [];
  return {
    list: () => list,
    async set(_key: string, _value: string, _exFlag: "EX", _seconds: number) {
      return "OK" as const;
    },
    async rpush(_key: string, value: string) {
      list.push(value);
      return list.length;
    },
    async lpush(_key: string, value: string) {
      list.unshift(value);
      return list.length;
    },
    async lpop(_key: string, count: number) {
      if (list.length === 0) return null;
      const popped = list.slice(0, count);
      list = list.slice(count);
      return popped;
    },
    async ltrim(_key: string, start: number, stop: number) {
      const len = list.length;
      const s = start < 0 ? Math.max(0, len + start) : start;
      const e = stop < 0 ? len + stop : stop;
      list = list.slice(s, e + 1);
      return "OK" as const;
    },
    async expire(_key: string, _seconds: number) {
      return 1;
    },
  };
}

function throwingRedis() {
  const err = new Error("redis down");
  return {
    async set() {
      throw err;
    },
    async rpush() {
      throw err;
    },
    async lpush() {
      throw err;
    },
    async lpop() {
      throw err;
    },
    async ltrim() {
      throw err;
    },
    async expire() {
      throw err;
    },
  };
}

async function main() {
  await runTest("a failed insert queues the batch to the Redis outbox", async () => {
    const redis = fakeRedis();
    const supabase = fakeSupabase(failingInsert("connection refused"));
    const result = await runPriceSyncOnce({ supabase, redis, fetchQuote: fakeQuote });
    assert.equal(result.ok, true); // quotes were fetched even though the insert failed
    assert.equal(redis.list().length, 1);
    const batch = JSON.parse(redis.list()[0]!);
    assert.ok(Array.isArray(batch) && batch.length > 0);
    assert.equal(typeof batch[0].symbol, "string");
    assert.equal(batch[0].price, 100);
  });

  await runTest("a later good run replays a previously queued batch", async () => {
    const redis = fakeRedis();
    const failingSupabase = fakeSupabase(failingInsert("connection refused"));
    await runPriceSyncOnce({ supabase: failingSupabase, redis, fetchQuote: fakeQuote });
    assert.equal(redis.list().length, 1);

    const replayedBatches: any[][] = [];
    let callCount = 0;
    const goodSupabase = fakeSupabase(async (rows: any[]) => {
      callCount += 1;
      replayedBatches.push(rows);
      return { error: null };
    });
    await runPriceSyncOnce({ supabase: goodSupabase, redis, fetchQuote: fakeQuote });

    // 1st call is this run's own fresh insert, 2nd call is the replayed outbox batch.
    assert.equal(callCount, 2);
    assert.equal(redis.list().length, 0);
  });

  await runTest("a failed replay requeues the batch and stops draining", async () => {
    const redis = fakeRedis();
    const failingSupabase = fakeSupabase(failingInsert("connection refused"));
    await runPriceSyncOnce({ supabase: failingSupabase, redis, fetchQuote: fakeQuote });
    assert.equal(redis.list().length, 1);

    let calls = 0;
    const mixedSupabase = fakeSupabase(async (rows: any[]) => {
      calls += 1;
      // 1st call: this run's own fresh insert succeeds. 2nd call: the replay fails.
      if (calls === 1) return { error: null };
      return { error: { message: "still down" } };
    });
    await runPriceSyncOnce({ supabase: mixedSupabase, redis, fetchQuote: fakeQuote });

    assert.equal(calls, 2);
    assert.equal(redis.list().length, 1); // requeued, not lost
  });

  await runTest("the outbox never grows past 500 batches", async () => {
    const redis = fakeRedis();
    const failingSupabase = fakeSupabase(failingInsert("connection refused"));
    for (let i = 0; i < 505; i++) {
      await runPriceSyncOnce({ supabase: failingSupabase, redis, fetchQuote: fakeQuote });
    }
    assert.equal(redis.list().length, 500);
  });

  await runTest("Redis being down never throws — on a failed insert", async () => {
    const supabase = fakeSupabase(failingInsert("connection refused"));
    await assert.doesNotReject(
      runPriceSyncOnce({ supabase, redis: throwingRedis() as any, fetchQuote: fakeQuote }),
    );
  });

  await runTest("Redis being down never throws — on a successful insert (drain skipped)", async () => {
    const supabase = fakeSupabase(okInsert());
    await assert.doesNotReject(
      runPriceSyncOnce({ supabase, redis: throwingRedis() as any, fetchQuote: fakeQuote }),
    );
  });

  await runTest("no Redis configured (null) never throws and skips outbox entirely", async () => {
    const supabase = fakeSupabase(failingInsert("connection refused"));
    const result = await runPriceSyncOnce({ supabase, redis: null, fetchQuote: fakeQuote });
    assert.equal(result.ok, true);
  });
}

main();
