import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { handleUnsubscribeGet, handleUnsubscribePost, type UnsubscribeDeps } from "./unsubscribe-handler";

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

async function main() {
  await runTest("GET redirects to the page carrying the token (no DB write — the handler takes no store dependency)", () => {
    const req = new NextRequest("https://app.example.com/api/unsubscribe?t=abc123");
    const res = handleUnsubscribeGet(req);
    assert.equal(res.status, 307);
    assert.match(res.headers.get("location") ?? "", /\/unsubscribe\?t=abc123$/);
  });

  await runTest("a one-click POST (token in the query string, form-urlencoded body) unsubscribes", async () => {
    const calls: string[] = [];
    const deps: Partial<UnsubscribeDeps> = {
      unsubscribeByToken: async (token) => {
        calls.push(token);
        return { ok: true };
      },
    };
    const req = new NextRequest("https://app.example.com/api/unsubscribe?t=abc123", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    const res = await handleUnsubscribePost(req, deps);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, message: "You have been unsubscribed." });
    assert.deepEqual(calls, ["abc123"]);
  });

  await runTest("the page's own button POST (token in a JSON body) unsubscribes", async () => {
    const calls: string[] = [];
    const deps: Partial<UnsubscribeDeps> = {
      unsubscribeByToken: async (token) => {
        calls.push(token);
        return { ok: true };
      },
    };
    const req = new NextRequest("https://app.example.com/api/unsubscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: "xyz789" }),
    });
    const res = await handleUnsubscribePost(req, deps);
    assert.equal(res.status, 200);
    assert.deepEqual(calls, ["xyz789"]);
  });

  await runTest("an unknown token still returns 200 with the same message", async () => {
    const deps: Partial<UnsubscribeDeps> = {
      unsubscribeByToken: async () => ({ ok: true }),
    };
    const req = new NextRequest("https://app.example.com/api/unsubscribe?t=unknown-token", { method: "POST" });
    const res = await handleUnsubscribePost(req, deps);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, message: "You have been unsubscribed." });
  });
}

void main();
