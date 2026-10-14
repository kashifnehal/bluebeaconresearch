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

function req(symbol: string) {
  const params = new URLSearchParams({
    symbol,
    from: "2026-01-01T00:00:00.000Z",
    to: "2026-01-08T00:00:00.000Z",
  });
  return new NextRequest(`https://app.example.com/api/signals/driver-breakdown?${params}`);
}

// No Supabase credentials in this process: a known symbol stops at the
// existing no-client return ({ rows: [], error: "unavailable" }, 200).
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_AUTH_URL;
process.env.RATE_LIMIT_SAFE_MODE = "true";

async function main() {
  await runTest("symbol=COFFEE returns 200 with a rows array", async () => {
    const res = await GET(req("COFFEE"));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(Array.isArray(json.rows));
  });

  await runTest("symbol=NOTREAL still returns 400", async () => {
    const res = await GET(req("NOTREAL"));
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error, "unknown symbol");
  });

  await runTest("symbol=USOIL still returns 200 with a rows array", async () => {
    const res = await GET(req("USOIL"));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(Array.isArray(json.rows));
    assert.notEqual(json.error, "unknown symbol");
  });
}

void main();
