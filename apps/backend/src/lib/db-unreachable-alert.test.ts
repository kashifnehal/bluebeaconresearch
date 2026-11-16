import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

import { checkDatabaseReachable } from "./db-unreachable-alert.js";

process.env.ADMIN_EMAILS = "founder@example.com";

const EMAIL_IN_BODY = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

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

function fakeRedis() {
  const store = new Map<string, string>();
  const lists = new Map<string, string[]>();
  const sets: Array<{ key: string; value: string; exFlag: string; seconds: number; nxFlag: string }> = [];
  return {
    store,
    lists,
    sets,
    async incr(key: string) {
      const current = Number(store.get(key) ?? "0") + 1;
      store.set(key, String(current));
      return current;
    },
    async expire(_key: string, _seconds: number) {
      return 1;
    },
    async set(key: string, value: string, exFlag: "EX", seconds: number, nxFlag: "NX") {
      sets.push({ key, value, exFlag, seconds, nxFlag });
      if (store.has(key)) return null;
      store.set(key, value);
      return "OK" as const;
    },
    async del(...keys: string[]) {
      let removed = 0;
      for (const k of keys) {
        if (store.delete(k)) removed++;
      }
      return removed;
    },
    async exists(...keys: string[]) {
      return keys.filter((k) => store.has(k)).length;
    },
    async get(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    async lpush(key: string, value: string) {
      const list = lists.get(key) ?? [];
      list.unshift(value);
      lists.set(key, list);
      return list.length;
    },
    async ltrim(key: string, start: number, stop: number) {
      const list = lists.get(key) ?? [];
      lists.set(key, list.slice(start, stop + 1));
      return "OK" as const;
    },
  };
}

function fakeEmail(sendResult: { sent: boolean; reason?: string } = { sent: true }) {
  const calls: Array<{ to: string; subject: string; html: string; text: string }> = [];
  return {
    calls,
    async send(opts: { to: string; subject: string; html: string; text: string }) {
      calls.push({ to: opts.to, subject: opts.subject, html: opts.html, text: opts.text });
      return sendResult.sent
        ? { sent: true as const, id: "fake-id" }
        : { sent: false as const, reason: sendResult.reason ?? "fake_failure" };
    },
  };
}

function okSupabase() {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            limit(_n: number) {
              return Promise.resolve({ data: [{ id: "sig-1" }], error: null });
            },
          };
        },
      };
    },
  };
}

function erroringSupabase() {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            limit(_n: number) {
              return Promise.resolve({ data: null, error: { message: "connection refused" } });
            },
          };
        },
      };
    },
  };
}

function hangingSupabase() {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            limit(_n: number) {
              return new Promise(() => {
                /* never resolves — exercises the timeout path */
              });
            },
          };
        },
      };
    },
  };
}

const NOW = new Date("2026-11-02T08:00:00Z");

async function main() {
  await runTest("success resets the counter", async () => {
    const redis = fakeRedis();
    await redis.incr("db-health:consecutive-failures");
    const email = fakeEmail();
    const outcome = await checkDatabaseReachable({ redis, email, now: NOW, supabase: okSupabase() });
    assert.equal(outcome, "ok");
    assert.equal(redis.store.has("db-health:consecutive-failures"), false);
    assert.equal(email.calls.length, 0);
  });

  await runTest("2 failures send nothing", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    const first = await checkDatabaseReachable({ redis, email, now: NOW, supabase: erroringSupabase() });
    const second = await checkDatabaseReachable({ redis, email, now: NOW, supabase: erroringSupabase() });
    assert.equal(first, "failure_recorded");
    assert.equal(second, "failure_recorded");
    assert.equal(email.calls.length, 0);
    assert.equal(redis.store.get("db-health:consecutive-failures"), "2");
  });

  await runTest("the 3rd failure sends one email", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    await checkDatabaseReachable({ redis, email, now: NOW, supabase: erroringSupabase() });
    await checkDatabaseReachable({ redis, email, now: NOW, supabase: erroringSupabase() });
    const third = await checkDatabaseReachable({ redis, email, now: NOW, supabase: erroringSupabase() });
    assert.equal(third, "sent");
    assert.equal(email.calls.length, 1);
    assert.equal(email.calls[0]?.subject, "BBR: database not reachable");
    assert.match(email.calls[0]?.text ?? "", /3 checks in a row/);
  });

  await runTest("the 4th failure inside 6 hours gives already_sent", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    await checkDatabaseReachable({ redis, email, now: NOW, supabase: erroringSupabase() });
    await checkDatabaseReachable({ redis, email, now: NOW, supabase: erroringSupabase() });
    await checkDatabaseReachable({ redis, email, now: NOW, supabase: erroringSupabase() });
    const fourth = await checkDatabaseReachable({ redis, email, now: NOW, supabase: erroringSupabase() });
    assert.equal(fourth, "already_sent");
    assert.equal(email.calls.length, 1);
  });

  await runTest("a timeout counts as a failure", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    const outcome = await checkDatabaseReachable({
      redis,
      email,
      now: NOW,
      supabase: hangingSupabase(),
      timeoutMs: 20,
    });
    assert.equal(outcome, "failure_recorded");
    assert.equal(redis.store.get("db-health:consecutive-failures"), "1");
    assert.equal(email.calls.length, 0);
  });

  await runTest("no Redis gives redis_unavailable and no email", async () => {
    const email = fakeEmail();
    const outcome = await checkDatabaseReachable({
      redis: null,
      email,
      now: NOW,
      supabase: erroringSupabase(),
    });
    assert.equal(outcome, "redis_unavailable");
    assert.equal(email.calls.length, 0);
  });

  await runTest("recovery sends once and clears the keys", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    const failAt = new Date("2026-11-02T06:00:00Z");
    await checkDatabaseReachable({ redis, email, now: failAt, supabase: erroringSupabase() });
    await checkDatabaseReachable({ redis, email, now: failAt, supabase: erroringSupabase() });
    await checkDatabaseReachable({ redis, email, now: failAt, supabase: erroringSupabase() });
    assert.equal(email.calls.length, 1);

    const recoveredAt = new Date("2026-11-02T08:00:00Z");
    const outcome = await checkDatabaseReachable({ redis, email, now: recoveredAt, supabase: okSupabase() });
    assert.equal(outcome, "recovered");
    assert.equal(email.calls.length, 2);
    assert.equal(email.calls[1]?.subject, "BBR: database reachable again");
    assert.match(email.calls[1]?.text ?? "", /First failure: 2026-11-02T06:00:00\.000Z \(UTC\)/);
    assert.equal(redis.store.has("alert:db-unreachable:sent"), false);
    assert.equal(redis.store.has("db-health:first-failure-at"), false);
    assert.equal(redis.store.has("db-health:consecutive-failures"), false);

    // A second clean check after recovery sends no further email.
    const again = await checkDatabaseReachable({ redis, email, now: recoveredAt, supabase: okSupabase() });
    assert.equal(again, "ok");
    assert.equal(email.calls.length, 2);
  });

  await runTest("onProbe receives ok true and a number for a fast probe", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    const probes: Array<{ ok: boolean; ms: number }> = [];
    const outcome = await checkDatabaseReachable({
      redis,
      email,
      now: NOW,
      supabase: okSupabase(),
      onProbe: (p) => probes.push(p),
    });
    assert.equal(outcome, "ok");
    assert.equal(probes.length, 1);
    assert.equal(probes[0]?.ok, true);
    assert.equal(typeof probes[0]?.ms, "number");
  });

  await runTest("onProbe receives ok false for a failing probe", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    const probes: Array<{ ok: boolean; ms: number }> = [];
    const outcome = await checkDatabaseReachable({
      redis,
      email,
      now: NOW,
      supabase: erroringSupabase(),
      onProbe: (p) => probes.push(p),
    });
    assert.equal(outcome, "failure_recorded");
    assert.equal(probes.length, 1);
    assert.equal(probes[0]?.ok, false);
    assert.equal(typeof probes[0]?.ms, "number");
  });

  await runTest("a throwing onProbe does not change the outcome", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    const outcome = await checkDatabaseReachable({
      redis,
      email,
      now: NOW,
      supabase: okSupabase(),
      onProbe: () => {
        throw new Error("boom");
      },
    });
    assert.equal(outcome, "ok");
  });

  await runTest("empty ADMIN_EMAILS gives no_recipients", async () => {
    const previous = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "";
    try {
      const redis = fakeRedis();
      const email = fakeEmail();
      await checkDatabaseReachable({ redis, email, now: NOW, supabase: erroringSupabase() });
      await checkDatabaseReachable({ redis, email, now: NOW, supabase: erroringSupabase() });
      const third = await checkDatabaseReachable({ redis, email, now: NOW, supabase: erroringSupabase() });
      assert.equal(third, "no_recipients");
      assert.equal(email.calls.length, 0);
    } finally {
      process.env.ADMIN_EMAILS = previous;
    }
  });

  await runTest("email body has no email-address-shaped personal data, but now carries the last error line (BE-DB-RES1)", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    await checkDatabaseReachable({ redis, email, now: NOW, supabase: erroringSupabase() });
    await checkDatabaseReachable({ redis, email, now: NOW, supabase: erroringSupabase() });
    await checkDatabaseReachable({ redis, email, now: NOW, supabase: erroringSupabase() });
    assert.equal(email.calls.length, 1);
    assert.equal(EMAIL_IN_BODY.test(email.calls[0]?.text ?? ""), false);
    assert.equal(EMAIL_IN_BODY.test(email.calls[0]?.html ?? ""), false);
    // BE-DB-RES1 deliberately adds the last error as a debugging aid — this used
    // to assert the opposite (error text withheld from the email); the task that
    // added probe error text explicitly asked for it to be included.
    assert.match(email.calls[0]?.text ?? "", /Last error: connection refused/);
  });

  // BE-DB-RES1 — probeDatabase's richer { ok, ms, error } result and the
  // db-health:history Redis list it feeds.
  await runTest("a successful probe pushes a history entry with ok:true and a numeric ms", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    await checkDatabaseReachable({ redis, email, now: NOW, supabase: okSupabase() });
    const pushed = redis.lists.get("db-health:history") ?? [];
    assert.equal(pushed.length, 1);
    const entry = JSON.parse(pushed[0]!);
    assert.equal(entry.ok, true);
    assert.equal(typeof entry.ms, "number");
    assert.equal(entry.error, undefined);
  });

  await runTest("a thrown-error probe pushes a history entry carrying the error text", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    await checkDatabaseReachable({ redis, email, now: NOW, supabase: erroringSupabase() });
    const pushed = redis.lists.get("db-health:history") ?? [];
    assert.equal(pushed.length, 1);
    const entry = JSON.parse(pushed[0]!);
    assert.equal(entry.ok, false);
    assert.equal(entry.error, "connection refused");
  });

  await runTest("a timed-out probe pushes a history entry saying 'timeout after'", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    await checkDatabaseReachable({ redis, email, now: NOW, supabase: hangingSupabase(), timeoutMs: 20 });
    const pushed = redis.lists.get("db-health:history") ?? [];
    assert.equal(pushed.length, 1);
    const entry = JSON.parse(pushed[0]!);
    assert.equal(entry.ok, false);
    assert.match(entry.error, /^timeout after 20 ms$/);
  });

  await runTest("a Redis history-push failure never changes the outcome", async () => {
    const redis = fakeRedis();
    const brokenRedis = {
      ...redis,
      async lpush(): Promise<number> {
        throw new Error("history push boom");
      },
    };
    const email = fakeEmail();
    const outcome = await checkDatabaseReachable({
      redis: brokenRedis,
      email,
      now: NOW,
      supabase: okSupabase(),
    });
    assert.equal(outcome, "ok");
  });

  await runTest("LTRIM keeps the history list at 2016 entries", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    for (let i = 0; i < 2020; i++) {
      await checkDatabaseReachable({ redis, email, now: NOW, supabase: okSupabase() });
    }
    const pushed = redis.lists.get("db-health:history") ?? [];
    assert.equal(pushed.length, 2016);
  });
}

main();
