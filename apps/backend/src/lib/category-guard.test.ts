import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";
process.env.NODE_ENV = "test";

import { checkCategoryCoverage } from "./category-guard.js";

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

type HealthRow = { service: string; status: string; detail: string | null; created_at: string };

function fakeSupabase(categories: Array<string | null>) {
  const health: HealthRow[] = [];
  return {
    health,
    from(table: string) {
      if (table === "signals") {
        const builder = {
          select: () => builder,
          eq: () => builder,
          gte: () => builder,
          then: (resolve: (value: { data: Array<{ event_category: string | null }>; error: null }) => unknown) =>
            Promise.resolve({
              data: categories.map((event_category) => ({ event_category })),
              error: null,
            }).then(resolve),
        };
        return builder;
      }
      if (table === "service_health_events") {
        const filters: Record<string, string> = {};
        const builder = {
          select: () => builder,
          eq: (col: string, value: string) => {
            filters[col] = value;
            return builder;
          },
          gte: (_col: string, value: string) => {
            filters.since = value;
            return builder;
          },
          limit: () => {
            const matches = health.filter(
              (row) =>
                row.service === filters.service &&
                row.status === filters.status &&
                row.created_at >= (filters.since ?? ""),
            );
            return Promise.resolve({ data: matches.slice(0, 1), error: null });
          },
          insert: (row: { service: string; status: string; detail: string | null }) => {
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

async function main() {
  await runTest("a missing category on a Claude row writes degraded", async () => {
    const supabase = fakeSupabase(["shipping_disruption", null, "policy_regulation"]);
    await checkCategoryCoverage(supabase, NOW);
    assert.equal(supabase.health.length, 1);
    assert.equal(supabase.health[0]?.status, "degraded");
    assert.equal(
      supabase.health[0]?.detail,
      "1 of 3 Claude-classified signals have no category in 24h",
    );
  });

  await runTest("full coverage writes one ok row per UTC day", async () => {
    const supabase = fakeSupabase(["shipping_disruption", "policy_regulation"]);
    await checkCategoryCoverage(supabase, NOW);
    await checkCategoryCoverage(supabase, new Date("2026-10-15T18:00:00.000Z"));
    assert.equal(supabase.health.length, 1);
    assert.equal(supabase.health[0]?.status, "ok");
    assert.equal(
      supabase.health[0]?.detail,
      "0 of 2 Claude-classified signals have no category in 24h",
    );
  });

  await runTest("a day with no Claude-classified signals is ok, not degraded", async () => {
    const supabase = fakeSupabase([]);
    await checkCategoryCoverage(supabase, NOW);
    assert.equal(supabase.health.length, 1);
    assert.equal(supabase.health[0]?.status, "ok");
    assert.equal(supabase.health[0]?.detail, "no Claude-classified signals in 24h");
  });
}

main();
