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
  return new NextRequest(`https://app.example.com/api/signals/pulse${qs ? `?${qs}` : ""}`);
}

delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_AUTH_URL;
process.env.RATE_LIMIT_SAFE_MODE = "true";

async function main() {
  await runTest("symbol=USOIL returns 200 unavailable without a client", async () => {
    const res = await GET(req("USOIL"));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.error, "unavailable");
  });

  await runTest("symbol=EURUSD returns 200 unavailable without a client", async () => {
    const res = await GET(req("EURUSD"));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.error, "unavailable");
  });

  await runTest("symbol=COFFEE returns 200 unavailable without a client", async () => {
    const res = await GET(req("COFFEE"));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.error, "unavailable");
  });

  await runTest("symbol=VEG_OILS returns 200 unavailable without a client", async () => {
    const res = await GET(req("VEG_OILS"));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.error, "unavailable");
  });

  await runTest("symbol=NOTREAL returns 400", async () => {
    const res = await GET(req("NOTREAL"));
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error, "unknown symbol");
  });

  await runTest("a missing symbol is all-assets mode, not an error", async () => {
    const res = await GET(req(null));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.error, "unavailable");
  });

  await runTest("an empty symbol value (present but blank) is still an error", async () => {
    const res = await GET(req(""));
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error, "symbol is required");
  });
}

void main();
