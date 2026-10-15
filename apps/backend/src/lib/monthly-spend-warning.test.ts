import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";
process.env.NODE_ENV = "test";
delete process.env.ANTHROPIC_MONTHLY_LIMIT_USD;

import { checkMonthlySpend } from "./monthly-spend-warning.js";

const TTL = 35 * 24 * 60 * 60;

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

type UsageRow = { usage_date: string; bucket: string; estimated_usd: number };

function fakeRedis() {
  const store = new Map<string, string>();
  const sets: Array<{ key: string; seconds: number }> = [];
  return {
    store,
    sets,
    async set(key: string, value: string, _ex: "EX", seconds: number, _nx: "NX") {
      sets.push({ key, seconds });
      if (store.has(key)) return null;
      store.set(key, value);
      return "OK" as const;
    },
  };
}

function fakeEmail() {
  const calls: Array<{ to: string; subject: string; html: string; text: string }> = [];
  return {
    calls,
    async send(opts: { to: string; subject: string; html: string; text: string }) {
      calls.push(opts);
      return { sent: true as const, id: "fake-id" };
    },
  };
}

function fakeSupabase(rows: UsageRow[]) {
  const tables: string[] = [];
  return {
    tables,
    from(table: string) {
      tables.push(table);
      if (table === "anthropic_daily_usage") {
        let start = "";
        let end = "";
        const filters = {
          gte(_col: string, value: string) {
            start = value;
            return filters;
          },
          lt(_col: string, value: string) {
            end = value;
            return filters;
          },
          then(resolve: (value: { data: UsageRow[]; error: null }) => unknown) {
            const data = rows.filter((r) => r.usage_date >= start && r.usage_date < end);
            return Promise.resolve({ data, error: null }).then(resolve);
          },
        };
        return {
          select() {
            return filters;
          },
        };
      }
      const health = {
        select() {
          return health;
        },
        eq() {
          return health;
        },
        gte() {
          return health;
        },
        limit() {
          return Promise.resolve({ data: [], error: null });
        },
        insert() {
          return Promise.resolve({ error: null });
        },
      };
      return health;
    },
  };
}

function deps(redis: ReturnType<typeof fakeRedis> | null, email = fakeEmail()) {
  return {
    redis,
    email,
    recipients: () => ["founder@example.com"],
  };
}

async function main() {
  await runTest("env unset does not query and does not email", async () => {
    delete process.env.ANTHROPIC_MONTHLY_LIMIT_USD;
    const supabase = fakeSupabase([]);
    const email = fakeEmail();
    const result = await checkMonthlySpend(supabase, new Date("2026-10-15T12:00:00Z"), deps(fakeRedis(), email));
    assert.equal(result.status, "disabled");
    assert.deepEqual(supabase.tables, []);
    assert.equal(email.calls.length, 0);
  });

  await runTest("49% sends no email", async () => {
    process.env.ANTHROPIC_MONTHLY_LIMIT_USD = "100";
    const email = fakeEmail();
    const redis = fakeRedis();
    const result = await checkMonthlySpend(
      fakeSupabase([{ usage_date: "2026-10-02", bucket: "ingestion", estimated_usd: 49 }]),
      new Date("2026-10-15T12:00:00Z"),
      deps(redis, email),
    );
    assert.equal(result.status, "checked");
    assert.equal(email.calls.length, 0);
    assert.equal(redis.store.size, 0);
  });

  await runTest("50% sends one email and a repeat sends none", async () => {
    process.env.ANTHROPIC_MONTHLY_LIMIT_USD = "100";
    const email = fakeEmail();
    const redis = fakeRedis();
    const supabase = () =>
      fakeSupabase([{ usage_date: "2026-10-02", bucket: "ingestion", estimated_usd: 50 }]);
    const now = new Date("2026-10-15T12:00:00Z");
    const first = await checkMonthlySpend(supabase(), now, deps(redis, email));
    assert.deepEqual(first.status === "checked" ? first.emailedLevels : [], [50]);
    assert.equal(email.calls.length, 1);
    assert.equal(email.calls[0]?.subject, "BBR: estimated Anthropic spend at 50% of the monthly limit");
    assert.match(email.calls[0]?.text ?? "", /BBR's own estimate from logged calls/);
    assert.match(email.calls[0]?.text ?? "", /only calls BBR logs/);
    assert.match(email.calls[0]?.text ?? "", /Console may count more/);
    assert.match(email.calls[0]?.text ?? "", /2026-10/);
    assert.match(email.calls[0]?.text ?? "", /\$50\.00/);
    assert.match(email.calls[0]?.text ?? "", /\$100\.00/);
    assert.match(email.calls[0]?.text ?? "", /Raise the limit in the Console or lower the daily cap/);
    assert.doesNotMatch(email.calls[0]?.text ?? "", /buy|sell/i);
    assert.equal(redis.sets[0]?.key, "bbr:monthly-spend:2026-10:50");
    assert.equal(redis.sets[0]?.seconds, TTL);

    const second = await checkMonthlySpend(supabase(), now, deps(redis, email));
    assert.deepEqual(second.status === "checked" ? second.emailedLevels : [], []);
    assert.equal(email.calls.length, 1);
  });

  await runTest("90% sends a second email for the new level", async () => {
    process.env.ANTHROPIC_MONTHLY_LIMIT_USD = "100";
    const email = fakeEmail();
    const redis = fakeRedis();
    const now = new Date("2026-10-15T12:00:00Z");
    await checkMonthlySpend(
      fakeSupabase([{ usage_date: "2026-10-02", bucket: "ingestion", estimated_usd: 50 }]),
      now,
      deps(redis, email),
    );
    const at90 = await checkMonthlySpend(
      fakeSupabase([{ usage_date: "2026-10-11", bucket: "ingestion", estimated_usd: 90 }]),
      now,
      deps(redis, email),
    );
    assert.deepEqual(at90.status === "checked" ? at90.emailedLevels : [], [90]);
    assert.equal(email.calls.length, 2);
    assert.equal(email.calls[1]?.subject, "BBR: estimated Anthropic spend at 90% of the monthly limit");
    assert.equal(redis.store.has("bbr:monthly-spend:2026-10:90"), true);
  });

  await runTest("a new UTC month uses a different dedupe key", async () => {
    process.env.ANTHROPIC_MONTHLY_LIMIT_USD = "100";
    const email = fakeEmail();
    const redis = fakeRedis();
    const rows = [{ usage_date: "2026-10-02", bucket: "ingestion", estimated_usd: 50 }];
    await checkMonthlySpend(fakeSupabase(rows), new Date("2026-10-31T23:00:00Z"), deps(redis, email));
    // November rows are a different month; the fake filters on usage_date.
    const november = [{ usage_date: "2026-11-01", bucket: "ingestion", estimated_usd: 50 }];
    await checkMonthlySpend(fakeSupabase(november), new Date("2026-11-02T00:00:00Z"), deps(redis, email));
    assert.equal(redis.store.has("bbr:monthly-spend:2026-10:50"), true);
    assert.equal(redis.store.has("bbr:monthly-spend:2026-11:50"), true);
    assert.equal(email.calls.length, 2);
  });

  await runTest("Redis down sends no email", async () => {
    process.env.ANTHROPIC_MONTHLY_LIMIT_USD = "100";
    const email = fakeEmail();
    const result = await checkMonthlySpend(
      fakeSupabase([{ usage_date: "2026-10-02", bucket: "ingestion", estimated_usd: 90 }]),
      new Date("2026-10-15T12:00:00Z"),
      deps(null, email),
    );
    assert.equal(result.status, "checked");
    assert.equal(email.calls.length, 0);
  });

  await runTest("the month sum includes chat and shadow buckets", async () => {
    process.env.ANTHROPIC_MONTHLY_LIMIT_USD = "100";
    const email = fakeEmail();
    const result = await checkMonthlySpend(
      fakeSupabase([
        { usage_date: "2026-10-01", bucket: "ingestion", estimated_usd: 20 },
        { usage_date: "2026-10-02", bucket: "chat", estimated_usd: 20 },
        { usage_date: "2026-10-03", bucket: "shadow", estimated_usd: 15 },
        { usage_date: "2026-09-30", bucket: "ingestion", estimated_usd: 80 },
      ]),
      new Date("2026-10-15T12:00:00Z"),
      deps(fakeRedis(), email),
    );
    assert.equal(result.status, "checked");
    if (result.status === "checked") assert.equal(result.sumUsd, 55);
    assert.equal(email.calls.length, 1);
    assert.match(email.calls[0]?.text ?? "", /\$55\.00/);
    assert.equal(email.calls[0]?.subject, "BBR: estimated Anthropic spend at 50% of the monthly limit");
  });
}

main();
