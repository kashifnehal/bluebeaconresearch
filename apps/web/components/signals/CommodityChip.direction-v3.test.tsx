// TASK NQW3-FILTER1 Part 6 — rendered tests (rule 13) for CommodityChip's
// NEXT_PUBLIC_DIRECTION_V3 behavior. In a SEPARATE file from
// CommodityChip.test.tsx (which covers the flag-OFF/missing-field case)
// because lib/flags.ts's isDirectionV3Enabled is read from process.env once
// at module import time — this file sets the env var before importing
// CommodityChip so this process exercises the flag-ON path.
process.env.NEXT_PUBLIC_DIRECTION_V3 = "true";

import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

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
g.IS_REACT_ACT_ENVIRONMENT = true;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function main() {
  const { CommodityChip } = await import("./CommodityChip.js");

  function mount(props: Record<string, unknown>): { html: string; container: HTMLElement; root: Root } {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(createElement(CommodityChip, props as any));
    });
    return { html: container.innerHTML, container, root };
  }

  function unmount(root: Root, container: HTMLElement) {
    act(() => {
      root.unmount();
    });
    container.remove();
  }

  runTest("flag on + direction_shown 'up': renders the up arrow, same as the flag-off chip", () => {
    const { html, container, root } = mount({
      asset: "USOIL",
      direction: "up",
      confidence: 0.8,
      directionShown: "up",
      impactChannel: "supply_transit_risk",
    });
    const text = visibleText(html);
    assert.match(text, /USOIL/);
    assert.match(text, /↑/);
    assert.equal(text.includes("Supply or shipping risk"), false, "must not show the channel label when direction_shown is up");
    unmount(root, container);
  });

  runTest("flag on + direction_shown 'down': renders the down arrow", () => {
    const { html, container, root } = mount({
      asset: "COPPER",
      direction: "down",
      confidence: 0.7,
      directionShown: "down",
      impactChannel: "demand_macro",
    });
    const text = visibleText(html);
    assert.match(text, /↓/);
    unmount(root, container);
  });

  runTest("flag on + direction_shown 'none': renders the impact_channel label instead of an arrow", () => {
    const { html, container, root } = mount({
      asset: "USOIL",
      direction: "up",
      confidence: 0.8,
      directionShown: "none",
      impactChannel: "supply_transit_risk",
    });
    const text = visibleText(html);
    assert.match(text, /USOIL/);
    assert.match(text, /Supply or shipping risk/);
    assert.equal(/[↑↓↕→]/.test(text), false, "no arrow glyph when direction_shown is none");
    unmount(root, container);
  });

  runTest("flag on + direction_shown 'none' + an unrecognized impact_channel: falls back to 'Direction unclear', never throws", () => {
    const { html, container, root } = mount({
      asset: "USOIL",
      direction: "up",
      confidence: 0.8,
      directionShown: "none",
      impactChannel: "not-a-real-channel",
    });
    const text = visibleText(html);
    assert.match(text, /Direction unclear/);
    unmount(root, container);
  });

  runTest("flag on + each of the five impact_channel labels, when direction_shown is 'none'", () => {
    const cases: Array<[string, string]> = [
      ["supply_transit_risk", "Supply or shipping risk"],
      ["demand_macro", "Demand outlook"],
      ["opec_supply_news", "OPEC+ supply news"],
      ["policy_other", "Policy"],
      ["unclear", "Direction unclear"],
    ];
    for (const [impactChannel, label] of cases) {
      const { html, container, root } = mount({
        asset: "USOIL",
        direction: "neutral",
        confidence: 0.5,
        directionShown: "none",
        impactChannel,
      });
      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(visibleText(html), new RegExp(escapedLabel), `impactChannel=${impactChannel}`);
      unmount(root, container);
    }
  });

  runTest("flag on BUT direction_shown is missing (undefined): falls back to today's arrow view, not the channel label", () => {
    const { html, container, root } = mount({
      asset: "USOIL",
      direction: "up",
      confidence: 0.8,
      // directionShown omitted entirely — the common case until the backend
      // flag is also turned on.
    });
    const text = visibleText(html);
    assert.match(text, /↑/);
    assert.equal(text.includes("Direction unclear"), false);
    unmount(root, container);
  });
}

main();
