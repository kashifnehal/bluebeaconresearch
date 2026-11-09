import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare module "linkedom" {
  export function parseHTML(html: string): { window: any; document: Document };
}

import { parseHTML } from "linkedom";
import { MapLoadingChip } from "./MapLoadingChip";

const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
const g = globalThis as any;
for (const key of ["window", "document", "HTMLElement", "Element", "Node"] as const) {
  Object.defineProperty(g, key, {
    value: key === "window" ? window : key === "document" ? document : (window as any)[key],
    configurable: true,
  });
}
g.IS_REACT_ACT_ENVIRONMENT = true;

function runTest(name: string, fn: () => Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`✔ ${name}`))
    .catch((err) => {
      console.error(`✖ ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

async function main() {
  await runTest("renders the loading chip once and stops", async () => {
    let renders = 0;
    function Probe() {
      renders += 1;
      return createElement(MapLoadingChip);
    }
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);
    await act(async () => {
      root.render(createElement(Probe));
    });
    assert.ok(renders > 0 && renders <= 3, `expected at most 3 renders, got ${renders}`);
    assert.match(host.textContent ?? "", /Loading events/);
    assert.equal(host.querySelectorAll("[data-testid=map-loading-chip]").length, 1);
    await act(async () => {
      root.unmount();
    });
  });
}

void main();
