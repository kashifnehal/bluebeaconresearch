import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement } from "@/lib/test-render";
import { StatusLine } from "./StatusLine";

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
  await runTest("renders nothing when all three are null", async () => {
    const { html, root } = await renderElement(
      document,
      createElement(StatusLine, { dataAsOf: null, coverageLine: null, windowExpandedLine: null }),
    );
    assert.doesNotMatch(html, /data-as-of|coverage-line|window-expanded-line/);
    await act(async () => root.unmount());
  });

  await runTest("holds all three test ids, in order, separated by a middle dot", async () => {
    const { html, root } = await renderElement(
      document,
      createElement(StatusLine, {
        dataAsOf: "Data as of 3:45:12 PM",
        coverageLine: "Last 24h: signals from 12 sources.",
        windowExpandedLine: "Showing signals from the last 7 days — live coverage is still expanding.",
      }),
    );
    const order = [
      html.indexOf('data-testid="data-as-of"'),
      html.indexOf('data-testid="coverage-line"'),
      html.indexOf('data-testid="window-expanded-line"'),
    ];
    assert.ok(order[0] < order[1] && order[1] < order[2]);
    assert.match(html, /Data as of 3:45:12 PM/);
    assert.match(html, /·/);
    await act(async () => root.unmount());
  });

  await runTest("renders only the parts that have text", async () => {
    const { html, root } = await renderElement(
      document,
      createElement(StatusLine, { dataAsOf: "Data as of 1:00:00 PM", coverageLine: null, windowExpandedLine: null }),
    );
    assert.match(html, /data-testid="data-as-of"/);
    assert.doesNotMatch(html, /data-testid="coverage-line"/);
    assert.doesNotMatch(html, /data-testid="window-expanded-line"/);
    await act(async () => root.unmount());
  });
}

main();
