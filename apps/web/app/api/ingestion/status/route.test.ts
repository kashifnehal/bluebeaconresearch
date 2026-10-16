import assert from "node:assert/strict";

import { handleIngestionStatus } from "./route";

function runTest(name: string, fn: () => Promise<void>) {
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

function clientsWith(email: string | null) {
  return async () =>
    email === null
      ? { user: null, supabaseAuth: {}, supabase: {} }
      : { user: { id: "user-1", email }, supabaseAuth: {}, supabase: {} };
}

const ENV_KEYS = [
  "ADMIN_EMAILS",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
] as const;

const ARTICLE_AT = "2026-10-15T09:00:00.000Z";

const REDIS_STATUS = {
  lastFetchedAt: "2026-10-15T22:00:00.000Z",
  nextFetchEstimate: "2026-10-15T22:30:00.000Z",
  collectors: { rss: { budgetClosed: true }, gnews: { budgetClosed: true }, gdelt: { budgetClosed: true } },
  totals: { inserted: 0, signals: 0, fetched: 0 },
  intervalMinutes: 30,
};

function articleClient(behavior: "row" | "throw") {
  const calls: string[] = [];
  const supabase = {
    from(table: string) {
      calls.push(table);
      return {
        select(columns: string) {
          calls.push(columns);
          return {
            order(column: string, options: { ascending: boolean }) {
              calls.push(`${column}:${options.ascending}`);
              return {
                limit(count: number) {
                  calls.push(String(count));
                  return {
                    maybeSingle() {
                      if (behavior === "throw") return Promise.reject(new Error("read failed"));
                      return Promise.resolve({ data: { created_at: ARTICLE_AT }, error: null });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { supabase, calls };
}

async function main() {
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env.ADMIN_EMAILS = "admin@example.com";
  for (const key of ENV_KEYS) {
    if (key !== "ADMIN_EMAILS") delete process.env[key];
  }

  try {
    await runTest("anonymous caller gets 404", async () => {
      const res = await handleIngestionStatus({ getRouteSupabaseClients: async () => null });
      assert.equal(res.status, 404);
    });

    await runTest("signed-out user gets 404", async () => {
      const res = await handleIngestionStatus({
        getRouteSupabaseClients: clientsWith(null) as never,
      });
      assert.equal(res.status, 404);
    });

    await runTest("normal user gets 404", async () => {
      const res = await handleIngestionStatus({
        getRouteSupabaseClients: clientsWith("reader@example.com") as never,
      });
      assert.equal(res.status, 404);
    });

    await runTest("admin gets 200", async () => {
      const res = await handleIngestionStatus({
        getRouteSupabaseClients: clientsWith("admin@example.com") as never,
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { degraded: boolean; newestStoredArticleAt: string | null };
      assert.equal(body.degraded, true);
      assert.equal(body.newestStoredArticleAt, null);
    });

    await runTest("admin response returns the newest raw_events created_at", async () => {
      const db = articleClient("row");
      const res = await handleIngestionStatus({
        getRouteSupabaseClients: clientsWith("admin@example.com") as never,
        createServiceClient: () => db.supabase,
        readRedisPipeline: async () => ({ status: REDIS_STATUS, source: "redis" }),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        status: { lastFetchedAt: string };
        cronIntervalMinutes: number;
        degraded: boolean;
        reason: string | null;
        newestStoredArticleAt: string | null;
      };
      assert.equal(body.newestStoredArticleAt, ARTICLE_AT);
      assert.equal(body.status.lastFetchedAt, REDIS_STATUS.lastFetchedAt);
      assert.equal(body.cronIntervalMinutes, 30);
      assert.equal(body.degraded, false);
      assert.equal(body.reason, null);
      assert.deepEqual(db.calls, ["raw_events", "created_at", "created_at:false", "1"]);
    });

    await runTest("admin response returns null when the raw_events read throws", async () => {
      const db = articleClient("throw");
      const res = await handleIngestionStatus({
        getRouteSupabaseClients: clientsWith("admin@example.com") as never,
        createServiceClient: () => db.supabase,
        readRedisPipeline: async () => ({ status: REDIS_STATUS, source: "redis" }),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        status: { lastFetchedAt: string };
        degraded: boolean;
        reason: string | null;
        newestStoredArticleAt: string | null;
      };
      assert.equal(body.newestStoredArticleAt, null);
      assert.equal(body.status.lastFetchedAt, REDIS_STATUS.lastFetchedAt);
      assert.equal(body.degraded, false);
      assert.equal(body.reason, null);
    });
  } finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

void main();
