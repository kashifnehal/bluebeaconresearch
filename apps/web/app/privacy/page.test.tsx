// Renders the privacy page and checks the analytics paragraph matches the consent gate.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement, visibleText } from "@/lib/test-render";

const document = setupDom();

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
  await runTest("analytics paragraph describes PostHog, the EU host, and the consent choice", async () => {
    const privacy = await import("./page");
    const { html, root } = await renderElement(document, createElement(privacy.default));
    try {
      const text = visibleText(html);
      assert.match(text, /PostHog, hosted in the EU region, counts page visits and sign-up steps/);
      assert.match(text, /It is off until you accept/);
      assert.match(text, /Cookie settings in the footer changes the choice/);
      assert.equal(text.includes("PostHog keeps"), false);
      assert.equal(text.toLowerCase().includes("counsel"), false);
      assert.ok(document.querySelector('[data-testid="cookie-settings"]'));
    } finally {
      await act(async () => root.unmount());
    }
  });
}

void main();
