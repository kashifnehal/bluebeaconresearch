// Rendered check for TASK UI-TYPE PART 5: FilterBar carried many of the
// md:text-[Npx] -> md:text-[11px] edits (PART 2a); this renders it with
// react-dom/client (via the shared linkedom harness) and asserts its
// controls are still there, not just that the source text matches.
import assert from "node:assert/strict";
import { createElement } from "react";

import { setupDom, renderElement } from "@/lib/test-render";
import { FilterBar } from "./FilterBar";
import { DEFAULT_FILTERS } from "@/lib/signal-filters";

const document = setupDom();

async function runTest(name: string, fn: () => Promise<void> | void) {
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
  await runTest("FilterBar (bar layout) renders its commodity/region/severity/sources selects", async () => {
    const { html } = await renderElement(
      document,
      createElement(FilterBar, { value: DEFAULT_FILTERS, onChange: () => {} }),
    );
    for (const testid of ["filter-bar", "filter-commodity", "filter-region", "filter-severity", "filter-min-sources"]) {
      assert.ok(html.includes(`data-testid="${testid}"`), `expected ${testid} in rendered output`);
    }
  });

  await runTest("FilterBar (stack layout) still renders the same controls", async () => {
    const { html } = await renderElement(
      document,
      createElement(FilterBar, { value: DEFAULT_FILTERS, onChange: () => {}, layout: "stack" }),
    );
    for (const testid of ["filter-bar", "filter-commodity", "filter-region", "filter-severity", "filter-min-sources"]) {
      assert.ok(html.includes(`data-testid="${testid}"`), `expected ${testid} in rendered output`);
    }
  });
}

main();
