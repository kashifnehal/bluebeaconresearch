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
      const body = (await res.json()) as { degraded: boolean };
      assert.equal(body.degraded, true);
    });
  } finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

void main();
