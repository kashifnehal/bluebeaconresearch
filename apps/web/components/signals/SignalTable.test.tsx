import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Signal } from "@blue-beacon-research/shared";

import { setupDom, renderElement } from "@/lib/test-render";
import { SignalTable } from "./SignalTable";

const document = setupDom();

function click(el: Element) {
  const event = new (globalThis as any).window.Event("click", { bubbles: true });
  el.dispatchEvent(event);
}

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

runTest("every sortable header exposes aria-sort, 'none' until clicked", () => {
  const html = renderToStaticMarkup(
    createElement(SignalTable, { signals: [signal()], hideSummaries: false }),
  );
  const sortHeaders = html.match(/<th[^>]*aria-sort="[a-z]+"/g) ?? [];
  assert.ok(sortHeaders.length >= 3, "expected Date/Severity/Reports headers to carry aria-sort");
  assert.ok(sortHeaders.every((h) => h.includes('aria-sort="none"')));
  assert.match(html, /min-h-6/);
});

runTest("Type and Topic cells carry a title with their visible text; Summary has min-w-[240px] (TASK UI-FIX1 Part 2)", () => {
  const html = renderToStaticMarkup(
    createElement(SignalTable, {
      signals: [signal({ eventType: "supply_disruption_logistics", commodityImpacts: [{ asset: "USOIL", direction: "up", confidence: 0.8 }] })],
      hideSummaries: false,
    }),
  );
  assert.match(html, /title="supply_disruption_logistics"/);
  assert.match(html, /title="USOIL"/);
  assert.match(html, /max-w-\[150px\] truncate/);
  assert.match(html, /max-w-\[160px\] truncate/);
  assert.match(html, /min-w-\[240px\] max-w-\[320px\]/);
  // Event cell keeps its link title too, and header sort buttons still carry
  // aria-sort + min-h-6 (unchanged by this task, re-asserted here).
  assert.match(html, /title="Refinery outage"/);
  const sortHeaders = html.match(/<th[^>]*aria-sort="[a-z]+"/g) ?? [];
  assert.ok(sortHeaders.length >= 3);
  assert.match(html, /min-h-6/);
});

runTest("selectable is off by default: no checkbox column renders", () => {
  const html = renderToStaticMarkup(
    createElement(SignalTable, { signals: [signal()], hideSummaries: false }),
  );
  assert.doesNotMatch(html, /table-select-row|table-select-all/);
});

async function runAsync(name: string, fn: () => Promise<void>) {
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
  await runAsync("clicking a sortable header flips its aria-sort to ascending/descending", async () => {
    const { root } = await renderElement(
      document,
      createElement(SignalTable, { signals: [signal(), signal({ id: "sig-2", severity: 2 })], hideSummaries: false }),
    );
    try {
      const severityButton = document.querySelector('[data-testid="signal-table-sort-severity"]');
      assert.ok(severityButton);
      await act(async () => click(severityButton!));
      const th = severityButton!.closest("th");
      assert.equal(th?.getAttribute("aria-sort"), "descending");
      await act(async () => click(severityButton!));
      assert.equal(th?.getAttribute("aria-sort"), "ascending");
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runAsync(
    "selectable: row checkboxes have an accessible name naming the signal; select-all toggles every loaded row",
    async () => {
      const signals = [signal({ id: "a", title: "Alpha event" }), signal({ id: "b", title: "Beta event" })];
      let selected = new Set<string>();
      const onToggleRow = (id: string) => {
        selected = new Set(selected);
        if (selected.has(id)) selected.delete(id);
        else selected.add(id);
      };
      const onToggleAll = (ids: string[], checked: boolean) => {
        selected = new Set(selected);
        for (const id of ids) {
          if (checked) selected.add(id);
          else selected.delete(id);
        }
      };
      const { root } = await renderElement(
        document,
        createElement(SignalTable, {
          signals,
          hideSummaries: false,
          selectable: true,
          selectedIds: selected,
          onToggleRow,
          onToggleAll,
        }),
      );
      try {
        const rowCheckboxes = [...document.querySelectorAll('[data-testid="table-select-row"]')];
        assert.equal(rowCheckboxes.length, 2);
        const firstLabel = rowCheckboxes[0].closest("label");
        assert.match(firstLabel?.textContent ?? "", /Select Alpha event/);

        // linkedom doesn't implement the browser's native "click toggles
        // checked" default action for a programmatically dispatched click
        // (same workaround as components/ui/checkbox.test.tsx).
        (rowCheckboxes[0] as any).checked = true;
        await act(async () => click(rowCheckboxes[0]));
        assert.deepEqual([...selected], ["a"]);

        const selectAll = document.querySelector('[data-testid="table-select-all"]') as any;
        assert.ok(selectAll, "expected the select-all header checkbox");
        selectAll.checked = true;
        await act(async () => click(selectAll));
        assert.deepEqual(new Set(selected), new Set(["a", "b"]));
      } finally {
        await act(async () => root.unmount());
      }
    },
  );
}

main();
