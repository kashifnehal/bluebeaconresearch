import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";
process.env.NODE_ENV = "test";

import { checkFeedVolume } from "./feed-volume-alarm.js";

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

type Feed = {
  feed_name: string;
  rows_14d: number;
  last_seen: string;
  p95_gap_hours: number;
};

function fakeSupabase(feeds: Feed[]) {
  const health: Array<{ status: string; detail: string; created_at: string; service: string }> = [];
  let queried = false;
  return {
    health,
    get queried() {
      return queried;
    },
    from(table: string) {
      if (table === "feed_gap_p95") {
        queried = true;
        return {
          select: () => Promise.resolve({ data: feeds, error: null }),
        };
      }
      if (table === "service_health_events") {
        const builder = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          limit: () =>
            Promise.resolve({
              data: [...health].sort((a, b) => b.created_at.localeCompare(a.created_at)),
              error: null,
            }),
          insert: (row: { service: string; status: string; detail: string }) => {
            health.push({ ...row, created_at: new Date().toISOString() });
            return Promise.resolve({ error: null });
          },
        };
        return builder;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const NOW = new Date("2026-10-15T12:00:00.000Z");

function feed(partial: Partial<Feed> & { feed_name: string }): Feed {
  return {
    feed_name: partial.feed_name,
    rows_14d: partial.rows_14d ?? 200,
    last_seen: partial.last_seen ?? "2026-10-15T11:00:00.000Z",
    p95_gap_hours: partial.p95_gap_hours ?? 2,
  };
}

async function main() {
  await runTest("under the feed's own p95 writes no row", async () => {
    const supabase = fakeSupabase([
      feed({ feed_name: "Investing.com", last_seen: "2026-10-15T11:00:00.000Z", p95_gap_hours: 2 }),
    ]);
    await checkFeedVolume(supabase, NOW, { isCollectionPaused: async () => false });
    assert.equal(supabase.health.length, 0);
  });

  await runTest("a gap over p95 writes one degraded row", async () => {
    const supabase = fakeSupabase([
      feed({ feed_name: "Investing.com", last_seen: "2026-10-15T06:00:00.000Z", p95_gap_hours: 0.5 }),
    ]);
    await checkFeedVolume(supabase, NOW, { isCollectionPaused: async () => false });
    assert.equal(supabase.health.length, 1);
    assert.equal(supabase.health[0]?.status, "degraded");
    assert.match(supabase.health[0]?.detail ?? "", /^Investing\.com silent .+h, p95 0\.50h$/);
  });

  await runTest("repeating the same gap does not write another row", async () => {
    const supabase = fakeSupabase([
      feed({ feed_name: "Investing.com", last_seen: "2026-10-15T06:00:00.000Z", p95_gap_hours: 0.5 }),
    ]);
    const deps = { isCollectionPaused: async () => false };
    await checkFeedVolume(supabase, NOW, deps);
    await checkFeedVolume(supabase, new Date(NOW.getTime() + 60_000), deps);
    assert.equal(supabase.health.length, 1);
  });

  await runTest("paused collection writes nothing", async () => {
    const supabase = fakeSupabase([
      feed({ feed_name: "Investing.com", last_seen: "2026-10-14T00:00:00.000Z", p95_gap_hours: 0.5 }),
    ]);
    await checkFeedVolume(supabase, NOW, { isCollectionPaused: async () => true });
    assert.equal(supabase.queried, false);
    assert.equal(supabase.health.length, 0);
  });

  await runTest("a feed with 99 rows is ignored", async () => {
    const supabase = fakeSupabase([
      feed({
        feed_name: "Hellenic Shipping",
        rows_14d: 99,
        last_seen: "2026-10-14T00:00:00.000Z",
        p95_gap_hours: 1,
      }),
    ]);
    await checkFeedVolume(supabase, NOW, { isCollectionPaused: async () => false });
    assert.equal(supabase.health.length, 0);
  });
}

main();
