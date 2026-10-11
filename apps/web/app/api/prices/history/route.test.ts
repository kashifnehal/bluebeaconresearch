import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { handleHistoryGet as GET, type PricesHistoryDeps } from "./route";

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

  setNodeEnv(prevEnv);
}

void main();
