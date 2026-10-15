import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";
process.env.NODE_ENV = "test";

import { GATE_PASS_RATE_DEFINITION, runGateDriftOnce } from "./gate-drift.js";

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

type RawEvent = { id: string; title: string; materiality_checked_at: string };
type Signal = {
  raw_event_ids: string[] | null;
  event_category: string | null;
  created_at: string;
};
type Rejection = { detail: string; created_at: string; raw_event_id?: string };

function fakeSupabase(
  rawEvents: RawEvent[],
  signals: Signal[],
  rejections: Rejection[],
  opts?: { missingRawEventId?: boolean },
) {
  const health: Array<{ service: string; status: string; detail: string | null }> = [];
  const signalRanges: number[] = [];
  const healthSelects: string[] = [];
  return {
    health,
    signalRanges,
    healthSelects,
    from(table: string) {
      if (table === "raw_events") {
        let start = "";
        let end = "";
        const builder = {
          select: () => builder,
          gte: (_col: string, value: string) => {
            start = value;
            return builder;
          },
          lt: (_col: string, value: string) => {
            end = value;
            return builder;
          },
          then: (resolve: (value: { data: RawEvent[]; error: null }) => unknown) =>
            Promise.resolve({
              data: rawEvents.filter(
                (row) => row.materiality_checked_at >= start && row.materiality_checked_at < end,
              ),
              error: null,
            }).then(resolve),
        };
        return builder;
      }
      if (table === "signals") {
        let start = "";
        let end = "";
        let from = 0;
        let to = 199;
        const builder = {
          select: () => builder,
          gte: (_col: string, value: string) => {
            start = value;
            return builder;
          },
          lt: (_col: string, value: string) => {
            end = value;
            return builder;
          },
          order: () => builder,
          range: (startRow: number, endRow: number) => {
            from = startRow;
            to = endRow;
            signalRanges.push(startRow);
            return builder;
          },
          then: (resolve: (value: { data: Signal[]; error: null }) => unknown) => {
            const rows = signals
              .filter((row) => row.created_at >= start && row.created_at < end)
              .sort((a, b) => a.created_at.localeCompare(b.created_at));
            return Promise.resolve({ data: rows.slice(from, to + 1), error: null }).then(resolve);
          },
        };
        return builder;
      }
      if (table === "service_health_events") {
        let start = "";
        let end = "";
        let service = "";
        let columns = "";
        const builder = {
          select: (value: string) => {
            columns = value;
            if (service === "materiality_gate" || value.includes("detail")) healthSelects.push(value);
            return builder;
          },
          eq: (col: string, value: string) => {
            if (col === "service") service = value;
            return builder;
          },
          gte: (_col: string, value: string) => {
            start = value;
            return builder;
          },
          lt: (_col: string, value: string) => {
            end = value;
            return builder;
          },
          insert: (row: { service: string; status: string; detail: string | null }) => {
            health.push(row);
            return Promise.resolve({ error: null });
          },
          then: (
            resolve: (value: {
              data: Rejection[] | null;
              error: { message: string; code: string } | null;
            }) => unknown,
          ) => {
            if (service !== "materiality_gate") {
              return Promise.resolve({ data: [], error: null }).then(resolve);
            }
            if (opts?.missingRawEventId && columns.includes("raw_event_id")) {
              return Promise.resolve({
                data: null,
                error: {
                  code: "PGRST204",
                  message: "Could not find the 'raw_event_id' column of 'service_health_events' in the schema cache",
                },
              }).then(resolve);
            }
            const data = rejections.filter((row) => row.created_at >= start && row.created_at < end);
            return Promise.resolve({ data, error: null }).then(resolve);
          },
        };
        return builder;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const WEEK_END = new Date("2026-10-15T06:00:00.000Z");
const CURRENT_START = new Date(WEEK_END.getTime() - 7 * 24 * 60 * 60 * 1000);
const PREVIOUS_START = new Date(WEEK_END.getTime() - 14 * 24 * 60 * 60 * 1000);

function at(base: Date, hours: number): string {
  return new Date(base.getTime() + hours * 60 * 60 * 1000).toISOString();
}

async function main() {
  await runTest("an empty window gives a null pass rate and one ok row", async () => {
    const supabase = fakeSupabase([], [], []);
    const report = await runGateDriftOnce(supabase, WEEK_END);
    assert.equal(report.definition, GATE_PASS_RATE_DEFINITION);
    assert.equal(report.current.judged, 0);
    assert.equal(report.current.passed, 0);
    assert.equal(report.current.rejected, 0);
    assert.equal(report.current.passRate, null);
    assert.equal(report.previous.passRate, null);
    assert.equal(report.difference.passRate, null);
    assert.equal(supabase.health.length, 1);
    assert.equal(supabase.health[0]?.service, "gate-drift");
    assert.equal(supabase.health[0]?.status, "ok");
    const stored = JSON.parse(supabase.health[0]?.detail ?? "{}");
    assert.equal(stored.current.passRate, null);
    assert.equal(stored.definition, GATE_PASS_RATE_DEFINITION);
    assert.equal(JSON.stringify(report).includes("good"), false);
  });

  await runTest("passes are counted from signals created in the window, not from raw events", async () => {
    const supabase = fakeSupabase(
      [
        {
          id: "stamped-but-not-a-pass",
          title: "Checked row with no signal",
          materiality_checked_at: at(CURRENT_START, 1),
        },
      ],
      [
        {
          raw_event_ids: ["stamped-but-not-a-pass"],
          event_category: "policy_regulation",
          created_at: at(PREVIOUS_START, 2),
        },
        {
          raw_event_ids: ["made-this-week"],
          event_category: "shipping_disruption",
          created_at: at(CURRENT_START, 3),
        },
        {
          raw_event_ids: ["made-this-week-2"],
          event_category: "shipping_disruption",
          created_at: at(CURRENT_START, 4),
        },
        {
          raw_event_ids: [],
          event_category: "shipping_disruption",
          created_at: at(CURRENT_START, 5),
        },
      ],
      [],
    );
    const report = await runGateDriftOnce(supabase, WEEK_END);
    assert.equal(report.current.passed, 2);
    assert.equal(report.current.rejected, 0);
    assert.equal(report.current.judged, 2);
    assert.equal(report.current.passRate, 1);
    assert.equal(report.current.passByCategory.shipping_disruption, 2);
    assert.equal(report.previous.passed, 1);
    assert.equal(report.previous.passRate, 1);
    assert.equal(report.difference.passed, 1);
    assert.equal(report.difference.passRate, 0);
  });

  await runTest("rejections match health rows and a prefilter skip is left out", async () => {
    const longTitle = `Rejected headline ${"x".repeat(200)}`;
    const supabase = fakeSupabase(
      [
        { id: "gate-1", title: longTitle, materiality_checked_at: at(CURRENT_START, 2) },
        { id: "pre-same-title", title: longTitle, materiality_checked_at: at(CURRENT_START, 3) },
        { id: "pre-other", title: "Already judged headline", materiality_checked_at: at(CURRENT_START, 4) },
      ],
      [
        {
          raw_event_ids: ["signal-source"],
          event_category: "shipping_disruption",
          created_at: at(CURRENT_START, 1),
        },
      ],
      [
        {
          raw_event_id: "gate-1",
          created_at: at(CURRENT_START, 2),
          detail: `title="${longTitle.slice(0, 200)}" source=rss method=claude reasoning="no listed instrument"`,
        },
      ],
    );
    const report = await runGateDriftOnce(supabase, WEEK_END);
    assert.equal(report.current.passed, 1);
    assert.equal(report.current.rejected, 1);
    assert.equal(report.current.judged, 2);
    assert.equal(report.current.passRate, 0.5);
    assert.equal(report.rejectedSample.length, 1);
    assert.equal(report.rejectedSample[0]?.title.length, 120);
    assert.equal(report.rejectedSample[0]?.reason, "no listed instrument");
    assert.equal(supabase.health.length, 1);
    assert.equal(supabase.health[0]?.status, "ok");
  });

  await runTest("a missing raw_event_id column still drops prefilter skips", async () => {
    const supabase = fakeSupabase(
      [
        { id: "gate-1", title: "Gate reject", materiality_checked_at: at(CURRENT_START, 1) },
        { id: "pre-1", title: "Prefilter skip", materiality_checked_at: at(CURRENT_START, 2) },
      ],
      [],
      [
        {
          created_at: at(CURRENT_START, 1),
          detail: `title="Gate reject" source=rss method=claude reasoning="no market link"`,
        },
      ],
      { missingRawEventId: true },
    );
    const report = await runGateDriftOnce(supabase, WEEK_END);
    assert.equal(report.current.passed, 0);
    assert.equal(report.current.rejected, 1);
    assert.equal(report.current.judged, 1);
    assert.equal(report.current.passRate, 0);
    assert.equal(report.previous.passRate, null);
    assert.equal(report.difference.passRate, null);
    assert.ok(supabase.healthSelects.some((columns) => columns.includes("raw_event_id")));
    assert.ok(supabase.healthSelects.some((columns) => columns === "detail"));
  });

  await runTest("signals are read in batches of 200", async () => {
    const signals: Signal[] = [];
    for (let i = 0; i < 201; i++) {
      signals.push({
        raw_event_ids: [`event-${i}`],
        event_category: i % 2 === 0 ? "shipping_disruption" : null,
        created_at: at(CURRENT_START, i / 100),
      });
    }
    const supabase = fakeSupabase([], signals, []);
    const report = await runGateDriftOnce(supabase, WEEK_END);
    assert.equal(report.current.passed, 201);
    assert.equal(report.current.rejected, 0);
    assert.equal(report.current.judged, 201);
    assert.equal(report.current.passByCategory.shipping_disruption, 101);
    assert.equal(report.current.passByCategory.null, 100);
    assert.deepEqual([...supabase.signalRanges].sort((a, b) => a - b), [0, 0, 200]);
  });
}

main();
