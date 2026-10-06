import assert from "node:assert/strict";

// signal-merge.ts pulls signal-generator.ts, which reads env at import time.
// Set the test env before that import, or getEnv() throws before any test runs.
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-supabase-role-key";

const { findSimilarRecentSignal } = await import("./novelty-hint.js");
const { jaccardSimilarity, SIMILARITY_THRESHOLD, tokenize } = await import("../workers/signal-merge.js");

type Row = { title: string | null; created_at: string | null };

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function fakeSupabase(result: { data: Row[] | null; error: { message: string } | null }) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder = {
    select(...args: unknown[]) {
      calls.push({ method: "select", args });
      return builder;
    },
    gte(...args: unknown[]) {
      calls.push({ method: "gte", args });
      return builder;
    },
    order(...args: unknown[]) {
      calls.push({ method: "order", args });
      return builder;
    },
    limit(...args: unknown[]) {
      calls.push({ method: "limit", args });
      return builder;
    },
    then(resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  const supabase = {
    from(table: string) {
      calls.push({ method: "from", args: [table] });
      return builder;
    },
  };
  return { supabase, calls };
}

let failed = false;
function runTest(name: string, fn: () => void | Promise<void>) {
  const result = fn();
  if (result instanceof Promise) {
    return result.then(
      () => console.log(`✔ ${name}`),
      (err) => {
        failed = true;
        console.error(`✖ ${name}`);
        console.error(err);
      },
    );
  }
  try {
    console.log(`✔ ${name}`);
  } catch (err) {
    failed = true;
    console.error(`✖ ${name}`);
    console.error(err);
  }
}

const QUERY = "US strikes Iranian oil tankers in the Gulf";
const CLOSE = "US strikes Iranian oil tankers near Hormuz";
const WEAKER = "Iranian oil tankers halted";
const FAR = "Federal Reserve holds interest rates steady";

async function main() {
  await runTest("findSimilarRecentSignal returns the closest title at or above the threshold", async () => {
    const { supabase, calls } = fakeSupabase({
      data: [
        { title: WEAKER, created_at: hoursAgoIso(2) },
        { title: CLOSE, created_at: hoursAgoIso(11) },
        { title: FAR, created_at: hoursAgoIso(1) },
      ],
      error: null,
    });
    const match = await findSimilarRecentSignal(supabase as never, { title: QUERY });
    const expected = jaccardSimilarity(tokenize(QUERY), tokenize(CLOSE));
    assert.ok(expected >= SIMILARITY_THRESHOLD);
    assert.ok(match);
    assert.equal(match.title, CLOSE);
    assert.equal(match.hoursAgo, 11);
    assert.equal(match.similarity, expected);
    assert.deepEqual(calls.find((c) => c.method === "select")?.args, ["title, created_at"]);
    assert.deepEqual(calls.find((c) => c.method === "order")?.args, ["created_at", { ascending: false }]);
    assert.deepEqual(calls.find((c) => c.method === "limit")?.args, [300]);
    const cutoff = String(calls.find((c) => c.method === "gte")?.args[1]);
    const ageHours = (Date.now() - new Date(cutoff).getTime()) / 3_600_000;
    assert.ok(Math.abs(ageHours - 48) < 0.05, `expected a 48h cutoff, got ${ageHours}`);
  });

  await runTest("findSimilarRecentSignal returns null when nothing clears the threshold", async () => {
    const { supabase } = fakeSupabase({
      data: [{ title: FAR, created_at: hoursAgoIso(3) }],
      error: null,
    });
    const match = await findSimilarRecentSignal(supabase as never, { title: QUERY });
    assert.equal(match, null);
    assert.ok(jaccardSimilarity(tokenize(QUERY), tokenize(FAR)) < SIMILARITY_THRESHOLD);
  });

  await runTest("findSimilarRecentSignal returns null and warns when the query errors", async () => {
    const warnings: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    try {
      const { supabase } = fakeSupabase({
        data: null,
        error: { message: "statement timeout" },
      });
      const match = await findSimilarRecentSignal(supabase as never, { title: QUERY });
      assert.equal(match, null);
      assert.equal(warnings.length, 1);
      assert.match(String(warnings[0][0]), /findSimilarRecentSignal query failed/);
      assert.equal(warnings[0][1], "statement timeout");
    } finally {
      console.warn = original;
    }
  });

  if (failed) {
    console.error("\nSome novelty-hint tests failed.");
    process.exit(1);
  } else {
    console.log("\nAll novelty-hint tests passed.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
