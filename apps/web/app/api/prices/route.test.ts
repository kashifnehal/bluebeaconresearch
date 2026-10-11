import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { SYMBOLS, GET } from "./route";

function runTest(name: string, fn: () => void | Promise<void>) {
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

// W7-ASSET-LISTS: USDINR added to the Tier-2 Redis-fallback symbol list.
runTest("SYMBOLS includes USDINR exactly once", () => {
  assert.equal(SYMBOLS.filter((s) => s === "USDINR").length, 1);
});

runTest("SYMBOLS has no duplicates", () => {
  assert.equal(new Set(SYMBOLS).size, SYMBOLS.length);
});

// Tier-1 now reads through getRouteSupabaseClients() (lib/supabase-server.ts)
// instead of a cookie client built from the raw project URL — this route has
// no env-configured Supabase/Redis in the test process, so it should fall
// through both tiers cleanly rather than throwing.
void runTest("GET does not throw with no Supabase/Redis configured", async () => {
  const res = await GET(new NextRequest("https://app.example.com/api/prices"));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.deepEqual(json.prices, []);
});
