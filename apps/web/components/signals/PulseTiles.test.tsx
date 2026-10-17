import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

declare module "linkedom" {
  export function parseHTML(html: string): { window: any; document: Document };
}

import { parseHTML } from "linkedom";

const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
const g = globalThis as any;
for (const key of ["window", "document", "HTMLElement", "Element", "Node", "DocumentFragment", "MutationObserver"] as const) {
  Object.defineProperty(g, key, {
    value: key === "window" ? window : key === "document" ? document : (window as any)[key],
    configurable: true,
  });
}
const computed = () => ({ getPropertyValue: () => "", contentVisibility: "visible", display: "block" });
g.getComputedStyle = computed;
(window as any).getComputedStyle = computed;
const raf = (cb: (time: number) => void) => setTimeout(() => cb(Date.now()), 0);
const caf = (id: number) => clearTimeout(id);
g.requestAnimationFrame = raf;
g.cancelAnimationFrame = caf;
(window as any).requestAnimationFrame = raf;
(window as any).cancelAnimationFrame = caf;
g.IS_REACT_ACT_ENVIRONMENT = true;
g.fetch = async () => ({
  ok: true,
  json: async () => ({
    last24h: 69,
    prior24h: 40,
    changePct: 72.5,
    peakHourUtc: 14,
    peakHourCount: 8,
    up: 108,
    down: 79,
    other: 3,
  }),
});

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

function tileText(testId: string): string {
  return (document.querySelector(`[data-testid=${testId}]`)?.textContent ?? "").replace(/\s+/g, " ").trim();
}

async function renderTiles(symbol?: string) {
  document.body.replaceChildren();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { PulseTiles } = await import("./PulseTiles");
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(PulseTiles, symbol ? { symbol } : {}),
      ),
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return root;
}

async function main() {
  await runTest("all-assets mode names asset direction votes and explains the count", async () => {
    const root = await renderTiles();
    const direction = tileText("pulse-tile-direction");
    assert.match(direction, /Asset direction votes/);
    assert.match(direction, /One vote per asset per signal, so one signal can add several\./);
    assert.equal(direction.includes("Up / Down"), false);
    assert.equal(tileText("pulse-tile-last24h").includes("Signals last 24h"), true);
    await act(async () => {
      root.unmount();
    });
  });

  await runTest("single-asset mode keeps the Up / Down label and has no vote caption", async () => {
    const root = await renderTiles("USOIL");
    const direction = tileText("pulse-tile-direction");
    assert.match(direction, /Up \/ Down/);
    assert.equal(direction.includes("Asset direction votes"), false);
    assert.equal(document.querySelector("[data-testid=pulse-direction-caption]"), null);
    await act(async () => {
      root.unmount();
    });
  });
}

void main();
