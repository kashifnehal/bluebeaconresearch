import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ChartMarker } from "@/lib/chart-markers";
import type { MoveSinceEvent } from "@/lib/move-since-event";

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

const FORBIDDEN = [".ts", "/", "sources_count", "commodity_prices"];

const move: MoveSinceEvent = {
  atEvent: { t: Date.UTC(2026, 9, 10, 12), price: 80 },
  latest: { t: Date.UTC(2026, 9, 11, 12), price: 82 },
  sincePct: 2.5,
  after1hPct: null,
  after4hPct: null,
  after24hPct: null,
};

const marker: ChartMarker = {
  key: "m",
  t: 1,
  count: 1,
  severity: 8,
  direction: "up",
  members: [
    {
      id: "sig-1",
      title: "Strait traffic slows",
      eventMs: Date.UTC(2026, 9, 10, 12),
      severity: 8,
      direction: "up",
      sourcesCount: 4,
    },
  ],
};

function visibleText(node: Element): string {
  return (node.textContent ?? "").replace(/\s+/g, " ").trim();
}

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
  const { ChartMarkerCard } = await import("./ChartMarkerCard");

  await runTest("a press inside the citation popover leaves the hover card mounted", async () => {
    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);

    function Harness() {
      const [open, setOpen] = useState(true);
      if (!open) return createElement("div", { "data-testid": "card-closed" });
      return createElement(
        "div",
        {
          "data-testid": "card-parent",
          onClick: () => setOpen(false),
          onPointerDown: () => setOpen(false),
        },
        createElement(ChartMarkerCard, {
          id: "chart-marker-card",
          marker,
          x: 120,
          boxWidth: 600,
          priceContext: { kind: "series", move },
          onBlur: (e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
          },
        }),
      );
    }

    await act(async () => {
      root.render(createElement(Harness));
    });

    const triggers = [...document.querySelectorAll("[data-testid=info-citation-trigger]")];
    assert.equal(triggers.length, 2);
    for (const trigger of triggers) {
      await act(async () => {
        (trigger as HTMLElement).click();
      });
    }

    const popovers = [...document.querySelectorAll("[data-testid=info-citation-popover]")];
    assert.equal(popovers.length, 2);
    const text = popovers.map(visibleText).join(" ");
    assert.match(text, /Price change from the price when this signal was reported/);
    assert.match(text, /Number of reports merged into this signal/);
    for (const token of FORBIDDEN) {
      assert.equal(text.includes(token), false, text);
    }

    const popover = popovers[0];
    await act(async () => {
      popover.dispatchEvent(new window.Event("pointerdown", { bubbles: true, cancelable: true }));
      (popover as HTMLElement).click();
    });

    assert.ok(document.querySelector("[data-testid=chart-marker-card]"));
    assert.equal(document.querySelector("[data-testid=card-closed]"), null);

    await act(async () => {
      root.unmount();
    });
  });
}

void main();
