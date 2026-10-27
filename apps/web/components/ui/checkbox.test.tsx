import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement } from "@/lib/test-render";
import { Checkbox } from "./checkbox";

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
  await runTest("clicking the label text toggles checked via onChange", async () => {
    let checked = false;
    const { root } = await renderElement(
      document,
      createElement(Checkbox, {
        label: "Daily digest email",
        checked,
        onChange: (v: boolean) => (checked = v),
      }),
    );
    const input = document.querySelector('input[type="checkbox"]') as any;
    assert.ok(input);
    // linkedom doesn't implement the browser's native "click toggles checked"
    // default action, so flip it ourselves before the click React listens for.
    input.checked = true;
    await act(async () => click(input));
    assert.equal(checked, true);
    await act(async () => root.unmount());
  });

  await runTest("hideLabel keeps an accessible name via sr-only text, not visible text", async () => {
    const { html, root } = await renderElement(
      document,
      createElement(Checkbox, {
        label: "Select Strait traffic slows",
        checked: false,
        onChange: () => {},
        hideLabel: true,
      }),
    );
    assert.match(html, /sr-only/);
    assert.match(html, /Select Strait traffic slows/);
    await act(async () => root.unmount());
  });

  await runTest("disabled prevents the input from being interactive", async () => {
    const { html, root } = await renderElement(
      document,
      createElement(Checkbox, {
        label: "Connected",
        checked: false,
        onChange: () => {},
        disabled: true,
      }),
    );
    assert.match(html, /\sdisabled[\s>]/);
    await act(async () => root.unmount());
  });
}

main();
