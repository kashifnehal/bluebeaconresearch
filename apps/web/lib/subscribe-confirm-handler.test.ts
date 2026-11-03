import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { handleSubscribeConfirmGet, type SubscribeConfirmGetDeps } from "./subscribe-confirm-handler";

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

function req(token: string | null) {
  const qs = token != null ? `?t=${encodeURIComponent(token)}` : "";
  return new NextRequest(`https://app.example.com/api/subscribe/confirm${qs}`);
}

async function main() {
  await runTest("a good token confirms and redirects to /subscribe/confirmed", async () => {
    const deps: Partial<SubscribeConfirmGetDeps> = {
      confirmSubscriber: async (token) => ({ ok: token === "good-token" }),
    };
    const res = await handleSubscribeConfirmGet(req("good-token"), deps);
    assert.equal(res.status, 307);
    assert.match(res.headers.get("location") ?? "", /\/subscribe\/confirmed$/);
  });

  await runTest("a bad or already-used token redirects with state=invalid", async () => {
    const deps: Partial<SubscribeConfirmGetDeps> = {
      confirmSubscriber: async () => ({ ok: false }),
    };
    const res = await handleSubscribeConfirmGet(req("used-token"), deps);
    assert.equal(res.status, 307);
    assert.match(res.headers.get("location") ?? "", /\/subscribe\/confirmed\?state=invalid$/);
  });

  await runTest("a missing token redirects with state=invalid without calling confirmSubscriber", async () => {
    let called = false;
    const deps: Partial<SubscribeConfirmGetDeps> = {
      confirmSubscriber: async () => {
        called = true;
        return { ok: true };
      },
    };
    const res = await handleSubscribeConfirmGet(req(null), deps);
    assert.match(res.headers.get("location") ?? "", /state=invalid$/);
    assert.equal(called, false);
  });
}

void main();
