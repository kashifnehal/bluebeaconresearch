import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Direction } from "@blue-beacon-research/shared";

import { CommodityChip } from "./CommodityChip";

const DIRECTIONS: Array<{ direction: Direction; arrow: string }> = [
  { direction: "up", arrow: "↑" },
  { direction: "down", arrow: "↓" },
  { direction: "volatile", arrow: "↕" },
  { direction: "neutral", arrow: "→" },
];

function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

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

function renderChip(direction: Direction, size: "sm" | "md"): string {
  return renderToStaticMarkup(
    createElement(CommodityChip, {
      asset: "USOIL",
      direction,
      confidence: 0.88,
      size,
    }),
  );
}

runTest("CommodityChip visible text has no percentage or number for sm and md across all directions", () => {
  for (const size of ["sm", "md"] as const) {
    for (const { direction, arrow } of DIRECTIONS) {
      const html = renderChip(direction, size);
      const text = visibleText(html);
      assert.equal(/\d/.test(text), false, `${size}/${direction} visible text has a number: ${text}`);
      assert.equal(text.includes("%"), false, `${size}/${direction} visible text has %: ${text}`);
      assert.equal(text.includes("88"), false);
      assert.equal(text.includes("confidence"), false);
      assert.match(text, /USOIL/);
      assert.match(text, new RegExp(arrow));
      assert.match(
        html,
        /aria-label="USOIL [^"]*model classification confidence 88%"/,
      );
    }
  }
});
