// Rendered coverage for the How It Works claim list.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement } from "@/lib/test-render";
import { HowItWorksClaimList } from "./page";

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
  await runTest("accuracy claim names the later price move and keeps the check text", async () => {
    const { html, root } = await renderElement(document, createElement(HowItWorksClaimList));
    try {
      const text = (document.body.textContent ?? "").replace(/\s+/g, " ");
      assert.equal(text.includes("We publish our track record."), false);
      assert.equal(
        text.includes(
          "We publish how often our calls matched the later price move, including when the result is weak.",
        ),
        true,
      );
      assert.equal(
        text.includes("See the Accuracy page — including when the number is not flattering."),
        true,
      );
      assert.match(html, /How you can check it/);
    } finally {
      await act(async () => root.unmount());
    }
  });
}

void main();
