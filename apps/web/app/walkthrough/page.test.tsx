// Rendered coverage for the walkthrough page (rule 13), both variants: consent
// starts unchecked, submit is blocked until it's ticked, and the error path
// never leaks vendor detail. Uses the same SearchParamsContext.Provider trick
// as WatchlistClient.render.test.tsx to satisfy useSearchParams() outside a
// mounted App Router.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement } from "@/lib/test-render";

const document = setupDom();

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

async function renderWalkthrough(search: string) {
  const { SearchParamsContext } = await import(
    "next/dist/shared/lib/hooks-client-context.shared-runtime.js"
  );
  const { default: WalkthroughPage } = await import("./page");
  const { root } = await renderElement(
    document,
    createElement(
      SearchParamsContext.Provider,
      { value: new URLSearchParams(search) },
      createElement(WalkthroughPage),
    ),
  );
  return root;
}

async function main() {
  await runTest("default variant heading and consent starts unchecked with submit disabled", async () => {
    const original = globalThis.fetch;
    const root = await renderWalkthrough("");
    try {
      assert.match(document.body.innerHTML, /Request a walkthrough of your markets/);
      const checkbox = document.querySelector('[data-testid="lead-consent-checkbox"]') as HTMLInputElement;
      const submit = document.querySelector('[data-testid="lead-submit"]') as HTMLButtonElement;
      assert.equal(checkbox.checked, false);
      assert.equal(submit.disabled, true);
    } finally {
      globalThis.fetch = original;
      await act(async () => root.unmount());
    }
  });

  await runTest("?type=professional switches heading, kind, and shows the pilot line", async () => {
    const original = globalThis.fetch;
    const root = await renderWalkthrough("type=professional");
    try {
      assert.match(document.body.innerHTML, /Request professional access/);
      assert.match(document.body.innerHTML, /fixed-scope paid pilot/);
    } finally {
      globalThis.fetch = original;
      await act(async () => root.unmount());
    }
  });

  await runTest("ticking consent enables submit and posts the selected markets", async () => {
    const original = globalThis.fetch;
    const calls: { url: string; body: any }[] = [];
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const root = await renderWalkthrough("");
    try {
      const nameInput = document.querySelector('input[required]:not([type="email"])') as HTMLInputElement;
      const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
      const checkbox = document.querySelector('[data-testid="lead-consent-checkbox"]') as HTMLInputElement;
      const marketCheckbox = document.querySelector('[data-testid="market-USOIL"]') as HTMLInputElement;
      const submit = document.querySelector('[data-testid="lead-submit"]') as HTMLButtonElement;
      const form = document.querySelector("form") as HTMLFormElement;

      await act(async () => typeInto(nameInput, "Jamie Lee"));
      await act(async () => typeInto(emailInput, "jamie@example.com"));
      await act(async () => setChecked(marketCheckbox, true));
      await act(async () => setChecked(checkbox, true));
      assert.equal(submit.disabled, false);

      await act(async () => {
        await submitForm(form);
      });

      assert.equal(calls.length, 1);
      assert.equal(calls[0].body.kind, "walkthrough");
      assert.deepEqual(calls[0].body.markets, ["USOIL"]);
      assert.match(document.body.innerHTML, /Thanks — we will be in touch by email/);
    } finally {
      globalThis.fetch = original;
      await act(async () => root.unmount());
    }
  });

  await runTest("a failed response shows a safe error with no vendor/file/table/HTTP-code text", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { code: "unavailable" } }), { status: 503 })) as typeof fetch;

    const root = await renderWalkthrough("");
    try {
      const nameInput = document.querySelector('input[required]:not([type="email"])') as HTMLInputElement;
      const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
      const checkbox = document.querySelector('[data-testid="lead-consent-checkbox"]') as HTMLInputElement;
      const form = document.querySelector("form") as HTMLFormElement;

      await act(async () => typeInto(nameInput, "Jamie Lee"));
      await act(async () => typeInto(emailInput, "jamie@example.com"));
      await act(async () => setChecked(checkbox, true));
      await act(async () => {
        await submitForm(form);
      });

      const errorEl = document.querySelector('[data-testid="lead-error"]');
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
