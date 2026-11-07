// Rendered coverage for the public Corrections page.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement, visibleText } from "@/lib/test-render";

const document = setupDom();

const BANNED = ["ai-powered", "real-time", "instant", "predict", "buy", "sell", "profit", "guarantee"];

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
  await runTest("corrections page shows the report address, the log date, and no banned wording", async () => {
    const page = await import("./page");
    const { html, root } = await renderElement(document, createElement(page.default));
    try {
      const text = visibleText(html);
      assert.match(text, /Corrections/);
      const mail = [...document.querySelectorAll("a")].find(
        (a) => a.getAttribute("href") === "mailto:support@bluebeaconresearch.com",
      );
      assert.equal(mail?.textContent, "support@bluebeaconresearch.com");
      assert.equal(text.includes("2026-11-08"), true);
      assert.equal(text.includes("What was wrong"), true);
      assert.equal(text.includes("What changed"), true);
      assert.match(text, /Corrections to published assessments as of 8 November 2026: none/);
      const standard = [...document.querySelectorAll("a")].find((a) => a.getAttribute("href") === "/research-standard");
      assert.equal(standard?.textContent, "Research Standard");
      const lower = text.toLowerCase();
      for (const word of BANNED) {
        assert.equal(lower.includes(word), false, word);
      }
    } finally {
      await act(async () => root.unmount());
    }
  });
}

void main();
