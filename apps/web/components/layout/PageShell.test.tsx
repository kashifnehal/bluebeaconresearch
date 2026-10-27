import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement } from "@/lib/test-render";
import { PageShell } from "./PageShell";

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
  await runTest("renders wide/medium/narrow max-width classes", async () => {
    for (const [width, cls] of [
      ["wide", "max-w-[1440px]"],
      ["medium", "max-w-4xl"],
      ["narrow", "max-w-3xl"],
    ] as const) {
      const { html, root } = await renderElement(
        document,
        createElement(PageShell, { width, children: createElement("p", null, "content") }),
      );
      assert.match(html, new RegExp(cls.replace(/[[\]]/g, "\\$&")));
      await act(async () => root.unmount());
    }
  });

  await runTest("has pt-16 (clears the fixed 64px TopBar)", async () => {
    const { html, root } = await renderElement(
      document,
      createElement(PageShell, null, createElement("p", null, "content")),
    );
    assert.match(html, /pt-16/);
    await act(async () => root.unmount());
  });

  await runTest("renders the aside element as given, after the content", async () => {
    const { html, root } = await renderElement(
      document,
      createElement(PageShell, {
        aside: createElement("aside", { "data-testid": "my-aside" }, "side"),
        children: createElement("p", null, "content"),
      }),
    );
    assert.match(html, /data-testid="my-aside"/);
    assert.ok(html.indexOf("content") < html.indexOf("side"));
    await act(async () => root.unmount());
  });

  await runTest("no md:fixed and no inner overflow-y-auto scroll area", async () => {
    const { html, root } = await renderElement(
      document,
      createElement(PageShell, null, createElement("p", null, "content")),
    );
    assert.doesNotMatch(html, /md:fixed/);
    assert.doesNotMatch(html, /overflow-y-auto/);
    await act(async () => root.unmount());
  });
}

main();
