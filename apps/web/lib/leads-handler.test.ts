import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { handleLeadsPost, type LeadsPostDeps } from "./leads-handler";

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
  return new NextRequest("https://app.example.com/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PASS_RATE_LIMIT = async () => ({ success: true });
const VALID_BODY = {
  kind: "walkthrough",
  name: "Jamie Lee",
  workEmail: "jamie@example.com",
  organisation: "Acme Trading",
  role: "Analyst",
  markets: ["USOIL"],
  message: "Interested in energy coverage.",
  consentContact: true,
  t: Date.now() - 10_000,
};

async function main() {
  await runTest("a valid lead is inserted, a notification is sent, and 200 is returned", async () => {
    const notified: unknown[] = [];
    const deps: Partial<LeadsPostDeps> = {
      rateLimit: PASS_RATE_LIMIT,
      insertLead: async () => ({ ok: true, value: { id: "lead-1" } }),
      notifyNewLead: async (lead) => {
        notified.push(lead);
        return { sent: true, id: "mail-1" };
      },
    };
    const res = await handleLeadsPost(jsonReq(VALID_BODY), deps);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(notified.length, 1);
  });

  await runTest("a notification failure still returns 200 — the lead is already saved", async () => {
    const deps: Partial<LeadsPostDeps> = {
      rateLimit: PASS_RATE_LIMIT,
      insertLead: async () => ({ ok: true, value: { id: "lead-2" } }),
      notifyNewLead: async () => {
        throw new Error("boom");
      },
    };
    const res = await handleLeadsPost(jsonReq(VALID_BODY), deps);
    assert.equal(res.status, 200);
  });

  await runTest("a 4th lead for the same work email within 24h is refused", async () => {
    const deps: Partial<LeadsPostDeps> = {
      rateLimit: PASS_RATE_LIMIT,
      insertLead: async () => ({ ok: false, code: "rate_limited" }),
    };
    const res = await handleLeadsPost(jsonReq(VALID_BODY), deps);
    assert.equal(res.status, 429);
  });

  await runTest("an unconfigured store returns 503 with a safe message", async () => {
    const deps: Partial<LeadsPostDeps> = {
      rateLimit: PASS_RATE_LIMIT,
      insertLead: async () => ({ ok: false, code: "config_error" }),
    };
    const res = await handleLeadsPost(jsonReq(VALID_BODY), deps);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.doesNotMatch(body.error.message, /supabase|postgres/i);
  });

  await runTest("a market not in the asset list is rejected before any DB call", async () => {
    let inserted = false;
    const deps: Partial<LeadsPostDeps> = {
      rateLimit: PASS_RATE_LIMIT,
      insertLead: async () => {
        inserted = true;
        return { ok: true, value: { id: "x" } };
      },
    };
    const res = await handleLeadsPost(jsonReq({ ...VALID_BODY, markets: ["BITCOIN"] }), deps);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "invalid_markets");
    assert.equal(inserted, false);
  });

  await runTest("missing consent is rejected before any DB call", async () => {
    let inserted = false;
    const deps: Partial<LeadsPostDeps> = {
      rateLimit: PASS_RATE_LIMIT,
      insertLead: async () => {
        inserted = true;
        return { ok: true, value: { id: "x" } };
      },
    };
    const res = await handleLeadsPost(jsonReq({ ...VALID_BODY, consentContact: false }), deps);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "missing_consent");
    assert.equal(inserted, false);
  });
}

void main();
