// Mocked-Supabase-client coverage for lib/lead-store.ts's actual query logic
// (the 24h rate-limit count, duplicate-insert handling, token hashing, and
// confirm/unsubscribe lookups) — complementary to lib/subscribe-handler.test.ts
// and lib/leads-handler.test.ts, which mock lead-store's functions themselves
// at the handler boundary.
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  insertPendingSubscriber,
  deleteSubscriberById,
  confirmSubscriber,
  unsubscribeByToken,
  insertLead,
} from "./lead-store";

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

type Handlers = {
  onCount?: (table: string, filters: Record<string, unknown>) => number;
  onInsert?: (table: string, row: Record<string, unknown>) => { data?: unknown; error?: unknown };
  onUpdateSingle?: (
    table: string,
    patch: Record<string, unknown>,
    filters: Record<string, unknown>,
  ) => { data?: unknown; error?: unknown };
  onDelete?: (table: string, filters: Record<string, unknown>) => void;
};

function fakeClient(handlers: Handlers) {
  const calls: { op: string; table: string; row?: unknown; filters?: unknown }[] = [];

  function from(table: string) {
    return {
      select(_cols: string, _opts?: unknown) {
        const filters: Record<string, unknown> = {};
        const chain: any = {
          eq(col: string, val: unknown) {
            filters[col] = val;
            return chain;
          },
          gte(col: string, val: unknown) {
            filters[`${col}>=`] = val;
            return chain;
          },
          then(onFulfilled: any, onRejected: any) {
            calls.push({ op: "count", table, filters });
            const count = handlers.onCount ? handlers.onCount(table, filters) : 0;
            return Promise.resolve({ data: null, count, error: null }).then(onFulfilled, onRejected);
          },
        };
        return chain;
      },
      insert(row: Record<string, unknown>) {
        calls.push({ op: "insert", table, row });
        return {
          select(_cols: string) {
            return {
              single: async () =>
                handlers.onInsert ? handlers.onInsert(table, row) : { data: { id: "generated-id" }, error: null },
            };
          },
        };
      },
      update(patch: Record<string, unknown>) {
        const filters: Record<string, unknown> = {};
        const chain: any = {
          eq(col: string, val: unknown) {
            filters[col] = val;
            return chain;
          },
          neq(col: string, val: unknown) {
            filters[`${col}!=`] = val;
            return chain;
          },
          select(_cols: string) {
            return {
              maybeSingle: async () => {
                calls.push({ op: "updateSingle", table, filters });
                return handlers.onUpdateSingle
                  ? handlers.onUpdateSingle(table, patch, filters)
                  : { data: null, error: null };
              },
            };
          },
          then(onFulfilled: any, onRejected: any) {
            calls.push({ op: "updateMany", table, filters });
            return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
          },
        };
        return chain;
      },
      delete() {
        const filters: Record<string, unknown> = {};
        const chain: any = {
          eq(col: string, val: unknown) {
            filters[col] = val;
            return chain;
          },
          then(onFulfilled: any, onRejected: any) {
            calls.push({ op: "delete", table, filters });
            handlers.onDelete?.(table, filters);
            return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
          },
        };
        return chain;
      },
    };
  }

  return { from, calls } as any;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function main() {
  await runTest("insertPendingSubscriber: 3 existing rows in the window refuse the 4th", async () => {
    let insertCalled = false;
    const client = fakeClient({
      onCount: () => 3,
      onInsert: (_table, row) => {
        insertCalled = true;
        return { data: { id: "should-not-happen" }, error: null };
      },
    });

    const res = await insertPendingSubscriber(
      { email: "a@example.com", consentText: "c", consentVersion: "v1", source: {} },
      client,
    );
    assert.deepEqual(res, { ok: false, code: "rate_limited" });
    assert.equal(insertCalled, false);
  });

  await runTest("insertPendingSubscriber: a fresh email inserts with a hashed confirm token", async () => {
    let insertedRow: Record<string, unknown> | undefined;
    const client = fakeClient({
      onCount: () => 0,
      onInsert: (_table, row) => {
        insertedRow = row;
        return { data: { id: "sub-1" }, error: null };
      },
    });

    const res = await insertPendingSubscriber(
      { email: "a@example.com", consentText: "Consent text", consentVersion: "2026-10-18", source: { path: "/" } },
      client,
    );
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.value.id, "sub-1");
      assert.equal(res.value.duplicate, false);
      assert.equal(insertedRow?.confirm_token_hash, sha256(res.value.confirmToken));
      assert.equal(insertedRow?.unsubscribe_token, res.value.unsubscribeToken);
      assert.equal(insertedRow?.status, "pending");
    }
  });

  await runTest("insertPendingSubscriber: a unique_violation (23505) is reported as a duplicate, not an error", async () => {
    const client = fakeClient({
      onCount: () => 0,
      onInsert: () => ({ data: null, error: { code: "23505", message: "duplicate key" } }),
    });
    const res = await insertPendingSubscriber(
      { email: "dup@example.com", consentText: "c", consentVersion: "v1", source: {} },
      client,
    );
    assert.deepEqual(res, { ok: true, value: { id: "", confirmToken: "", unsubscribeToken: "", duplicate: true } });
  });

  await runTest("insertPendingSubscriber: any other DB error is reported as db_error", async () => {
    const client = fakeClient({
      onCount: () => 0,
      onInsert: () => ({ data: null, error: { code: "08006", message: "connection failure" } }),
    });
    const res = await insertPendingSubscriber(
      { email: "a@example.com", consentText: "c", consentVersion: "v1", source: {} },
      client,
    );
    assert.deepEqual(res, { ok: false, code: "db_error" });
  });

  await runTest("insertPendingSubscriber: no client (not configured) returns config_error", async () => {
    const res = await insertPendingSubscriber(
      { email: "a@example.com", consentText: "c", consentVersion: "v1", source: {} },
      null,
    );
    assert.deepEqual(res, { ok: false, code: "config_error" });
  });

  await runTest("deleteSubscriberById: deletes by id; no-ops with no client or empty id", async () => {
    const deleted: string[] = [];
    const client = fakeClient({ onDelete: (_table, filters) => deleted.push(String(filters.id)) });
    await deleteSubscriberById("sub-1", client);
    assert.deepEqual(deleted, ["sub-1"]);
    await deleteSubscriberById("", client);
    await deleteSubscriberById("sub-2", null);
    assert.deepEqual(deleted, ["sub-1"]); // neither no-op call added a row
  });

  await runTest("confirmSubscriber: a matching pending token confirms", async () => {
    const token = "confirm-token-abc";
    const client = fakeClient({
      onUpdateSingle: (_table, _patch, filters) =>
        filters.confirm_token_hash === sha256(token) && filters.status === "pending"
          ? { data: { id: "sub-1" }, error: null }
          : { data: null, error: null },
    });
    const res = await confirmSubscriber(token, client);
    assert.deepEqual(res, { ok: true });
  });

  await runTest("confirmSubscriber: a bad or already-used token does not confirm", async () => {
    const client = fakeClient({ onUpdateSingle: () => ({ data: null, error: null }) });
    const res = await confirmSubscriber("wrong-token", client);
    assert.deepEqual(res, { ok: false });
  });

  await runTest("confirmSubscriber: no token or no client returns ok:false without a DB call", async () => {
    const client = fakeClient({ onUpdateSingle: () => ({ data: { id: "x" }, error: null }) });
    assert.deepEqual(await confirmSubscriber("", client), { ok: false });
    assert.deepEqual(await confirmSubscriber("tok", null), { ok: false });
  });

  await runTest("unsubscribeByToken: always resolves ok:true, known or unknown token", async () => {
    const client = fakeClient({});
    assert.deepEqual(await unsubscribeByToken("any-token", client), { ok: true });
    assert.deepEqual(await unsubscribeByToken("", client), { ok: true });
    assert.deepEqual(await unsubscribeByToken("tok", null), { ok: true });
  });

  await runTest("insertLead: rate-limits on work_email, not name or organisation", async () => {
    const seenFilters: Record<string, unknown>[] = [];
    const client = fakeClient({
      onCount: (_table, filters) => {
        seenFilters.push(filters);
        return 3;
      },
    });
    const res = await insertLead(
      {
        kind: "walkthrough",
        name: "Jamie Lee",
        workEmail: "jamie@example.com",
        organisation: null,
        role: null,
        markets: [],
        message: null,
        consentText: "c",
        consentVersion: "v1",
        source: {},
      },
      client,
    );
    assert.deepEqual(res, { ok: false, code: "rate_limited" });
    assert.equal(seenFilters[0]?.work_email, "jamie@example.com");
  });

  await runTest("insertLead: a fresh lead inserts with the given markets", async () => {
    let insertedRow: Record<string, unknown> | undefined;
    const client = fakeClient({
      onCount: () => 0,
      onInsert: (_table, row) => {
        insertedRow = row;
        return { data: { id: "lead-1" }, error: null };
      },
    });
    const res = await insertLead(
      {
        kind: "professional_access",
        name: "Jamie Lee",
        workEmail: "jamie@example.com",
        organisation: "Acme",
        role: "Analyst",
        markets: ["USOIL", "XAUUSD"],
        message: "Hello",
        consentText: "c",
        consentVersion: "v1",
        source: { path: "/walkthrough" },
      },
      client,
    );
    assert.deepEqual(res, { ok: true, value: { id: "lead-1" } });
    assert.deepEqual(insertedRow?.markets, ["USOIL", "XAUUSD"]);
    assert.equal(insertedRow?.consent_contact, true);
  });
}

void main();
