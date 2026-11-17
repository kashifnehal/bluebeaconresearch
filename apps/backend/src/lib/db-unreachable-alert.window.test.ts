import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

import {
  checkDatabaseReachable,
  isProbeBad,
  shouldRestartFromHistory,
  DB_PROBE_HISTORY_KEY,
} from "./db-unreachable-alert.js";

process.env.ADMIN_EMAILS = "founder@example.com";

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
  return {
    store,
    lists,
    async incr(key: string) {
      const current = Number(store.get(key) ?? "0") + 1;
      store.set(key, String(current));
      return current;
    },
    async expire(_key: string, _seconds: number) {
      return 1;
    },
    async set(key: string, value: string, _exFlag: "EX", _seconds: number, _nxFlag: "NX") {
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
    async lrange(key: string, start: number, stop: number) {
      const list = lists.get(key) ?? [];
      return list.slice(start, stop + 1);
    },
  };
}

function fakeEmail() {
  const calls: Array<{ to: string; subject: string; html: string; text: string }> = [];
  return {
    calls,
    async send(opts: { to: string; subject: string; html: string; text: string }) {
      calls.push({ to: opts.to, subject: opts.subject, html: opts.html, text: opts.text });
      return { sent: true as const, id: "fake-id" };
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

const NOW = new Date("2026-11-17T08:00:00Z");
const TEST_TOKEN = "test-token-123456";
const okFetch = (async () => new Response(null, { status: 200 })) as unknown as typeof fetch;

async function withRestartEnv<T>(
  opts: { flag?: string; token?: string; fetchImpl?: typeof fetch },
  fn: () => Promise<T>,
): Promise<T> {
  const prevFlag = process.env.SUPABASE_AUTO_RESTART;
  const prevToken = process.env.SUPABASE_ACCESS_TOKEN;
  const prevFetch = globalThis.fetch;
  if (opts.flag === undefined) delete process.env.SUPABASE_AUTO_RESTART;
  else process.env.SUPABASE_AUTO_RESTART = opts.flag;
  if (opts.token === undefined) delete process.env.SUPABASE_ACCESS_TOKEN;
  else process.env.SUPABASE_ACCESS_TOKEN = opts.token;
  if (opts.fetchImpl) globalThis.fetch = opts.fetchImpl;
  try {
    return await fn();
  } finally {
    if (prevFlag === undefined) delete process.env.SUPABASE_AUTO_RESTART;
    else process.env.SUPABASE_AUTO_RESTART = prevFlag;
    if (prevToken === undefined) delete process.env.SUPABASE_ACCESS_TOKEN;
    else process.env.SUPABASE_ACCESS_TOKEN = prevToken;
    globalThis.fetch = prevFetch;
  }
}

// oldest -> newest; 8 bad (B), 4 good (G); last two are G then B so the
// consecutive-failure counter is only 1 right after the 12th (triggering) call.
const FLAPPING_PATTERN = ["B", "B", "G", "B", "B", "G", "B", "B", "G", "B", "G", "B"] as const;

async function runPattern(
  redis: ReturnType<typeof fakeRedis>,
  email: ReturnType<typeof fakeEmail>,
  pattern: readonly string[],
) {
  let outcome = "";
  for (const step of pattern) {
    outcome = await checkDatabaseReachable({
      redis,
      email,
      now: NOW,
      supabase: step === "B" ? erroringSupabase() : okSupabase(),
    });
  }
  return outcome;
}

async function main() {
  // --- isProbeBad ---
  await runTest("isProbeBad: ok and fast is not bad", () => {
    assert.equal(isProbeBad({ ok: true, ms: 10 }), false);
  });

  await runTest("isProbeBad: ok at 3999ms is not bad", () => {
    assert.equal(isProbeBad({ ok: true, ms: 3999 }), false);
  });

  await runTest("isProbeBad: ok at 4000ms is bad", () => {
    assert.equal(isProbeBad({ ok: true, ms: 4000 }), true);
  });

  await runTest("isProbeBad: a failed probe is bad regardless of ms", () => {
    assert.equal(isProbeBad({ ok: false, ms: 5 }), true);
  });

  // --- shouldRestartFromHistory (pure) ---
  await runTest("shouldRestartFromHistory: 8 bad of 12 is true", () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({ ok: i >= 8, ms: 10 }));
    assert.equal(entries.filter(isProbeBad).length, 8);
    assert.equal(shouldRestartFromHistory(entries), true);
  });

  await runTest("shouldRestartFromHistory: 7 bad of 12 is false", () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({ ok: i >= 7, ms: 10 }));
    assert.equal(entries.filter(isProbeBad).length, 7);
    assert.equal(shouldRestartFromHistory(entries), false);
  });

  await runTest("shouldRestartFromHistory: fewer than 12 entries is false", () => {
    const entries = Array.from({ length: 11 }, () => ({ ok: false, ms: 10 }));
    assert.equal(shouldRestartFromHistory(entries), false);
  });

  // --- integration: checkDatabaseReachable wires the window trigger in ---
  await runTest(
    "flapping 8-of-12 requests a restart while the consecutive counter is only 1",
    async () => {
      await withRestartEnv({ flag: "on", token: TEST_TOKEN, fetchImpl: okFetch }, async () => {
        const redis = fakeRedis();
        const email = fakeEmail();
        const outcome = await runPattern(redis, email, FLAPPING_PATTERN);
        assert.equal(outcome, "restart_requested");
        assert.equal(redis.store.get("db-health:consecutive-failures"), "1");
        assert.equal(redis.store.has("db-health:restart:cooldown"), true);
        const restartEmails = email.calls.filter((c) => c.subject.includes("restart"));
        assert.equal(restartEmails.length, 1);
        assert.match(restartEmails[0]!.text, /flapping/);
      });
    },
  );

  await runTest("a bad JSON history entry is skipped, not counted, and never throws", async () => {
    await withRestartEnv({ flag: "on", token: TEST_TOKEN, fetchImpl: okFetch }, async () => {
      const redis = fakeRedis();
      const email = fakeEmail();
      // 7 valid bad + 1 malformed + 3 valid good, seeded directly (bypassing the
      // real push path). The 12th (triggering) call below adds one more bad
      // entry, for 8 valid bad total — but only 11 parse successfully, one
      // short of the 12-entry window, so no restart should fire.
      const seeded = [
        ...Array.from({ length: 7 }, (_, i) => JSON.stringify({ at: NOW.toISOString(), ok: false, ms: i })),
        "{not valid json",
        ...Array.from({ length: 3 }, (_, i) => JSON.stringify({ at: NOW.toISOString(), ok: true, ms: i })),
      ];
      redis.lists.set(DB_PROBE_HISTORY_KEY, seeded);

      const outcome = await checkDatabaseReachable({ redis, email, now: NOW, supabase: erroringSupabase() });
      assert.notEqual(outcome, "restart_requested");
      assert.equal(redis.store.has("db-health:restart:cooldown"), false);
    });
  });

  await runTest("a second flapping trigger inside the cooldown does not restart again", async () => {
    await withRestartEnv({ flag: "on", token: TEST_TOKEN, fetchImpl: okFetch }, async () => {
      const redis = fakeRedis();
      const email = fakeEmail();
      const first = await runPattern(redis, email, FLAPPING_PATTERN);
      assert.equal(first, "restart_requested");
      const restartEmailsAfterFirst = email.calls.filter((c) => c.subject.includes("restart")).length;

      // One more bad probe: still 8 bad in the newest 12 (drops the oldest "B",
      // adds a new "B"), so the window condition is true again — but the
      // cooldown should block a second restart.
      const second = await checkDatabaseReachable({ redis, email, now: NOW, supabase: erroringSupabase() });
      assert.equal(second, "failure_recorded");
      const restartEmailsAfterSecond = email.calls.filter((c) => c.subject.includes("restart")).length;
      assert.equal(restartEmailsAfterSecond, restartEmailsAfterFirst);
      assert.equal(redis.store.get("db-health:restart:day:2026-11-17"), "1");
    });
  });

  await runTest("flapping 8-of-12 with the flag off never requests a restart", async () => {
    await withRestartEnv({ flag: undefined, token: TEST_TOKEN, fetchImpl: okFetch }, async () => {
      const redis = fakeRedis();
      const email = fakeEmail();
      const outcome = await runPattern(redis, email, FLAPPING_PATTERN);
      assert.notEqual(outcome, "restart_requested");
      assert.equal(redis.store.has("db-health:restart:cooldown"), false);
      assert.equal(email.calls.some((c) => c.subject.includes("restart")), false);
    });
  });
}

main();
