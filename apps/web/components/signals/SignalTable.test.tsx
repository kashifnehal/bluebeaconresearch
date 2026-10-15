import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Signal } from "@blue-beacon-research/shared";

import { SignalTable } from "./SignalTable";

function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "sig-1",
    title: "Refinery outage",
    summary: "A distinct summary sentence.",
    severity: 5,
    confidence: 0.8,
    eventType: "supply_disruption_logistics",
    country: "United States",
    region: "americas",
    sourcesCount: 2,
    commodityImpacts: [{ asset: "USOIL", direction: "up", confidence: 0.8 }],
    isBreaking: false,
    isActive: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    eventDate: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

runTest("hideSummaries false keeps the Summary column", () => {
  const html = renderToStaticMarkup(
    createElement(SignalTable, { signals: [signal()], hideSummaries: false }),
  );
  assert.match(html, /data-testid="signal-table-summary-header"/);
  assert.match(html, /data-testid="signal-table-summary-cell"/);
  assert.match(visibleText(html), /A distinct summary sentence/);
  assert.match(html, /min-w-\[900px\]/);
  assert.match(html, /data-testid="signal-table-scroll"[^>]*overflow-x-auto/);
});

runTest("hideSummaries removes the Summary column and keeps scroll rules", () => {
  const html = renderToStaticMarkup(
    createElement(SignalTable, { signals: [signal()], hideSummaries: true }),
  );
  assert.equal(html.includes("signal-table-summary-header"), false);
  assert.equal(html.includes("signal-table-summary-cell"), false);
  assert.equal(visibleText(html).includes("A distinct summary sentence"), false);
  assert.equal(/>\s*Summary\s*</.test(html), false);
  assert.match(html, /min-w-\[900px\]/);
  assert.match(html, /data-testid="signal-table-scroll"[^>]*overflow-x-auto/);
  assert.match(visibleText(html), /1 signal loaded · 1 day · Up 1 · Down 0 · Other 0/);
  assert.match(visibleText(html), /Sorting applies to loaded rows/);
});
