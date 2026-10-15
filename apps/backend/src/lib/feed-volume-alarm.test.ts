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

type HealthInsert = { service: string; status: string; detail: string; created_at: string };

function fakeSupabase(feeds: Feed[], opts?: { viewError?: string }) {
  const health: HealthInsert[] = [];
  let queried = false;
  let clock = NOW.toISOString();
  return {
    health,
    get queried() {
      return queried;
    },
    setClock(at: Date) {
      clock = at.toISOString();
    },
    from(table: string) {
      if (table === "feed_gap_p95") {
        queried = true;
        return {
          select: () =>
            Promise.resolve(
              opts?.viewError
                ? { data: null, error: { message: opts.viewError } }
                : { data: feeds, error: null },
            ),
        };
      }
      if (table === "service_health_events") {
        const filters: { service?: string; detail?: string | string[] } = {};
        const builder = {
          select: () => builder,
          eq: (col: string, value: string) => {
            if (col === "service") filters.service = value;
            if (col === "detail") filters.detail = value;
            return builder;
          },
          in: (col: string, values: string[]) => {
            if (col === "detail") filters.detail = values;
            return builder;
          },
          order: () => builder,
          limit: (n?: number) => {
            let rows = [...health].sort((a, b) => b.created_at.localeCompare(a.created_at));
            if (filters.service) rows = rows.filter((row) => row.service === filters.service);
            if (typeof filters.detail === "string") {
              rows = rows.filter((row) => row.detail === filters.detail);
            } else if (Array.isArray(filters.detail)) {
              const allowed = filters.detail;
              rows = rows.filter((row) => allowed.includes(row.detail));
            }
            if (typeof n === "number") rows = rows.slice(0, n);
            return Promise.resolve({ data: rows, error: null });
          },
          insert: (row: { service: string; status: string; detail: string }) => {
            health.push({ ...row, created_at: clock });
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

type Fake = ReturnType<typeof fakeSupabase>;

async function check(supabase: Fake, now: Date, paused: boolean) {
  supabase.setClock(now);
  await checkFeedVolume(supabase, now, { isCollectionPaused: async () => paused });
}

function degraded(supabase: Fake) {
  return supabase.health.filter((row) => row.status === "degraded");
}

async function main() {
  await runTest("under the feed's own p95 writes no row", async () => {
    const supabase = fakeSupabase([
      feed({ feed_name: "Investing.com", last_seen: "2026-10-15T11:00:00.000Z", p95_gap_hours: 2 }),
    ]);
    await check(supabase, NOW, false);
    assert.equal(supabase.health.length, 0);
  });

  await runTest("a gap over p95 writes one degraded row on the second check", async () => {
    const supabase = fakeSupabase([
      feed({ feed_name: "Investing.com", last_seen: "2026-10-15T06:00:00.000Z", p95_gap_hours: 0.5 }),
    ]);
    await check(supabase, NOW, false);
    assert.equal(degraded(supabase).length, 0);
    await check(supabase, new Date(NOW.getTime() + 60_000), false);
    assert.equal(degraded(supabase).length, 1);
    assert.match(degraded(supabase)[0]?.detail ?? "", /^Investing\.com silent .+h, p95 0\.50h$/);
  });

  await runTest("repeating the same gap does not write another row", async () => {
    const supabase = fakeSupabase([
      feed({ feed_name: "Investing.com", last_seen: "2026-10-15T06:00:00.000Z", p95_gap_hours: 0.5 }),
    ]);
    await check(supabase, NOW, false);
    await check(supabase, new Date(NOW.getTime() + 60_000), false);
    await check(supabase, new Date(NOW.getTime() + 120_000), false);
    assert.equal(degraded(supabase).length, 1);
  });

  await runTest("paused collection does not read the view or write a degraded row", async () => {
    const supabase = fakeSupabase([
      feed({ feed_name: "Investing.com", last_seen: "2026-10-14T00:00:00.000Z", p95_gap_hours: 0.5 }),
    ]);
    await check(supabase, NOW, true);
    await check(supabase, new Date(NOW.getTime() + 60_000), true);
    assert.equal(supabase.queried, false);
    assert.equal(degraded(supabase).length, 0);
    assert.equal(supabase.health.filter((row) => row.detail === "collection paused").length, 1);
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
    await check(supabase, NOW, false);
    assert.equal(supabase.health.length, 0);
  });

  await runTest("resume grace: a pause-only gap does not alarm in the first cycles", async () => {
    const supabase = fakeSupabase([
      feed({
        feed_name: "Investing.com",
        last_seen: "2026-10-14T00:00:00.000Z",
        p95_gap_hours: 6,
      }),
    ]);
    await check(supabase, new Date("2026-10-15T00:00:00.000Z"), true);
    await check(supabase, new Date("2026-10-15T12:00:00.000Z"), false);
    await check(supabase, new Date("2026-10-15T13:00:00.000Z"), false);
    assert.equal(degraded(supabase).length, 0);
    assert.equal(supabase.health.filter((row) => row.detail === "collection resumed").length, 1);
  });

  await runTest("real silence after resume alarms on the second consecutive check", async () => {
    const supabase = fakeSupabase([
      feed({
        feed_name: "Investing.com",
        last_seen: "2026-10-14T00:00:00.000Z",
        p95_gap_hours: 0.5,
      }),
    ]);
    await check(supabase, new Date("2026-10-15T08:00:00.000Z"), true);
    await check(supabase, new Date("2026-10-15T10:00:00.000Z"), false);
    await check(supabase, new Date("2026-10-15T12:00:00.000Z"), false);
    assert.equal(degraded(supabase).length, 0);
    await check(supabase, new Date("2026-10-15T12:30:00.000Z"), false);
    assert.equal(degraded(supabase).length, 1);
    assert.match(degraded(supabase)[0]?.detail ?? "", /^Investing\.com silent .+h, p95 0\.50h$/);
  });

  await runTest("one noisy check does not alarm", async () => {
    const row = feed({
      feed_name: "Investing.com",
      last_seen: "2026-10-15T06:00:00.000Z",
      p95_gap_hours: 0.5,
    });
    const supabase = fakeSupabase([row]);
    await check(supabase, NOW, false);
    assert.equal(degraded(supabase).length, 0);
    row.last_seen = "2026-10-15T12:00:00.000Z";
    await check(supabase, new Date("2026-10-15T12:10:00.000Z"), false);
    row.last_seen = "2026-10-15T12:00:00.000Z";
    await check(supabase, new Date("2026-10-15T18:00:00.000Z"), false);
    assert.equal(degraded(supabase).length, 0);
  });

  await runTest("feed recovery writes ok once", async () => {
    const row = feed({
      feed_name: "Investing.com",
      last_seen: "2026-10-15T06:00:00.000Z",
      p95_gap_hours: 0.5,
    });
    const supabase = fakeSupabase([row]);
    await check(supabase, NOW, false);
    await check(supabase, new Date(NOW.getTime() + 60_000), false);
    assert.equal(degraded(supabase).length, 1);
    row.last_seen = "2026-10-15T12:00:00.000Z";
    const recoveredAt = new Date("2026-10-15T12:20:00.000Z");
    await check(supabase, recoveredAt, false);
    await check(supabase, new Date(recoveredAt.getTime() + 60_000), false);
    const oks = supabase.health.filter((item) => item.detail.startsWith("Investing.com ok "));
    assert.equal(oks.length, 1);
    assert.equal(oks[0]?.status, "ok");
  });

  await runTest("a missing view throws and does not write degraded rows", async () => {
    const supabase = fakeSupabase([], { viewError: "Could not find the table public.feed_gap_p95" });
    await assert.rejects(
      () => check(supabase, NOW, false),
      /Could not find the table public\.feed_gap_p95/,
    );
    assert.equal(degraded(supabase).length, 0);
  });
}

main();
