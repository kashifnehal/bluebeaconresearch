import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "./route";

function runTest(name: string, fn: () => Promise<void> | void) {
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

// Mock the data layer the same way apps/web/app/api/cot/route.test.ts does:
// getRouteSupabaseClients() returns null with no Supabase env configured, so
// the real handler takes its deterministic "unconfigured" branch.
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_AUTH_URL;
process.env.RATE_LIMIT_SAFE_MODE = "true";

async function main() {
  await runTest(
    "the response is private, no-store — the feed is gated on the requester's own session and supports ?personalized=true",
    async () => {
      const res = await GET(new NextRequest("https://app.example.com/api/signals"));
      assert.equal(res.headers.get("cache-control"), "private, no-store");
    },
  );

  await runTest("a personalized request is also private, no-store", async () => {
    const res = await GET(new NextRequest("https://app.example.com/api/signals?personalized=true"));
    assert.equal(res.headers.get("cache-control"), "private, no-store");
  });
}

void main();
