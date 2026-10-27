import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement } from "@/lib/test-render";
import { Switch } from "./switch";

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

function click(el: Element) {
  const event = new (globalThis as any).window.Event("click", { bubbles: true });
  el.dispatchEvent(event);
}

async function main() {
  await runTest("clicking the switch button toggles aria-checked and calls onChange", async () => {
    let checked = false;
    const { root } = await renderElement(
      document,
      createElement(Switch, {
        label: "Daily digest email",
        checked,
        onChange: (v: boolean) => (checked = v),
      }),
    );
    const button = document.querySelector('[role="switch"]');
    assert.ok(button);
    assert.equal(button!.getAttribute("aria-checked"), "false");
    await act(async () => click(button!));
    assert.equal(checked, true);
    await act(async () => root.unmount());
  });

  await runTest("is a native <button role=switch> so Space/Enter activate it without extra handlers", async () => {
    const { html, root } = await renderElement(
      document,
      createElement(Switch, { label: "Price alerts", checked: true, onChange: () => {} }),
    );
    assert.match(html, /role="switch"/);
    assert.match(html, /<button/);
    assert.equal(document.querySelector('[role="switch"]')!.tagName, "BUTTON");
    await act(async () => root.unmount());
  });
}

main();
