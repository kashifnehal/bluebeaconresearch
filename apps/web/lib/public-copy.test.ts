// Public marketing copy: render About and the product-tour confidence step,
// read homepage and About metadata, read the share-image text, and reject
// "AI-powered" in the five public files.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement } from "@/lib/test-render";

const document = setupDom();
const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const PUBLIC_FILES = [
  "app/opengraph-image.tsx",
  "lib/site-metadata.ts",
  "app/page.tsx",
  "app/about/page.tsx",
  "components/onboarding/ProductTour.tsx",
];

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

function textOf(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (typeof node === "object" && node !== null && "props" in node) {
    const props = (node as { props?: { children?: unknown } }).props;
    return textOf(props?.children);
  }
  return "";
}

async function main() {
  await runTest("five public files do not contain AI-powered", () => {
    for (const file of PUBLIC_FILES) {
      const text = readFileSync(join(webRoot, file), "utf8");
      assert.equal(text.includes("AI-powered"), false, file);
    }
  });

  await runTest("homepage and about metadata do not say AI-powered", async () => {
    const home = await import("../app/page");
    const about = await import("../app/about/page");
    const homeDescription = String(home.metadata.description ?? "");
    const homeTitle = String(home.metadata.title ?? "");
    const og = home.metadata.openGraph;
    const ogDescription = og && "description" in og ? String(og.description ?? "") : "";
    const aboutDescription = String(about.metadata.description ?? "");
    for (const value of [homeDescription, homeTitle, ogDescription, aboutDescription]) {
      assert.equal(value.includes("AI-powered"), false, value);
    }
    assert.equal(
      homeDescription,
      "Assessments of geopolitical and economic events and the commodity markets they may touch, with sources, uncertainty and dates.",
    );
    assert.match(aboutDescription, /publishes geopolitical and economic research for commodity markets/);
  });

  await runTest("About page renders without AI-powered", async () => {
    const about = await import("../app/about/page");
    const { html, root } = await renderElement(document, createElement(about.default));
    try {
      assert.equal(html.includes("AI-powered"), false);
      assert.match(html, /publishes geopolitical and economic research for commodity markets/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("product tour confidence step renders the assessment wording", async () => {
    const tour = await import("../components/onboarding/ProductTour");
    const { html, root } = await renderElement(document, createElement(tour.ProductTourConfidenceStep));
    try {
      assert.match(html, /not how likely a market move is/);
      assert.equal(html.includes("AI-powered"), false);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("share image element does not say AI-powered", async () => {
    const og = await import("../app/opengraph-image");
    const drawn = textOf(og.buildOgTree(null));
    assert.equal(drawn.includes("AI-powered"), false);
    assert.match(drawn, /Geopolitical and economic research for commodity markets/);
    assert.equal(og.OG_TAGLINE.includes("AI-powered"), false);
    assert.equal(og.OG_TAGLINE, "Geopolitical and economic research for commodity markets");
  });
}

void main();
