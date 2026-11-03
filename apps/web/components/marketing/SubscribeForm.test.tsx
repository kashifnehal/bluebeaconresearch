// Rendered coverage for SubscribeForm (rule 13): consent starts unchecked,
// submit is blocked until it's ticked, and the error path never leaks vendor
// detail. Same linkedom + react-dom/client harness as
// components/signals/SignalQuickView.test.tsx, factored into lib/test-render.ts.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement } from "@/lib/test-render";

const document = setupDom();

function click(el: Element) {
  const event = new (globalThis as any).window.Event("click", { bubbles: true });
  el.dispatchEvent(event);
}

function reactProps(el: Element): any {
  const propsKey = Object.getOwnPropertyNames(el).find((k) => k.startsWith("__reactProps$"))!;
  return (el as any)[propsKey];
}

function typeInto(el: Element, value: string) {
  reactProps(el).onChange({ target: { value } });
}

function setChecked(el: Element, checked: boolean) {
  reactProps(el).onChange({ target: { checked } });
}

async function submitForm(formEl: Element) {
  return reactProps(formEl).onSubmit({ preventDefault: () => {} });
}

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function main() {
  const { SubscribeForm } = await import("./SubscribeForm");

  await runTest("consent starts unchecked and submit is disabled", async () => {
    const original = globalThis.fetch;
    const { root } = await renderElement(document, createElement(SubscribeForm));
    try {
      const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
      const submit = document.querySelector('[data-testid="subscribe-submit"]') as HTMLButtonElement;
      assert.equal(checkbox.checked, false);
      assert.equal(submit.disabled, true);
    } finally {
      globalThis.fetch = original;
      await act(async () => root.unmount());
    }
  });

  await runTest("ticking consent enables submit; a 200 response shows the success message", async () => {
    const original = globalThis.fetch;
    const calls: { url: string; body: any }[] = [];
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const { root } = await renderElement(document, createElement(SubscribeForm));
    try {
      const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
      const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
      const submit = document.querySelector('[data-testid="subscribe-submit"]') as HTMLButtonElement;
      const form = document.querySelector("form") as HTMLFormElement;

      await act(async () => typeInto(emailInput, "reader@example.com"));
      await act(async () => setChecked(checkbox, true));
      assert.equal(submit.disabled, false);

      await act(async () => {
        await submitForm(form);
      });

      assert.equal(calls.length, 1);
      assert.equal(calls[0].body.email, "reader@example.com");
      assert.equal(calls[0].body.consent, true);
      assert.match(document.body.innerHTML, /Check your email to confirm your sign-up/);
    } finally {
      globalThis.fetch = original;
      await act(async () => root.unmount());
    }
  });

  await runTest("a failed response shows a safe error with no vendor/file/table/HTTP-code text", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { code: "unavailable" } }), { status: 503 })) as typeof fetch;

    const { root } = await renderElement(document, createElement(SubscribeForm));
    try {
      const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
      const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
      const form = document.querySelector("form") as HTMLFormElement;

      await act(async () => typeInto(emailInput, "reader@example.com"));
      await act(async () => setChecked(checkbox, true));
      await act(async () => {
        await submitForm(form);
      });

      const errorEl = document.querySelector('[data-testid="subscribe-error"]');
      assert.ok(errorEl, "expected an error message to be shown");
      const text = errorEl!.textContent ?? "";
      assert.doesNotMatch(text, /\/[a-zA-Z0-9_./-]+\.(ts|tsx|js|sql)/, "must not contain a file path");
      assert.doesNotMatch(text, /newsletter_subscribers|lead_requests/, "must not contain a table name");
      assert.doesNotMatch(text, /\b[45]\d{2}\b/, "must not contain an HTTP status code");
      assert.doesNotMatch(text, /resend|supabase/i, "must not contain vendor text");
    } finally {
      globalThis.fetch = original;
      await act(async () => root.unmount());
    }
  });
}

void main();
