// Rendered coverage for the public Research Standard page.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement, visibleText } from "@/lib/test-render";

const document = setupDom();

const HEADINGS = [
  "Sources are linked.",
  "Two times are shown.",
  "One report is counted as one report.",
  "What a source says is kept apart from our reading.",
  "Exposure is a reading, not a forecast.",
  "We say what we did not check.",
  "No position advice.",
  "Corrections are logged.",
];

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
  await runTest("research standard page lists the eight checks and avoids banned wording", async () => {
    const page = await import("./page");
    const { html, root } = await renderElement(document, createElement(page.default));
    try {
      const text = visibleText(html);
      assert.match(text, /Research Standard/);
      for (const heading of HEADINGS) {
        assert.equal(text.includes(heading), true, heading);
      }
      const how = [...document.querySelectorAll("a")].find((a) => a.getAttribute("href") === "/how-it-works");
      const corrections = [...document.querySelectorAll("a")].find((a) => a.getAttribute("href") === "/corrections");
      assert.equal(how?.textContent, "How it works");
      assert.equal(corrections?.textContent, "Corrections");
      assert.match(text, /Informational research, not investment advice\. Sources and dates are shown on each item\./);
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
