import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";
process.env.NODE_ENV = "test";

import { recordServiceHealth } from "./service-health.js";

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

function fakeSupabase(missingColumn = false) {
  const inserts: Array<Record<string, unknown>> = [];
  return {
    inserts,
    from() {
      return {
        insert: async (row: Record<string, unknown>) => {
          inserts.push(row);
          if (missingColumn && Object.prototype.hasOwnProperty.call(row, "raw_event_id")) {
            return {
              error: {
                code: "PGRST204",
                message:
                  "Could not find the 'raw_event_id' column of 'service_health_events' in the schema cache",
              },
            };
          }
          return { error: null };
        },
      };
    },
  };
}

async function main() {
  await runTest("the writer includes raw_event_id when given", async () => {
    const supabase = fakeSupabase();
    await recordServiceHealth("materiality_gate", "rejected", "title", undefined, {
      supabase,
      rawEventId: "11111111-1111-1111-1111-111111111111",
    });
    assert.equal(supabase.inserts.length, 1);
    assert.equal(supabase.inserts[0]?.raw_event_id, "11111111-1111-1111-1111-111111111111");
  });

  await runTest("the writer leaves raw_event_id out when not given", async () => {
    const supabase = fakeSupabase();
    await recordServiceHealth("gdelt", "ok", "fetched", 12, { supabase });
    assert.equal(supabase.inserts.length, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(supabase.inserts[0], "raw_event_id"), false);
    assert.equal(supabase.inserts[0]?.latency_ms, 12);
  });

  await runTest("a missing raw_event_id column retries once without the column", async () => {
    const supabase = fakeSupabase(true);
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (message?: unknown) => {
      warnings.push(String(message));
    };
    try {
      await recordServiceHealth("materiality_gate", "rejected", "title", undefined, {
        supabase,
        rawEventId: "22222222-2222-2222-2222-222222222222",
      });
      await recordServiceHealth("materiality_gate", "rejected", "title", undefined, {
        supabase,
        rawEventId: "33333333-3333-3333-3333-333333333333",
      });
    } finally {
      console.warn = original;
    }
    assert.equal(supabase.inserts.length, 4);
    assert.equal(supabase.inserts[0]?.raw_event_id, "22222222-2222-2222-2222-222222222222");
    assert.equal(Object.prototype.hasOwnProperty.call(supabase.inserts[1], "raw_event_id"), false);
    assert.equal(supabase.inserts[1]?.service, "materiality_gate");
    assert.equal(Object.prototype.hasOwnProperty.call(supabase.inserts[3], "raw_event_id"), false);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0] ?? "", /retrying without it/);
  });
}

main();
