import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

import { checkSignalSilence } from "./signal-silence-alert.js";

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
  const sets: Array<{ key: string; value: string; exFlag: string; seconds: number; nxFlag: string }> = [];
  return {
    store,
    sets,
    async set(key: string, value: string, exFlag: "EX", seconds: number, nxFlag: "NX") {
      sets.push({ key, value, exFlag, seconds, nxFlag });
      if (store.has(key)) return null;
      store.set(key, value);
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

function countRecentSignals(count: number) {
  const calls: number[] = [];
  return {
    calls,
    fn: async (hours: number) => {
      calls.push(hours);
      return count;
    },
  };
}

const NOW = new Date("2026-10-27T15:00:00.000Z");

async function main() {
  await runTest("zero signals in 24h sends exactly one email", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    const counter = countRecentSignals(0);
    const outcome = await checkSignalSilence({
      redis,
      email,
      now: NOW,
      countRecentSignals: counter.fn,
    });
    assert.equal(outcome, "sent");
    assert.equal(email.calls.length, 1);
    assert.equal(email.calls[0]?.subject, "BBR: no new signals in 24 hours");
    assert.match(email.calls[0]?.text ?? "", /no new signals/i);
    assert.deepEqual(counter.calls, [24]);
    assert.equal(redis.sets[0]?.key, "alert:signal-silence:2026-10-27");
    assert.equal(redis.sets[0]?.seconds, 129600);
    assert.equal(redis.sets[0]?.nxFlag, "NX");
  });

  await runTest("a repeated zero-signal check the same UTC day does not send twice", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    const first = await checkSignalSilence({
      redis,
      email,
      now: NOW,
      countRecentSignals: countRecentSignals(0).fn,
    });
    const second = await checkSignalSilence({
      redis,
      email,
      now: new Date("2026-10-27T21:00:00Z"),
      countRecentSignals: countRecentSignals(0).fn,
    });
    assert.equal(first, "sent");
    assert.equal(second, "already_sent_today");
    assert.equal(email.calls.length, 1);
  });

  await runTest("signals present means no email and no Redis write", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    const outcome = await checkSignalSilence({
      redis,
      email,
      now: NOW,
      countRecentSignals: countRecentSignals(75).fn,
    });
    assert.equal(outcome, "signals_present");
    assert.equal(email.calls.length, 0);
    assert.equal(redis.sets.length, 0);
  });

  await runTest("Redis unavailable sends no email and does not throw", async () => {
    const email = fakeEmail();
    const outcome = await checkSignalSilence({
      redis: null,
      email,
      now: NOW,
      countRecentSignals: countRecentSignals(0).fn,
    });
    assert.equal(outcome, "redis_unavailable");
    assert.equal(email.calls.length, 0);
  });

  await runTest("a signal-count query error sends no email and does not throw", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    const outcome = await checkSignalSilence({
      redis,
      email,
      now: NOW,
      countRecentSignals: async () => {
        throw new Error("relation \"signals\" does not exist");
      },
    });
    assert.equal(outcome, "query_failed");
    assert.equal(email.calls.length, 0);
    assert.equal(redis.sets.length, 0);
  });

  await runTest("no ADMIN_EMAILS configured means dedupe flag is still claimed but no email is sent", async () => {
    const prev = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "";
    try {
      const redis = fakeRedis();
      const email = fakeEmail();
      const outcome = await checkSignalSilence({
        redis,
        email,
        now: NOW,
        countRecentSignals: countRecentSignals(0).fn,
      });
      assert.equal(outcome, "no_recipients");
      assert.equal(email.calls.length, 0);
    } finally {
      process.env.ADMIN_EMAILS = prev;
    }
  });
}

main();
