import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement } from "@/lib/test-render";
import { ActiveFilters, SortSelect, SegmentedControl } from "./Toolbar";

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
  await runTest("ActiveFilters renders nothing when chips is empty", async () => {
    const { html, root } = await renderElement(
      document,
      createElement(ActiveFilters, { chips: [], onClearAll: () => {} }),
    );
    assert.doesNotMatch(html, /data-testid="active-filters"/);
    await act(async () => root.unmount());
  });

  await runTest("ActiveFilters: remove calls that chip's handler, clear all calls onClearAll", async () => {
    let removed = "";
    let clearedAll = false;
    const { root } = await renderElement(
      document,
      createElement(ActiveFilters, {
        chips: [
          { id: "region", label: "Middle East", onRemove: () => (removed = "region") },
          { id: "severity", label: "Severity ≥ 4", onRemove: () => (removed = "severity") },
        ],
        onClearAll: () => (clearedAll = true),
      }),
    );
    const removeBtn = document.querySelector('[aria-label="Remove filter: Severity ≥ 4"]');
    assert.ok(removeBtn);
    await act(async () => click(removeBtn!));
    assert.equal(removed, "severity");

    const clearBtn = document.querySelector('[data-testid="active-filters-clear-all"]');
    assert.ok(clearBtn);
    await act(async () => click(clearBtn!));
    assert.equal(clearedAll, true);
    await act(async () => root.unmount());
  });

  await runTest("SortSelect renders a labelled select with the given options", async () => {
    const { html, root } = await renderElement(
      document,
      createElement(SortSelect, {
        value: "newest",
        label: "Sort",
        ariaLabel: "Sort loaded signals",
        options: [
          { value: "relevance", label: "Relevance" },
          { value: "newest", label: "Newest first" },
        ],
        onChange: () => {},
      }),
    );
    assert.match(html, /aria-label="Sort loaded signals"/);
    assert.match(html, /Newest first/);
    await act(async () => root.unmount());
  });

  await runTest("SegmentedControl marks the selected option aria-pressed and calls onChange", async () => {
    let chosen = "";
    const { root } = await renderElement(
      document,
      createElement(SegmentedControl, {
        value: "cards",
        ariaLabel: "Feed view",
        options: [
          { value: "cards", label: "Cards" },
          { value: "table", label: "Table" },
        ],
        onChange: (v: string) => (chosen = v),
      }),
    );
    const buttons = document.querySelectorAll('[role="group"][aria-label="Feed view"] button');
    assert.equal(buttons.length, 2);
    assert.equal(buttons[0].getAttribute("aria-pressed"), "true");
    assert.equal(buttons[1].getAttribute("aria-pressed"), "false");
    await act(async () => click(buttons[1]));
    assert.equal(chosen, "table");
    await act(async () => root.unmount());
  });
}

main();
