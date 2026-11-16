import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://abcdefghijkl.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

import { requestSupabaseRestart } from "./supabase-restart.js";

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

function fakeFetchStatus(status: number): typeof fetch {
  return (async () => new Response(null, { status })) as unknown as typeof fetch;
}

function throwingFetch(message: string): typeof fetch {
  return (async () => {
    throw new Error(message);
  }) as unknown as typeof fetch;
}

const TOKEN = "sbp_test_token_abcdef123456";

async function main() {
  await runTest("missing token returns ok:false without calling fetch", async () => {
    let called = false;
    const result = await requestSupabaseRestart({
      fetchImpl: (async () => {
        called = true;
        return new Response(null, { status: 200 });
      }) as unknown as typeof fetch,
    });
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /SUPABASE_ACCESS_TOKEN/);
    assert.equal(called, false);
  });

  await runTest("a 200 response returns ok:true with the status", async () => {
    const result = await requestSupabaseRestart({ token: TOKEN, fetchImpl: fakeFetchStatus(200) });
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
  });

  await runTest("a 401 response returns ok:false with the status, never throws", async () => {
    const result = await requestSupabaseRestart({ token: TOKEN, fetchImpl: fakeFetchStatus(401) });
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
  });

  await runTest("a 429 response returns ok:false with the status, never throws", async () => {
    const result = await requestSupabaseRestart({ token: TOKEN, fetchImpl: fakeFetchStatus(429) });
    assert.equal(result.ok, false);
    assert.equal(result.status, 429);
  });

  await runTest("a thrown fetch returns ok:false with a describeError()'d message, never throws", async () => {
    const result = await requestSupabaseRestart({
      token: TOKEN,
      fetchImpl: throwingFetch("network down"),
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, undefined);
    assert.match(result.error ?? "", /network down/);
  });

  await runTest("projectRef is derived from the first label of SUPABASE_URL's hostname", async () => {
    let seenUrl = "";
    await requestSupabaseRestart({
      token: TOKEN,
      fetchImpl: (async (url: any) => {
        seenUrl = String(url);
        return new Response(null, { status: 200 });
      }) as unknown as typeof fetch,
    });
    assert.equal(seenUrl, "https://api.supabase.com/v1/projects/abcdefghijkl/restart");
  });

  await runTest("the token string never appears in a returned ok or error value", async () => {
    // requestSupabaseRestart only ever places the token in the Authorization
    // header, which it builds itself — none of its own return paths (ok, status,
    // or describeError() text from a network failure) can echo it back.
    const results = await Promise.all([
      requestSupabaseRestart({ token: TOKEN, fetchImpl: fakeFetchStatus(200) }),
      requestSupabaseRestart({ token: TOKEN, fetchImpl: fakeFetchStatus(401) }),
      requestSupabaseRestart({ token: TOKEN, fetchImpl: throwingFetch("network down") }),
    ]);
    for (const r of results) {
      assert.equal(JSON.stringify(r).includes(TOKEN), false);
    }
  });
}

main();
