// Rendered coverage for the public accuracy page.
//
// 2026-11-15 rewrite (TASK NQ-2 Part 1): the page is now static — no fetch of
// GET /v1/accuracy, no hit-rate/percentage figures, no horizon or by-asset
// table. It explains what BBR records on every item and the standard it
// uses before publishing a performance statistic, and links to How It Works
// and the corrections log.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement } from "@/lib/test-render";
import { AccuracyReport } from "./page";

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
  await runTest("renders the H1, intro, and all four recorded-item lines", async () => {
    const { html, root } = await renderElement(document, createElement(AccuracyReport));
    try {
      const h1 = document.querySelector("h1");
      assert.equal(h1?.textContent, "How BBR works and how to check it");

      const intro = document.querySelector('[data-testid="accuracy-intro"]');
      assert.equal(
        (intro?.textContent ?? "").replace(/\s+/g, " ").trim(),
        "Every item on BBR links to its source and shows the times behind it. This page explains what we record and the standard we use before we publish any performance statistic.",
      );

      const items = document.querySelector('[data-testid="accuracy-recorded-items"]');
      const text = (items?.textContent ?? "").replace(/\s+/g, " ");
      assert.match(text, /The source and a link to the original report\./);
      assert.match(text, /When the source published it\./);
      assert.match(text, /When BBR fetched it\./);
      assert.match(text, /When BBR flagged it\./);
      void html;
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  await runTest("renders the publication standard exactly as proposed", async () => {
    const { root } = await renderElement(document, createElement(AccuracyReport));
    try {
      const standard = document.querySelector('[data-testid="accuracy-publication-standard"]');
      assert.equal(
        (standard?.textContent ?? "").replace(/\s+/g, " ").trim(),
        "We publish a performance statistic only when the sample, the period, the thresholds and the baseline are stated, and a pre-declared test shows a result above the plain baseline.",
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  await runTest("method section links to /how-it-works", async () => {
    const { root } = await renderElement(document, createElement(AccuracyReport));
    try {
      const method = document.querySelector('[data-testid="accuracy-method"]');
      assert.match(
        (method?.textContent ?? "").replace(/\s+/g, " "),
        /The classification method is described on the How It Works page\./,
      );
      const link = method?.querySelector("a");
      assert.equal(link?.getAttribute("href"), "/how-it-works");
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  await runTest("corrections section links to /corrections", async () => {
    const { root } = await renderElement(document, createElement(AccuracyReport));
    try {
      const corrections = document.querySelector('[data-testid="accuracy-corrections"]');
      assert.ok(corrections, "expected a Corrections section");
      const link = corrections?.querySelector("a");
      assert.equal(link?.getAttribute("href"), "/corrections");
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  await runTest(
    "no percentage, hit-rate, track-record wording, or non-year digit anywhere in the rendered text",
    async () => {
      const { html, root } = await renderElement(document, createElement(AccuracyReport));
      try {
        const text = document.body.textContent ?? "";
        const lower = text.toLowerCase();
        assert.equal(lower.includes("%"), false);
        assert.equal(lower.includes("hit rate"), false);
        assert.equal(lower.includes("track record"), false);
        // Strip any 4-digit year literals before checking for other digits.
        const withoutYears = text.replace(/\b(19|20)\d{2}\b/g, "");
        assert.equal(/\d/.test(withoutYears), false);
        void html;
      } finally {
        await act(async () => {
          root.unmount();
        });
      }
    },
  );

  await runTest("the page source has no fetch of the accuracy API", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    assert.equal(source.includes("/v1/accuracy"), false);
    assert.equal(source.includes("API_URL"), false);
  });
}

void main();
