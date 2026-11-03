import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "test-resend-key";

// Plain tsx + node:assert, same pattern as telegram.service.test.ts — no
// jest/vitest in this backend.
const { EmailService } = await import("./email.service.js");

function runTest(name: string, fn: () => void | Promise<void>) {
  const result = (() => {
    try {
      return fn();
    } catch (err) {
      console.error(`✖ ${name}`);
      console.error(err);
      process.exitCode = 1;
      return undefined;
    }
  })();
  if (result instanceof Promise) {
    return result.then(
      () => console.log(`✔ ${name}`),
      (err) => {
        console.error(`✖ ${name}`);
        console.error(err);
        process.exitCode = 1;
      },
    );
  }
  console.log(`✔ ${name}`);
}

function fakeResendClient(capture: { calls: unknown[] }) {
  return {
    emails: {
      async send(payload: unknown) {
        capture.calls.push(payload);
        return { data: { id: "fake-id" }, error: null };
      },
    },
  };
}

async function main() {
  await runTest("send() with no new fields keeps the same Resend payload shape", async () => {
    const service = new EmailService();
    const capture = { calls: [] as unknown[] };
    service.__setClientForTests(fakeResendClient(capture));

    const res = await service.send({ to: "reader@example.com", subject: "Hi", html: "<p>hi</p>", text: "hi" });

    assert.equal(res.sent, true);
    assert.equal(capture.calls.length, 1);
    const payload = capture.calls[0] as Record<string, unknown>;
    assert.equal(payload.to, "reader@example.com");
    assert.equal(payload.subject, "Hi");
    assert.equal(payload.html, "<p>hi</p>");
    assert.equal(payload.text, "hi");
    assert.ok(!("headers" in payload), "headers should be absent when not passed");
    assert.ok(!("replyTo" in payload), "replyTo should be absent when not passed");
  });

  await runTest("send() forwards headers and replyTo to Resend when given", async () => {
    const service = new EmailService();
    const capture = { calls: [] as unknown[] };
    service.__setClientForTests(fakeResendClient(capture));

    await service.send({
      to: "reader@example.com",
      subject: "Hi",
      html: "<p>hi</p>",
      text: "hi",
      headers: { "List-Unsubscribe": "<https://example.com/settings>" },
      replyTo: "support@example.com",
    });

    const payload = capture.calls[0] as Record<string, unknown>;
    assert.deepEqual(payload.headers, { "List-Unsubscribe": "<https://example.com/settings>" });
    assert.equal(payload.replyTo, "support@example.com");
  });

  await runTest("send() with no api key stays inert regardless of headers/replyTo", async () => {
    const service = new EmailService();
    service.__setClientForTests(null);
    const res = await service.send({
      to: "reader@example.com",
      subject: "Hi",
      html: "<p>hi</p>",
      text: "hi",
      headers: { "List-Unsubscribe": "<https://example.com/settings>" },
    });
    assert.equal(res.sent, false);
    assert.equal(res.reason, "no_api_key");
  });
}

await main();
