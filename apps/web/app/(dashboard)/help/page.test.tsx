import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement } from "@/lib/test-render";
import HelpPage from "./page";

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
  await runTest("renders one h1 Help inside page-shell at narrow width", async () => {
    const { PathnameContext } = await import(
      "next/dist/shared/lib/hooks-client-context.shared-runtime.js"
    );
    const { html, root } = await renderElement(
      document,
      createElement(PathnameContext.Provider, { value: "/help" }, createElement(HelpPage)),
    );
    const h1s = html.match(/<h1[^>]*>/g) ?? [];
    assert.equal(h1s.length, 1);
    assert.match(html, />Help<\/h1>/);
    assert.match(html, /data-testid="page-shell"/);
    assert.match(html, /max-w-3xl/);
    await act(async () => root.unmount());
  });

  await runTest("rendered help text no longer asks when 'not enough history yet' shows, and names the publication standard instead", async () => {
    const { PathnameContext } = await import(
      "next/dist/shared/lib/hooks-client-context.shared-runtime.js"
    );
    const { html, root } = await renderElement(
      document,
      createElement(PathnameContext.Provider, { value: "/help" }, createElement(HelpPage)),
    );
    try {
      assert.equal(
        html.includes(
          "An up/down call is scored correct if that 48-hour direction matches; moves under 0.5% are treated as flat.",
        ),
        false,
      );
      assert.equal(html.includes("counts as a miss"), false);
      assert.equal(html.includes("not enough history yet"), false);
      assert.match(html, /When does BBR publish performance statistics\?/);
      assert.equal(
        html.includes(
          "BBR publishes a performance statistic only when it meets the publication standard described on the Method page.",
        ),
        true,
      );
    } finally {
      await act(async () => root.unmount());
    }
  });
}

main();
