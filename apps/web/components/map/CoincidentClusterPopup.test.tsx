import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare module "linkedom" {
  export function parseHTML(html: string): { window: any; document: Document };
}

import { parseHTML } from "linkedom";
import { CoincidentClusterPopup } from "./CoincidentClusterPopup";
import { leafCoordinates, pointsShareCoordinate } from "@/lib/map-clusters";

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

const samePlace = [
  { geometry: { coordinates: [46.6753, 24.7136] } },
  { geometry: { coordinates: [46.6753, 24.7136] } },
];
const spread = [
  { geometry: { coordinates: [46.6753, 24.7136] } },
  { geometry: { coordinates: [50.0, 26.0] } },
];

async function main() {
  await runTest("identical points open the list and spread points do not share a coordinate", async () => {
    assert.equal(pointsShareCoordinate(leafCoordinates(samePlace)), true);
    assert.equal(pointsShareCoordinate(leafCoordinates(spread)), false);

    let renders = 0;
    function Probe() {
      renders += 1;
      return createElement(CoincidentClusterPopup, {
        signals: [
          {
            id: "a",
            title: "Missile strike in Riyadh",
            severity: 8,
            createdAt: "2026-11-08T12:00:00.000Z",
            eventDate: "2026-11-08T12:00:00.000Z",
          },
          {
            id: "b",
            title: "Second report from the same site",
            severity: 5,
            createdAt: "2026-11-08T15:00:00.000Z",
            eventDate: "2026-11-08T15:00:00.000Z",
          },
        ],
        onClose: () => {},
      });
    }
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);
    await act(async () => {
      root.render(createElement(Probe));
    });
    assert.ok(renders > 0 && renders <= 3, `expected at most 3 renders, got ${renders}`);
    const text = host.textContent ?? "";
    assert.match(text, /Missile strike in Riyadh/);
    assert.match(text, /Severity 8/);
    assert.match(text, /Severity 5/);
    assert.match(text, /ago/);
    const link = host.querySelector('a[href="/events/a"]');
    assert.ok(link);
    await act(async () => {
      root.unmount();
    });
  });
}

void main();
