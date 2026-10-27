import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement } from "@/lib/test-render";
import { PageHeader, PAGE_TITLE_CLASS } from "./PageHeader";

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
  await runTest("renders exactly one h1 with the title and PAGE_TITLE_CLASS", async () => {
    const { html, root } = await renderElement(
      document,
      createElement(PageHeader, {
        title: "Archive",
        breadcrumbs: [{ label: "Dashboard", href: "/dashboard" }, { label: "Archive" }],
      }),
    );
    const h1s = html.match(/<h1[^>]*>/g) ?? [];
    assert.equal(h1s.length, 1);
    assert.match(html, new RegExp(PAGE_TITLE_CLASS.split(" ")[0]));
    assert.match(html, /Archive<\/h1>/);
    await act(async () => root.unmount());
  });

  await runTest("renders breadcrumbs and actions", async () => {
    const { html, root } = await renderElement(
      document,
      createElement(PageHeader, {
        title: "Help",
        breadcrumbs: [{ label: "Dashboard", href: "/dashboard" }, { label: "Help" }],
        actions: createElement("button", { "data-testid": "my-action" }, "Do thing"),
      }),
    );
    assert.match(html, /data-testid="breadcrumbs"/);
    assert.match(html, /data-testid="my-action"/);
    await act(async () => root.unmount());
  });
}

main();
