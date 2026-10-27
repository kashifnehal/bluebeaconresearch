import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement } from "@/lib/test-render";
import BacktestingPage from "./page";

const document = setupDom();

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
  await runTest("renders inside page-shell at wide width with no md:fixed element", async () => {
    const { html, root } = await renderElement(document, createElement(BacktestingPage));
    assert.match(html, /data-testid="page-shell"/);
    assert.match(html, /max-w-\[1440px\]/);
    assert.doesNotMatch(html, /md:fixed/);
    await act(async () => root.unmount());
  });
}

main();
