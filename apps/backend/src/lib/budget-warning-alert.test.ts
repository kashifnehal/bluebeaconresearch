import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

import { checkBudgetNearCap } from "./budget-warning-alert.js";

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

function assertNoPersonalData(text: string, html: string) {
  assert.equal(EMAIL_IN_BODY.test(text), false);
  assert.equal(EMAIL_IN_BODY.test(html), false);
}

const NOW = new Date("2026-10-16T15:00:00.000Z");

async function main() {
  await runTest("sends when spend is at 80% and the cap is still open", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    const outcome = await checkBudgetNearCap({
      redis,
      email,
      now: NOW,
      spentUsd: 1.6,
      capUsd: 2,
    });
    assert.equal(outcome, "sent");
    assert.equal(email.calls.length, 1);
    assert.equal(email.calls[0]?.subject, "BBR: Daily AI budget is 80% used");
    assert.match(email.calls[0]?.text ?? "", /\$1\.60 of \$2\.00/);
    assert.match(email.calls[0]?.text ?? "", /2026-10-16T15:00:00.000Z/);
    assert.equal(redis.sets[0]?.key, "alert:budget-warning:2026-10-16");
    assert.equal(redis.sets[0]?.seconds, 129600);
    assert.equal(redis.sets[0]?.nxFlag, "NX");
    assertNoPersonalData(email.calls[0]?.text ?? "", email.calls[0]?.html ?? "");
  });

  await runTest("does not send twice the same UTC day", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    const first = await checkBudgetNearCap({
      redis,
      email,
      now: NOW,
      spentUsd: 1.6,
      capUsd: 2,
    });
    const second = await checkBudgetNearCap({
      redis,
      email,
      now: new Date("2026-10-16T18:00:00Z"),
      spentUsd: 1.8,
      capUsd: 2,
    });
    assert.equal(first, "sent");
    assert.equal(second, "already_sent_today");
    assert.equal(email.calls.length, 1);
  });

  await runTest("does not send below 80%", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    const outcome = await checkBudgetNearCap({
      redis,
      email,
      now: NOW,
      spentUsd: 1.59,
      capUsd: 2,
    });
    assert.equal(outcome, "below_threshold");
    assert.equal(email.calls.length, 0);
    assert.equal(redis.sets.length, 0);
  });

  await runTest("does not send when the daily budget is closed", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    const outcome = await checkBudgetNearCap({
      redis,
      email,
      now: NOW,
      spentUsd: 2,
      capUsd: 2,
    });
    assert.equal(outcome, "budget_closed");
    assert.equal(email.calls.length, 0);
    assert.equal(redis.sets.length, 0);
  });

  await runTest("does not send without Redis", async () => {
    const email = fakeEmail();
    const outcome = await checkBudgetNearCap({
      redis: null,
      email,
      now: NOW,
      spentUsd: 1.6,
      capUsd: 2,
    });
    assert.equal(outcome, "redis_unavailable");
    assert.equal(email.calls.length, 0);
  });

  await runTest("email body has no personal data", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    await checkBudgetNearCap({
      redis,
      email,
      now: NOW,
      spentUsd: 1.6,
      capUsd: 2,
    });
    assert.equal(email.calls.length, 1);
    assertNoPersonalData(email.calls[0]?.text ?? "", email.calls[0]?.html ?? "");
    assert.equal((email.calls[0]?.text ?? "").includes("founder@example.com"), false);
    assert.equal((email.calls[0]?.html ?? "").includes("founder@example.com"), false);
  });
}

main();
