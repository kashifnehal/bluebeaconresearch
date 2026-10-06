import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { POST, type EventsPostDeps } from "./route";

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

const USER_ID = "11111111-1111-1111-1111-111111111111";

function jsonReq(body: unknown) {
  return new NextRequest("https://app.example.com/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fakeDb() {
  const inserts: { table: string; row: unknown }[] = [];
  const fromCalls: string[] = [];
  const supabase = {
    from(table: string) {
      fromCalls.push(table);
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        limit() {
          return Promise.resolve({ data: [], error: null });
        },
        insert(row: unknown) {
          inserts.push({ table, row });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { inserts, fromCalls, supabase };
}

function clients(
  user: { id: string } | null,
  db: ReturnType<typeof fakeDb>,
): EventsPostDeps["getClients"] {
  return (async () => ({
    supabase: db.supabase,
    supabaseAuth: db.supabase,
    user,
  })) as EventsPostDeps["getClients"];
}

async function main() {
  await runTest("allowed call writes the event", async () => {
    const db = fakeDb();
    const rateLimitCalls: unknown[][] = [];
    const res = await POST(jsonReq({ eventType: "dashboard_viewed", metadata: { page: "dashboard" } }), {
      getClients: clients({ id: USER_ID }, db),
      rateLimit: async (...args) => {
        rateLimitCalls.push(args);
        return { success: true };
      },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { inserted: true });
    assert.deepEqual(rateLimitCalls, [[`events:${USER_ID}`]]);
    assert.equal(db.inserts.length, 1);
    assert.deepEqual(db.inserts[0], {
      table: "events",
      row: {
        user_id: USER_ID,
        event_type: "dashboard_viewed",
        metadata: { page: "dashboard" },
      },
    });
  });

  await runTest("limited call returns 429 and writes nothing", async () => {
    const db = fakeDb();
    const res = await POST(jsonReq({ eventType: "dashboard_viewed" }), {
      getClients: clients({ id: USER_ID }, db),
      rateLimit: async () => ({ success: false }),
    });

    assert.equal(res.status, 429);
    assert.deepEqual(await res.json(), {
      error: { code: "rate_limited", message: "rate_limited" },
    });
    assert.equal(db.inserts.length, 0);
    assert.equal(db.fromCalls.length, 0);
  });

  await runTest("no session returns 401 and does not call the limiter", async () => {
    const db = fakeDb();
    let rateLimitCalls = 0;
    const res = await POST(jsonReq({ eventType: "dashboard_viewed" }), {
      getClients: clients(null, db),
      rateLimit: async () => {
        rateLimitCalls += 1;
        return { success: true };
      },
    });

    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), {
      error: { code: "unauthorized", message: "unauthorized" },
    });
    assert.equal(rateLimitCalls, 0);
    assert.equal(db.inserts.length, 0);
    assert.equal(db.fromCalls.length, 0);
  });
}

main();
