import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { handleSubscribePost, type SubscribePostDeps } from "./subscribe-handler";

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

function jsonReq(body: unknown) {
  return new NextRequest("https://app.example.com/api/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PASS_RATE_LIMIT = async () => ({ success: true });
const VALID_BODY = { email: "reader@example.com", consent: true, t: Date.now() - 10_000 };

async function main() {
  await runTest("a valid sign-up inserts and sends, returning 200", async () => {
    const deletedIds: string[] = [];
    const sent: unknown[] = [];
    const deps: Partial<SubscribePostDeps> = {
      rateLimit: PASS_RATE_LIMIT,
      insertPendingSubscriber: async () => ({
        ok: true,
        value: { id: "sub-1", confirmToken: "ctok", unsubscribeToken: "utok", duplicate: false },
      }),
      deleteSubscriberById: async (id) => {
        deletedIds.push(id);
      },
      sendConfirmation: async (email, confirmUrl, unsubscribeUrl) => {
        sent.push({ email, confirmUrl, unsubscribeUrl });
        return { sent: true, id: "mail-1" };
      },
    };
    const res = await handleSubscribePost(jsonReq(VALID_BODY), deps);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(sent.length, 1);
    assert.equal(deletedIds.length, 0);
  });

  await runTest("no API key: mail is not sent, the pending row is deleted, and the response is 503", async () => {
    const deletedIds: string[] = [];
    const deps: Partial<SubscribePostDeps> = {
      rateLimit: PASS_RATE_LIMIT,
      insertPendingSubscriber: async () => ({
        ok: true,
        value: { id: "sub-2", confirmToken: "ctok", unsubscribeToken: "utok", duplicate: false },
      }),
      deleteSubscriberById: async (id) => {
        deletedIds.push(id);
      },
      sendConfirmation: async () => ({ sent: false, reason: "no_api_key" }),
    };
    const res = await handleSubscribePost(jsonReq(VALID_BODY), deps);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error.message, "Sign-up is not available right now. Please try again later.");
    assert.deepEqual(deletedIds, ["sub-2"]);
  });

  await runTest("an email that already exists returns the same 200 success, with no mail sent", async () => {
    const sent: unknown[] = [];
    const deps: Partial<SubscribePostDeps> = {
      rateLimit: PASS_RATE_LIMIT,
      insertPendingSubscriber: async () => ({
        ok: true,
        value: { id: "", confirmToken: "", unsubscribeToken: "", duplicate: true },
      }),
      sendConfirmation: async () => {
        sent.push(true);
        return { sent: true, id: "mail-1" };
      },
    };
    const res = await handleSubscribePost(jsonReq(VALID_BODY), deps);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(sent.length, 0);
  });

  await runTest("a 4th sign-up attempt for the same email within 24h is refused", async () => {
    const deps: Partial<SubscribePostDeps> = {
      rateLimit: PASS_RATE_LIMIT,
      insertPendingSubscriber: async () => ({ ok: false, code: "rate_limited" }),
    };
    const res = await handleSubscribePost(jsonReq(VALID_BODY), deps);
    assert.equal(res.status, 429);
  });

  await runTest("a malformed email is rejected before any DB call", async () => {
    let inserted = false;
    const deps: Partial<SubscribePostDeps> = {
      rateLimit: PASS_RATE_LIMIT,
      insertPendingSubscriber: async () => {
        inserted = true;
        return { ok: true, value: { id: "x", confirmToken: "c", unsubscribeToken: "u", duplicate: false } };
      },
    };
    const res = await handleSubscribePost(jsonReq({ email: "not-an-email", consent: true, t: Date.now() - 10_000 }), deps);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "invalid_email");
    assert.equal(inserted, false);
  });

  await runTest("IP rate limiting returns 429 before any DB call", async () => {
    let inserted = false;
    const deps: Partial<SubscribePostDeps> = {
      rateLimit: async () => ({ success: false }),
      insertPendingSubscriber: async () => {
        inserted = true;
        return { ok: true, value: { id: "x", confirmToken: "c", unsubscribeToken: "u", duplicate: false } };
      },
    };
    const res = await handleSubscribePost(jsonReq(VALID_BODY), deps);
    assert.equal(res.status, 429);
    assert.equal(inserted, false);
  });
}

void main();
