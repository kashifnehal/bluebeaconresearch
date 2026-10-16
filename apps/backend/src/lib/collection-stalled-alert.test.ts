import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

import { checkCollectionStalled } from "./collection-stalled-alert.js";

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

const NOW = new Date("2026-10-16T15:00:00Z");
const STALLED_AT = new Date("2026-10-16T13:00:00Z");
const FRESH_AT = new Date("2026-10-16T14:30:00Z");

async function main() {
  await runTest("sends when budget is open and newest row is older than 90 minutes", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    const outcome = await checkCollectionStalled({
      redis,
      email,
      now: NOW,
      spentUsd: 0.4,
      capUsd: 2,
      newestCreatedAt: STALLED_AT,
    });
    assert.equal(outcome, "sent");
    assert.equal(email.calls.length, 1);
    assert.equal(email.calls[0]?.subject, "BBR: Collection looks stalled");
    assert.match(email.calls[0]?.text ?? "", /120 minutes old/);
    assert.match(email.calls[0]?.text ?? "", /\$0\.40/);
    assert.equal(redis.sets[0]?.key, "alert:collection-stalled:2026-10-16");
    assert.equal(redis.sets[0]?.seconds, 129600);
    assert.equal(redis.sets[0]?.nxFlag, "NX");
    assertNoPersonalData(email.calls[0]?.text ?? "", email.calls[0]?.html ?? "");
  });

  await runTest("does not send twice the same UTC day", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    const first = await checkCollectionStalled({
      redis,
      email,
      now: NOW,
      spentUsd: 0.4,
      capUsd: 2,
      newestCreatedAt: STALLED_AT,
    });
    const second = await checkCollectionStalled({
      redis,
      email,
      now: new Date("2026-10-16T18:00:00Z"),
      spentUsd: 0.4,
      capUsd: 2,
      newestCreatedAt: STALLED_AT,
    });
    assert.equal(first, "sent");
    assert.equal(second, "already_sent_today");
    assert.equal(email.calls.length, 1);
  });

  await runTest("does not send when the daily budget is closed", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    const outcome = await checkCollectionStalled({
      redis,
      email,
      now: NOW,
      spentUsd: 2,
      capUsd: 2,
      newestCreatedAt: STALLED_AT,
    });
    assert.equal(outcome, "budget_closed");
    assert.equal(email.calls.length, 0);
    assert.equal(redis.sets.length, 0);
  });

  await runTest("does not send without Redis", async () => {
    const email = fakeEmail();
    const outcome = await checkCollectionStalled({
      redis: null,
      email,
      now: NOW,
      spentUsd: 0.4,
      capUsd: 2,
      newestCreatedAt: STALLED_AT,
    });
    assert.equal(outcome, "redis_unavailable");
    assert.equal(email.calls.length, 0);
  });

  await runTest("does not send when newest row is younger than 90 minutes", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    const outcome = await checkCollectionStalled({
      redis,
      email,
      now: NOW,
      spentUsd: 0.4,
      capUsd: 2,
      newestCreatedAt: FRESH_AT,
    });
    assert.equal(outcome, "not_stalled");
    assert.equal(email.calls.length, 0);
    assert.equal(redis.sets.length, 0);
  });

  await runTest("email body has no personal data", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    await checkCollectionStalled({
      redis,
      email,
      now: NOW,
      spentUsd: 0.4,
      capUsd: 2,
      newestCreatedAt: STALLED_AT,
    });
    assert.equal(email.calls.length, 1);
    assertNoPersonalData(email.calls[0]?.text ?? "", email.calls[0]?.html ?? "");
    assert.equal((email.calls[0]?.text ?? "").includes("founder@example.com"), false);
    assert.equal((email.calls[0]?.html ?? "").includes("founder@example.com"), false);
  });
}

main();
