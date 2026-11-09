import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { setMediaImpactCaveatCacheForTests } from "@/lib/media-impact-watchlist";

function runTest(name: string, fn: () => Promise<void> | void) {
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

// Mock the data layer the same way apps/web/app/api/cot/route.test.ts does:
// getRouteSupabaseClients() returns null with no Supabase env configured, so
// the real handler takes its deterministic "unconfigured" branch.
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_AUTH_URL;
process.env.RATE_LIMIT_SAFE_MODE = "true";

// Records every select() call's (table, columns, options) so Part 2's
// explicit-column/opt-in-count change can be asserted directly, instead of
// just trusting the response shape didn't change.
type SelectCall = { table: string; columns: string; options: unknown };

const FAKE_SIGNAL_ROW = {
  id: "sig-1",
  title: "Fake signal",
  summary: "Summary text",
  ai_analysis: null,
  severity: 6,
  confidence: 0.7,
  event_type: "conflict",
  country: "Testland",
  region: "global",
  lat: null,
  lng: null,
  sources_count: 1,
  commodity_impacts: [],
  currency_pair_impacts: [],
  sanctions_matches: [],
  is_breaking: false,
  is_active: true,
  raw_event_ids: [] as string[],
  created_at: "2026-11-09T00:00:00.000Z",
  updated_at: "2026-11-09T00:00:00.000Z",
  event_date: "2026-11-09T00:00:00.000Z",
  media_impact_entity: null,
  event_category: null,
  market_mechanism: null,
  is_preview: false,
  novelty: null,
  source_confirmation: null,
  materiality_reasoning: null,
  invalidation_condition: null,
};

function makeFakeSupabase(selectCalls: SelectCall[]) {
  function builder(table: string) {
    const b: Record<string, unknown> = {};
    const self = () => b;
    b.select = (columns: string, options?: unknown) => {
      selectCalls.push({ table, columns, options });
      return b;
    };
    for (const method of ["gte", "lte", "is", "eq", "in", "or", "order", "limit", "range"]) {
      b[method] = self;
    }
    // Every terminal await resolves the same canned, filtered-and-counted
    // payload — count:15 clears MIN_FEED_FILL on the first (24h) tier, so
    // the default view's tiered fallback never has to widen.
    b.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      const data = table === "signals" ? [FAKE_SIGNAL_ROW] : [];
      return Promise.resolve({ data, error: null, count: table === "signals" ? 15 : 0 }).then(
        onFulfilled,
        onRejected,
      );
    };
    return b;
  }
  return { from: builder };
}

function makeFakeDeps(selectCalls: SelectCall[]) {
  return {
    getRouteSupabaseClients: async () => ({
      supabase: makeFakeSupabase(selectCalls),
      supabaseAuth: makeFakeSupabase(selectCalls),
      user: { id: "user-1" },
    }),
  } as unknown as Parameters<typeof GET>[2];
}

async function main() {
  await runTest(
    "the response is private, no-store — the feed is gated on the requester's own session and supports ?personalized=true",
    async () => {
      const res = await GET(new NextRequest("https://app.example.com/api/signals"));
      assert.equal(res.headers.get("cache-control"), "private, no-store");
    },
  );

  await runTest("a personalized request is also private, no-store", async () => {
    const res = await GET(new NextRequest("https://app.example.com/api/signals?personalized=true"));
    assert.equal(res.headers.get("cache-control"), "private, no-store");
  });

  await runTest(
    "default view: response shape is unchanged, columns are explicit (not '*'), and count is opt-in",
    async () => {
      setMediaImpactCaveatCacheForTests(new Map());
      const selectCalls: SelectCall[] = [];
      const res = await GET(
        new NextRequest("https://app.example.com/api/signals?x=default-view-test"),
        { params: Promise.resolve({}) },
        makeFakeDeps(selectCalls),
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body.signals));
      assert.equal(body.nextCursor, null);
      assert.equal(typeof body.total, "number");
      assert.equal(typeof body.personalized, "boolean");
      assert.equal(body.resolvedWindow, "24h");
      assert.ok(Array.isArray(body.justIn));

      const signalsSelects = selectCalls.filter((c) => c.table === "signals");
      assert.ok(signalsSelects.length > 0);
      for (const call of signalsSelects) {
        assert.equal(call.columns.includes("*"), false, "signals select() must not use '*'");
      }
      // The full-row fetch (tiered fallback) still carries every field the
      // response maps into a Signal.
      assert.ok(signalsSelects.some((c) => c.columns.includes("materiality_reasoning")));
      // At least one call (the oldest-row lookup) trims to just what it
      // reads and requests no count at all — the discarded-count waste this
      // task removed.
      assert.ok(signalsSelects.some((c) => c.options === undefined && !c.columns.includes("materiality_reasoning")));
    },
  );

  await runTest(
    "explicit window=24h view: response shape is unchanged (no resolvedWindow/justIn)",
    async () => {
      setMediaImpactCaveatCacheForTests(new Map());
      const selectCalls: SelectCall[] = [];
      const res = await GET(
        new NextRequest("https://app.example.com/api/signals?window=24h&x=window-view-test"),
        { params: Promise.resolve({}) },
        makeFakeDeps(selectCalls),
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body.signals));
      assert.equal(typeof body.total, "number");
      assert.equal(typeof body.personalized, "boolean");
      assert.equal(body.resolvedWindow, undefined);
      assert.equal(body.justIn, undefined);
    },
  );
}

void main();
