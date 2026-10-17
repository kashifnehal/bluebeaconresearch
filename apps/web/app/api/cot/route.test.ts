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

function req(symbol: string | null) {
  const params = new URLSearchParams();
  if (symbol != null) params.set("symbol", symbol);
  const qs = params.toString();
  return new NextRequest(`https://app.example.com/api/cot${qs ? `?${qs}` : ""}`);
}

delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_AUTH_URL;
process.env.RATE_LIMIT_SAFE_MODE = "true";

async function main() {
  await runTest("a missing symbol returns 400", async () => {
    const res = await GET(req(null));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "symbol is required");
  });

  await runTest("an unknown symbol returns 400", async () => {
    const res = await GET(req("NOTREAL"));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "unknown symbol");
  });

  await runTest("a known symbol without a database client returns available:false, 200, no-store", async () => {
    const res = await GET(req("usoil"));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal((await res.json()).available, false);
  });
}

void main();
