import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

import {
  claimBudgetClosedAlertUtcDate,
  maybeSendBudgetClosedAlert,
} from "./budget-closed-alert.js";

// Injected Redis and email fakes — no Resend, Anthropic, or Redis network calls.
process.env.ADMIN_EMAILS = "founder@example.com";

const PAUSED_BODY =
  "Collection and classification are paused until 00:00 UTC. News older than the source's recent window (RSS keeps about 4 hours) may be missed. To continue today, raise ANTHROPIC_DAILY_BUDGET_USD_INGESTION on the Railway workers service.";

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

async function main() {
  await runTest("first closed budget of the UTC day sends exactly one email", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    const outcome = await maybeSendBudgetClosedAlert({
      redis,
      email,
      now: new Date("2026-10-06T12:00:00Z"),
      spentUsd: 1.85,
      capUsd: 2,
    });
    assert.equal(outcome, "sent");
    assert.equal(email.calls.length, 1);
    assert.equal(email.calls[0]?.to, "founder@example.com");
    assert.equal(email.calls[0]?.subject, "BBR: daily classification budget reached");
    const text = `2026-10-06 (UTC)\n\n$1.85/$2.00\n\n${PAUSED_BODY}`;
    const html = `<p>2026-10-06 (UTC)</p><p>$1.85/$2.00</p><p>${PAUSED_BODY}</p>`;
    assert.equal(email.calls[0]?.text, text);
    assert.equal(email.calls[0]?.html, html);
    assert.equal(redis.sets.length, 1);
    assert.equal(redis.sets[0]?.key, "alert:budget-closed:2026-10-06");
    assert.equal(redis.sets[0]?.value, "1");
    assert.equal(redis.sets[0]?.exFlag, "EX");
    assert.equal(redis.sets[0]?.seconds, 129600);
    assert.equal(redis.sets[0]?.nxFlag, "NX");
  });

  await runTest("a second call the same UTC day returns already_sent_today", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    const first = await maybeSendBudgetClosedAlert({
      redis,
      email,
      now: new Date("2026-10-06T12:00:00Z"),
      spentUsd: 2,
      capUsd: 2,
    });
    const second = await maybeSendBudgetClosedAlert({
      redis,
      email,
      now: new Date("2026-10-06T18:00:00Z"),
      spentUsd: 2,
      capUsd: 2,
    });
    assert.equal(first, "sent");
    assert.equal(second, "already_sent_today");
    assert.equal(email.calls.length, 1);
    assert.equal(redis.sets.length, 2);
  });

  await runTest("Redis missing returns redis_unavailable and sends nothing", async () => {
    const email = fakeEmail();
    const outcome = await maybeSendBudgetClosedAlert({
      redis: null,
      email,
      now: new Date("2026-10-06T12:00:00Z"),
      spentUsd: 2,
      capUsd: 2,
    });
    assert.equal(outcome, "redis_unavailable");
    assert.equal(email.calls.length, 0);
  });

  await runTest("no ADMIN_EMAILS returns no_recipients and sends nothing", async () => {
    const prev = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "";
    try {
      const redis = fakeRedis();
      const email = fakeEmail();
      const outcome = await maybeSendBudgetClosedAlert({
        redis,
        email,
        now: new Date("2026-10-06T12:00:00Z"),
        spentUsd: 2,
        capUsd: 2,
      });
      assert.equal(outcome, "no_recipients");
      assert.equal(email.calls.length, 0);
      assert.equal(redis.store.has("alert:budget-closed:2026-10-06"), true);
    } finally {
      process.env.ADMIN_EMAILS = prev;
    }
  });

  await runTest("email send failure returns send_failed", async () => {
    const redis = fakeRedis();
    const email = fakeEmail({ sent: false, reason: "resend_down" });
    const outcome = await maybeSendBudgetClosedAlert({
      redis,
      email,
      now: new Date("2026-10-06T12:00:00Z"),
      spentUsd: 2,
      capUsd: 2,
    });
    assert.equal(outcome, "send_failed");
    assert.equal(email.calls.length, 1);
  });

  await runTest("the in-process memo prevents a second Redis call the same UTC day", async () => {
    const redis = fakeRedis();
    const email = fakeEmail();
    // Same gate isAnthropicBudgetAvailable uses before maybeSendBudgetClosedAlert().
    async function onIngestionBudgetClosed(date: string, now: Date) {
      if (!claimBudgetClosedAlertUtcDate(date)) return;
      await maybeSendBudgetClosedAlert({ redis, email, now, spentUsd: 2, capUsd: 2 });
    }
    await onIngestionBudgetClosed("2026-11-01", new Date("2026-11-01T12:00:00Z"));
    await onIngestionBudgetClosed("2026-11-01", new Date("2026-11-01T18:00:00Z"));
    assert.equal(redis.sets.length, 1);
    assert.equal(email.calls.length, 1);
    await onIngestionBudgetClosed("2026-11-02", new Date("2026-11-02T00:30:00Z"));
    assert.equal(redis.sets.length, 2);
    assert.equal(email.calls.length, 2);
  });
}

main();
