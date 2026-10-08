import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import {
  getDailyBudgetUsd,
  isAnthropicBudgetAvailable,
} from "./anthropic-budget.js";

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

async function main() {
  // W8-BUDGET-DEFER (ADR 035, D10) — DEFAULT_DAILY_BUDGET_USD must stay $2 and the
  // env var names must stay as-is per the task's explicit "do not change the
  // default" instruction. This is a regression guard, not new behavior.
  runTest("getDailyBudgetUsd defaults to $2 when the env var is unset", () => {
    delete process.env.ANTHROPIC_DAILY_BUDGET_USD_INGESTION;
    delete process.env.ANTHROPIC_DAILY_BUDGET_USD_CHAT;
    assert.equal(getDailyBudgetUsd("ingestion"), 2);
    assert.equal(getDailyBudgetUsd("chat"), 2);
  });

  runTest("getDailyBudgetUsd reads ANTHROPIC_DAILY_BUDGET_USD_INGESTION/_CHAT when set", () => {
    process.env.ANTHROPIC_DAILY_BUDGET_USD_INGESTION = "5";
    process.env.ANTHROPIC_DAILY_BUDGET_USD_CHAT = "1.5";
    try {
      assert.equal(getDailyBudgetUsd("ingestion"), 5);
      assert.equal(getDailyBudgetUsd("chat"), 1.5);
    } finally {
      delete process.env.ANTHROPIC_DAILY_BUDGET_USD_INGESTION;
      delete process.env.ANTHROPIC_DAILY_BUDGET_USD_CHAT;
    }
  });

  runTest("getDailyBudgetUsd falls back to $2 for a non-numeric or non-positive value", () => {
    for (const bad of ["not-a-number", "0", "-5", ""]) {
      process.env.ANTHROPIC_DAILY_BUDGET_USD_INGESTION = bad;
      try {
        assert.equal(getDailyBudgetUsd("ingestion"), 2, `expected default for ${JSON.stringify(bad)}`);
      } finally {
        delete process.env.ANTHROPIC_DAILY_BUDGET_USD_INGESTION;
      }
    }
  });

  // isAnthropicBudgetAvailable's real counter read goes through getSupabaseAdmin()
  // (SUPABASE_URL=http://127.0.0.1:9 here, the discard port — nothing ever listens
  // there, so the connect fails fast regardless of what else is running locally),
  // so every call below
  // deterministically hits the catch block's fail-open/fail-closed branch — this
  // repo's test runner (plain tsx + node:assert) has no module-mocking facility to
  // inject a fake Supabase row instead (see spend-limit-alert.test.ts and
  // claude.service.test.ts's own comments on the same constraint). This still
  // exercises the real, documented safety property: non-production fails open
  // (don't block ingestion on a transient counter-read error), production fails
  // closed (never guess the budget is available when the read itself is broken).
  await runTest(
    "isAnthropicBudgetAvailable fails OPEN (true) outside production when the usage-counter read errors",
    async () => {
      const prev = process.env.NODE_ENV;
      process.env.NODE_ENV = "test";
      try {
        const available = await isAnthropicBudgetAvailable("ingestion");
        assert.equal(available, true);
      } finally {
        process.env.NODE_ENV = prev;
      }
    },
  );

  await runTest(
    "isAnthropicBudgetAvailable fails CLOSED (false) in production when the usage-counter read errors — this is the state classifyEvent()'s budget_closed/deferred path relies on",
    async () => {
      const prev = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        const available = await isAnthropicBudgetAvailable("ingestion");
        assert.equal(available, false);
      } finally {
        process.env.NODE_ENV = prev;
      }
    },
  );
}

main();
