import assert from "node:assert/strict";
import { T2_GNEWS_QUERIES } from "../lib/t2-terms.js";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

// selectGnewsQuery is pure (cycleIndex in, {query, index} out) — no network/Supabase
// involved, so this only exercises the rotation math introduced by W7-GNEWS-ROTATE.
const {
  selectGnewsQuery,
  selectGnewsT2Query,
  gnewsT2Selection,
  GNEWS_QUERY_COUNT,
  resolveGnewsPlan,
  gnewsFetchFailed,
  runPlannedGnewsFetches,
} = await import("./gnews-collector.js");

let failed = false;
function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    failed = true;
    console.error(`✖ ${name}`);
    console.error(err);
  }
}

async function runTestAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    failed = true;
    console.error(`✖ ${name}`);
    console.error(err);
  }
}

runTest("cycles through every query once per full rotation before repeating", () => {
  const seen = new Set<string>();
  for (let i = 0; i < GNEWS_QUERY_COUNT; i++) {
    const { query, index } = selectGnewsQuery(i);
    assert.equal(index, i);
    seen.add(query);
  }
  assert.equal(seen.size, GNEWS_QUERY_COUNT, "every query in one rotation must be distinct");
  assert.deepEqual(
    selectGnewsQuery(GNEWS_QUERY_COUNT),
    selectGnewsQuery(0),
    "index wraps back to index 0 after one full rotation",
  );
});

runTest("wraps around with modulo past one full rotation", () => {
  assert.deepEqual(selectGnewsQuery(GNEWS_QUERY_COUNT + 1), selectGnewsQuery(1));
  assert.deepEqual(selectGnewsQuery(GNEWS_QUERY_COUNT * 2), selectGnewsQuery(0));
  // 48 cycles/day (every 30 min) is the real production cadence (see comment above
  // GNEWS_QUERIES) — confirm it still resolves within bounds after many rotations.
  assert.deepEqual(selectGnewsQuery(48 * 2 + 1), selectGnewsQuery(1));
});

runTest("negative cycleIndex still resolves to a valid, non-negative query index", () => {
  const { index } = selectGnewsQuery(-1);
  assert.equal(index, GNEWS_QUERY_COUNT - 1);
  assert.deepEqual(selectGnewsQuery(-1), selectGnewsQuery(GNEWS_QUERY_COUNT - 1));
});

runTest("index always stays within query bounds regardless of cycleIndex", () => {
  for (const cycleIndex of [0, 1, 2, 3, 4, 47, 48, 95, 96, 1000]) {
    const { index } = selectGnewsQuery(cycleIndex);
    assert.ok(index >= 0 && index < GNEWS_QUERY_COUNT, `index ${index} out of bounds for cycleIndex ${cycleIndex}`);
  }
});

runTest("selectGnewsT2Query returns null on cycles 0 and 1 and a query on cycle 2", () => {
  assert.equal(selectGnewsT2Query(0), null);
  assert.equal(selectGnewsT2Query(1), null);
  assert.deepEqual(selectGnewsT2Query(2), { query: T2_GNEWS_QUERIES[0], index: 0 });
  assert.deepEqual(selectGnewsT2Query(5), { query: T2_GNEWS_QUERIES[1], index: 1 });
  assert.deepEqual(selectGnewsT2Query(8), { query: T2_GNEWS_QUERIES[0], index: 0 });
});

runTest("GNEWS_T2_QUERY off selects nothing even on a T2 cycle", () => {
  const previous = process.env.GNEWS_T2_QUERY;
  try {
    delete process.env.GNEWS_T2_QUERY;
    assert.equal(gnewsT2Selection(2), null);
    process.env.GNEWS_T2_QUERY = "false";
    assert.equal(gnewsT2Selection(2), null);
    process.env.GNEWS_T2_QUERY = "true";
    assert.deepEqual(gnewsT2Selection(2), { query: T2_GNEWS_QUERIES[0], index: 0 });
    assert.equal(gnewsT2Selection(0), null);
    assert.equal(gnewsT2Selection(1), null);
  } finally {
    if (previous === undefined) delete process.env.GNEWS_T2_QUERY;
    else process.env.GNEWS_T2_QUERY = previous;
  }
});

await runTestAsync("free plan sends one request with max=10", async () => {
  const previous = process.env.GNEWS_PLAN;
  try {
    delete process.env.GNEWS_PLAN;
    assert.equal(resolveGnewsPlan(), "free");
    assert.equal(resolveGnewsPlan("free"), "free");
    assert.equal(resolveGnewsPlan("paid"), "free");
    const calls: Array<{ query: string; max: number }> = [];
    const sleeps: number[] = [];
    const result = await runPlannedGnewsFetches({
      plan: resolveGnewsPlan(),
      cycleIndex: 1,
      token: "test-token",
      fetchArticles: async (query, _token, max) => {
        calls.push({ query, max });
        return [{ url: "https://example.com/a" }];
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.max, 10);
    assert.equal(calls[0]?.query, selectGnewsQuery(1).query);
    assert.deepEqual(sleeps, []);
    assert.equal(result.rateLimited, false);
    assert.equal(gnewsFetchFailed(result.articles.length, result.fetchError), false);
  } finally {
    if (previous === undefined) delete process.env.GNEWS_PLAN;
    else process.env.GNEWS_PLAN = previous;
  }
});

await runTestAsync("essential plan sends three max=25 requests and a second failure does not fail the cycle", async () => {
  assert.equal(resolveGnewsPlan("essential"), "essential");
  assert.equal(GNEWS_QUERY_COUNT, 3);
  const timeline: string[] = [];
  let n = 0;
  const result = await runPlannedGnewsFetches({
    plan: "essential",
    cycleIndex: 4,
    token: "test-token",
    fetchArticles: async (query, _token, max) => {
      timeline.push(`fetch:${max}:${query}`);
      n += 1;
      if (n === 2) {
        const err: any = new Error("quota");
        err.response = { status: 429 };
        throw err;
      }
      return [{ url: `https://example.com/${n}` }];
    },
    sleep: async (ms) => {
      timeline.push(`sleep:${ms}`);
    },
  });
  assert.deepEqual(timeline, [
    `fetch:25:${selectGnewsQuery(0).query}`,
    "sleep:1100",
    `fetch:25:${selectGnewsQuery(1).query}`,
    "sleep:1100",
    `fetch:25:${selectGnewsQuery(2).query}`,
  ]);
  assert.equal(result.articles.length, 2);
  assert.equal(result.rateLimited, false);
  assert.equal(result.fetchError, undefined);
  assert.equal(gnewsFetchFailed(result.articles.length, result.fetchError), false);
});

if (failed) process.exitCode = 1;
