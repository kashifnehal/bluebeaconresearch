import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";
process.env.NODE_ENV = "test";

import { runGateDriftOnce } from "./gate-drift.js";

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

type WindowFixture = {
  judged: Array<{ id: string; title: string }>;
  categories: Record<string, string | null>;
  reasons: Array<{ detail: string }>;
};

function fakeSupabase(windows: Record<string, WindowFixture>) {
  const health: Array<{ service: string; status: string; detail: string | null }> = [];
  return {
    health,
    from(table: string) {
      if (table === "raw_events") {
        let start = "";
        const builder = {
          select: () => builder,
          gte: (_col: string, value: string) => {
            start = value;
            return builder;
          },
          lt: () => builder,
          then: (resolve: (value: { data: WindowFixture["judged"]; error: null }) => unknown) =>
            Promise.resolve({ data: windows[start]?.judged ?? [], error: null }).then(resolve),
        };
        return builder;
      }
      if (table === "signals") {
        let ids: string[] = [];
        const builder = {
          select: () => builder,
          overlaps: (_col: string, values: string[]) => {
            ids = values;
            return builder;
          },
          then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => {
            const wanted = new Set(ids);
            const data: Array<{ raw_event_ids: string[]; event_category: string | null }> = [];
            for (const window of Object.values(windows)) {
              for (const [id, category] of Object.entries(window.categories)) {
                if (wanted.has(id)) data.push({ raw_event_ids: [id], event_category: category });
              }
            }
            return Promise.resolve({ data, error: null }).then(resolve);
          },
        };
        return builder;
      }
      if (table === "service_health_events") {
        let start = "";
        let service = "";
        const builder = {
          select: () => builder,
          eq: (col: string, value: string) => {
            if (col === "service") service = value;
            return builder;
          },
          gte: (_col: string, value: string) => {
            start = value;
            return builder;
          },
          lt: () => builder,
          insert: (row: { service: string; status: string; detail: string | null }) => {
            health.push(row);
            return Promise.resolve({ error: null });
          },
          then: (resolve: (value: { data: WindowFixture["reasons"]; error: null }) => unknown) => {
            const reasons = service === "materiality_gate" ? (windows[start]?.reasons ?? []) : [];
            return Promise.resolve({ data: reasons, error: null }).then(resolve);
          },
        };
        return builder;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const WEEK_END = new Date("2026-10-15T06:00:00.000Z");
const CURRENT_START = new Date(WEEK_END.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
const PREVIOUS_START = new Date(WEEK_END.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

async function main() {
  await runTest("a week with zero judged rows still writes an ok report", async () => {
    const supabase = fakeSupabase({});
    const report = await runGateDriftOnce(supabase, WEEK_END);
    assert.equal(report.current.judged, 0);
    assert.equal(report.current.passed, 0);
    assert.equal(report.current.rejected, 0);
    assert.equal(report.current.passRate, null);
    assert.equal(report.previous.judged, 0);
    assert.equal(supabase.health.length, 1);
    assert.equal(supabase.health[0]?.service, "gate-drift");
    assert.equal(supabase.health[0]?.status, "ok");
    const stored = JSON.parse(supabase.health[0]?.detail ?? "{}");
    assert.equal(stored.current.judged, 0);
  });

  await runTest("a normal week counts passes, categories, and the previous week", async () => {
    const longTitle = `Rejected headline ${"x".repeat(200)}`;
    const supabase = fakeSupabase({
      [CURRENT_START]: {
        judged: [
          { id: "p1", title: "Passed one" },
          { id: "p2", title: "Passed two" },
          { id: "r1", title: longTitle },
        ],
        categories: { p1: "shipping_disruption", p2: "shipping_disruption" },
        reasons: [
          {
            detail: `title="${longTitle.slice(0, 200)}" source=rss method=claude reasoning="no listed instrument"`,
          },
        ],
      },
      [PREVIOUS_START]: {
        judged: [
          { id: "old-p", title: "Old pass" },
          { id: "old-r", title: "Old reject" },
        ],
        categories: { "old-p": "policy_regulation" },
        reasons: [],
      },
    });
    const report = await runGateDriftOnce(supabase, WEEK_END);
    assert.equal(report.current.judged, 3);
    assert.equal(report.current.passed, 2);
    assert.equal(report.current.rejected, 1);
    assert.equal(report.current.passRate, 2 / 3);
    assert.equal(report.current.passByCategory.shipping_disruption, 2);
    assert.equal(report.previous.judged, 2);
    assert.equal(report.previous.passed, 1);
    assert.equal(report.previous.passRate, 0.5);
    assert.equal(report.difference.judged, 1);
    assert.equal(report.difference.passed, 1);
    assert.equal(report.rejectedSample.length, 1);
    assert.equal(report.rejectedSample[0]?.title.length, 120);
    assert.equal(report.rejectedSample[0]?.reason, "no listed instrument");
    assert.equal(supabase.health[0]?.status, "ok");
  });

  await runTest("a missing previous week is zeros and does not fail", async () => {
    const supabase = fakeSupabase({
      [CURRENT_START]: {
        judged: [{ id: "only", title: "Only judged row" }],
        categories: {},
        reasons: [],
      },
    });
    const report = await runGateDriftOnce(supabase, WEEK_END);
    assert.equal(report.current.judged, 1);
    assert.equal(report.current.passed, 0);
    assert.equal(report.current.passRate, 0);
    assert.equal(report.previous.judged, 0);
    assert.equal(report.previous.passRate, null);
    assert.equal(report.difference.judged, 1);
    assert.equal(report.difference.passRate, null);
    assert.equal(supabase.health.length, 1);
  });
}

main();
