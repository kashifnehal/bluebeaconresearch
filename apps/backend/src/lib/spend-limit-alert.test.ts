import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

import { maybeSendSpendLimitAlert } from "./spend-limit-alert.js";

// W5-SPEND-ALERT — these tests inject fake Redis/email clients via maybeSendSpendLimitAlert's
// `deps` parameter (see spend-limit-alert.ts) instead of mocking modules: this repo's test
// runner is plain tsx + node:assert (grepped: no jest/vitest/sinon anywhere in this backend),
// so there is no module-mocking facility to reach for. These tests must not call Resend or
// Anthropic — the fake email client below never makes a network call, and nothing here touches
// claude.service.ts's classifyEvent() at all.
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

// Minimal fake of the one ioredis method this feature uses (SET key val EX secs NX),
// backed by a plain in-memory map so each test can assert on exactly what was set.
function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    async set(key: string, value: string, ..._rest: unknown[]) {
      // Real NX semantics: only succeed if the key is not already present.
      if (store.has(key)) return null;
      store.set(key, value);
      return "OK";
    },
  };
}

function fakeEmail(sendResult: { sent: boolean; reason?: string } = { sent: true }) {
  const calls: Array<{ to: string; subject: string }> = [];
  return {
    calls,
    async send(opts: { to: string; subject: string; html: string; text: string }) {
      calls.push({ to: opts.to, subject: opts.subject });
      return sendResult.sent
        ? { sent: true as const, id: "fake-id" }
        : { sent: false as const, reason: sendResult.reason ?? "fake_failure" };
    },
  };
}

async function main() {
  await runTest(
    "first spend-limit error of the UTC day sends exactly one email",
    async () => {
      const redis = fakeRedis();
      const email = fakeEmail();
      const outcome = await maybeSendSpendLimitAlert({ redis, email, now: new Date("2026-10-01T12:00:00Z") });
      assert.equal(outcome, "sent");
      assert.equal(email.calls.length, 1);
      assert.equal(email.calls[0]?.to, "founder@example.com");
      assert.equal(email.calls[0]?.subject, "BBR: Anthropic spend limit reached");
    },
  );

  await runTest(
    "a second spend-limit error the same UTC day does not send another email",
    async () => {
      const redis = fakeRedis();
      const email = fakeEmail();
      const first = await maybeSendSpendLimitAlert({ redis, email, now: new Date("2026-10-01T12:00:00Z") });
      const second = await maybeSendSpendLimitAlert({ redis, email, now: new Date("2026-10-01T18:00:00Z") });
      assert.equal(first, "sent");
      assert.equal(second, "already_sent_today");
      assert.equal(email.calls.length, 1, "only the first call of the day should have sent an email");
    },
  );

  await runTest(
    "a spend-limit error on a later UTC day sends again (separate dedupe key)",
    async () => {
      const redis = fakeRedis();
      const email = fakeEmail();
      await maybeSendSpendLimitAlert({ redis, email, now: new Date("2026-10-01T23:59:00Z") });
      const nextDay = await maybeSendSpendLimitAlert({ redis, email, now: new Date("2026-10-02T00:01:00Z") });
      assert.equal(nextDay, "sent");
      assert.equal(email.calls.length, 2);
    },
  );

  await runTest(
    "Redis unreachable sends no email and does not throw",
    async () => {
      const email = fakeEmail();
      const outcome = await maybeSendSpendLimitAlert({ redis: null, email, now: new Date("2026-10-01T12:00:00Z") });
      assert.equal(outcome, "redis_unavailable");
      assert.equal(email.calls.length, 0, "no email may be sent when the dedupe store can't be checked");
    },
  );

  await runTest(
    "a Redis SET that throws sends no email and does not throw out of maybeSendSpendLimitAlert",
    async () => {
      const email = fakeEmail();
      const throwingRedis = {
        async set() {
          throw new Error("ECONNRESET");
        },
      };
      const outcome = await maybeSendSpendLimitAlert({ redis: throwingRedis, email, now: new Date("2026-10-01T12:00:00Z") });
      assert.equal(outcome, "redis_error");
      assert.equal(email.calls.length, 0);
    },
  );

  await runTest(
    "no ADMIN_EMAILS configured means the dedupe flag is still claimed but no email is sent",
    async () => {
      const prev = process.env.ADMIN_EMAILS;
      process.env.ADMIN_EMAILS = "";
      try {
        const redis = fakeRedis();
        const email = fakeEmail();
        const outcome = await maybeSendSpendLimitAlert({ redis, email, now: new Date("2026-10-01T12:00:00Z") });
        assert.equal(outcome, "no_recipients");
        assert.equal(email.calls.length, 0);
      } finally {
        process.env.ADMIN_EMAILS = prev;
      }
    },
  );
}

main();
