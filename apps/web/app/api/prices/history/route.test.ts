import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { bucketLastPrice, handleHistoryGet as GET, type PricesHistoryDeps } from "./route";

function runTest(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`✔ ${name}`);
    })
    .catch((err) => {
      console.error(`✖ ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

function req(query: string) {
  return new NextRequest(`https://app.example.com/api/prices/history?${query}`);
}

type Row = { price: number; fetched_at: string };

function fakeDb(pages: Row[][]) {
  const calls: { eq: string[]; gte: string[]; order: unknown[]; range: [number, number][] } = {
    eq: [],
    gte: [],
    order: [],
    range: [],
  };
  let pageIndex = 0;
  const supabase = {
    from() {
      return {
        select() {
          return this;
        },
        eq(_col: string, val: string) {
          calls.eq.push(val);
          return this;
        },
        gte(_col: string, val: string) {
          calls.gte.push(val);
          return this;
        },
        order(...args: unknown[]) {
          calls.order.push(args);
          return this;
        },
        limit() {
          const data = pages[0] ?? [];
          return Promise.resolve({ data, error: null });
        },
        range(from: number, to: number) {
          calls.range.push([from, to]);
          const data = pages[pageIndex] ?? [];
          pageIndex += 1;
          return Promise.resolve({ data, error: null });
        },
      };
    },
  };
  return { supabase, calls };
}

function errorDb() {
  const supabase = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        gte() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return Promise.resolve({ data: null, error: { message: "boom" } });
        },
        range() {
          return Promise.resolve({ data: null, error: { message: "boom" } });
        },
      };
    },
  };
  return supabase;
}

function deps(
  overrides: Partial<PricesHistoryDeps> & { user?: { id: string } | null; supabase?: unknown } = {},
): PricesHistoryDeps {
  const { user = { id: "u1" }, supabase = fakeDb([[]]).supabase, ...rest } = overrides;
  return {
    rateLimitOrPass: async () => ({ success: true }),
    getRouteSupabaseClients: async () => ({
      supabase: supabase as never,
      supabaseAuth: supabase as never,
      user: user as never,
    }),
    ...rest,
  };
}

function setNodeEnv(value: string | undefined) {
  Object.assign(process.env, { NODE_ENV: value });
}

async function main() {
  const prevEnv = process.env.NODE_ENV;

  await runTest("no user in production returns 401 unauthenticated", async () => {
    setNodeEnv("production");
    const res = await GET(req("symbol=USOIL"), deps({ user: null }));
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.error.code, "unauthenticated");
    assert.deepEqual(json.points, []);
  });

  await runTest("authenticated user queries with eq symbol, gte cutoff, ascending order, and pages until a short page", async () => {
    setNodeEnv("production");
    const { supabase, calls } = fakeDb([
      Array.from({ length: 3 }, (_, i) => ({ price: i, fetched_at: `2026-10-0${i + 1}T00:00:00Z` })),
    ]);
    const res = await GET(req("symbol=USOIL&days=30"), deps({ supabase, user: { id: "u1" } }));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.points.length, 3);
    assert.deepEqual(calls.eq, ["USOIL"]);
    assert.equal(calls.gte.length, 1);
    assert.deepEqual(calls.order[0], ["fetched_at", { ascending: true }]);
    assert.equal(calls.range.length, 1);
  });

  await runTest("database error returns 502, not an empty 200", async () => {
    setNodeEnv("production");
    const res = await GET(req("symbol=USOIL&days=30"), deps({ supabase: errorDb(), user: { id: "u1" } }));
    assert.equal(res.status, 502);
    const json = await res.json();
    assert.equal(json.error.code, "db_error");
    assert.deepEqual(json.points, []);
  });

  await runTest("rate limited returns 429", async () => {
    const res = await GET(
      req("symbol=USOIL"),
      deps({ rateLimitOrPass: async () => ({ success: false }) }),
    );
    assert.equal(res.status, 429);
    const json = await res.json();
    assert.equal(json.error.code, "rate_limited");
  });

  await runTest("bucketLastPrice keeps the last price in each bucket and skips empty ones", () => {
    const cutoffMs = 1_000_000;
    const nowMs = 1_004_000;
    const rows: Row[] = [
      { price: 10, fetched_at: new Date(1_000_100).toISOString() },
      { price: 11, fetched_at: new Date(1_000_500).toISOString() },
      { price: 20, fetched_at: new Date(1_002_000).toISOString() },
      { price: 21, fetched_at: new Date(1_002_500).toISOString() },
      { price: 30, fetched_at: new Date(1_003_999).toISOString() },
      { price: 31, fetched_at: new Date(nowMs).toISOString() },
    ];
    const sampled = bucketLastPrice(rows, cutoffMs, nowMs, 4);
    assert.deepEqual(
      sampled.map((r) => r.price),
      [11, 21, 31],
    );
    assert.equal(sampled[0]!.fetched_at, rows[1]!.fetched_at);
    assert.equal(sampled[2]!.fetched_at, rows[5]!.fetched_at);
  });

  await runTest("bucketLastPrice returns the rows unchanged when there are not more than `points`", () => {
    const rows: Row[] = [
      { price: 1, fetched_at: "2026-10-11T00:00:00.000Z" },
      { price: 1, fetched_at: "2026-10-11T00:00:00.000Z" },
      { price: 1, fetched_at: "2026-10-11T00:00:00.000Z" },
    ];
    const sampled = bucketLastPrice(rows, 0, 7 * 24 * 60 * 60 * 1000, 14);
    assert.equal(sampled, rows);
  });

  await runTest("`points` is ignored when `days` is absent", async () => {
    const { supabase, calls } = fakeDb([
      [
        { price: 3, fetched_at: "2026-10-03T00:00:00.000Z" },
        { price: 2, fetched_at: "2026-10-02T00:00:00.000Z" },
        { price: 1, fetched_at: "2026-10-01T00:00:00.000Z" },
      ],
    ]);
    const res = await GET(req("symbol=USOIL&points=14"), deps({ supabase, user: { id: "u1" } }));
    assert.equal(res.status, 200);
    assert.equal(calls.range.length, 0);
    assert.equal(calls.gte.length, 0);
    const json = await res.json();
    assert.deepEqual(
      json.points.map((p: { price: number }) => p.price),
      [1, 2, 3],
    );
  });

  await runTest("`points` clamps to 2..60 and is applied only inside the days window", async () => {
    const nowMs = 1_700_000_000_000;
    const days = 7;
    const cutoffMs = nowMs - days * 24 * 60 * 60 * 1000;
    const span = nowMs - cutoffMs;
    const originalNow = Date.now;
    Date.now = () => nowMs;
    try {
      const twoHalves: Row[] = [0.25, 0.75].map((frac, i) => ({
        price: i + 1,
        fetched_at: new Date(cutoffMs + frac * span).toISOString(),
      }));
      const low = await GET(
        req("symbol=USOIL&days=7&points=1"),
        deps({ supabase: fakeDb([twoHalves]).supabase, user: { id: "u1" } }),
      );
      assert.equal(low.status, 200);
      const lowJson = await low.json();
      assert.deepEqual(
        lowJson.points.map((p: { price: number }) => p.price),
        [1, 2],
      );

      const many: Row[] = Array.from({ length: 80 }, (_, i) => ({
        price: i + 1,
        fetched_at: new Date(cutoffMs + ((i + 0.5) * span) / 80).toISOString(),
      }));
      const high = await GET(
        req("symbol=USOIL&days=7&points=100"),
        deps({ supabase: fakeDb([many]).supabase, user: { id: "u1" } }),
      );
      assert.equal(high.status, 200);
      const highJson = await high.json();
      assert.equal(highJson.points.length, 60);
      assert.equal(highJson.points[0].price, 1);
      assert.equal(highJson.points[59].price, 80);
    } finally {
      Date.now = originalNow;
    }
  });

  setNodeEnv(prevEnv);
}

void main();
