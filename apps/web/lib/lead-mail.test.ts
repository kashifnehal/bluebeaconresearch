import assert from "node:assert/strict";

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
  delete process.env.RESEND_API_KEY;
  delete process.env.LEADS_NOTIFY_EMAIL;
  const { sendSubscribeConfirmation, notifyNewLead } = await import("./lead-mail");

  await runTest("sendSubscribeConfirmation: no API key degrades to sent:false, no_api_key", async () => {
    const res = await sendSubscribeConfirmation("a@example.com", "https://x/confirm", "https://x/unsub");
    assert.deepEqual(res, { sent: false, reason: "no_api_key" });
  });

  await runTest("notifyNewLead: no LEADS_NOTIFY_EMAIL degrades to sent:false, not_configured", async () => {
    const res = await notifyNewLead({
      kind: "walkthrough",
      name: "Jamie Lee",
      workEmail: "jamie@example.com",
      organisation: null,
      role: null,
      markets: [],
      message: null,
    });
    assert.deepEqual(res, { sent: false, reason: "not_configured" });
  });

  await runTest("notifyNewLead: LEADS_NOTIFY_EMAIL set but no API key still degrades to sent:false", async () => {
    process.env.LEADS_NOTIFY_EMAIL = "founder@example.com";
    try {
      const res = await notifyNewLead({
        kind: "professional_access",
        name: "Jamie Lee",
        workEmail: "jamie@example.com",
        organisation: null,
        role: null,
        markets: [],
        message: null,
      });
      assert.deepEqual(res, { sent: false, reason: "no_api_key" });
    } finally {
      delete process.env.LEADS_NOTIFY_EMAIL;
    }
  });
}

void main();
