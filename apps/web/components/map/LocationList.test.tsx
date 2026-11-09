import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement } from "@/lib/test-render";
import { LocationList } from "./LocationList";

const document = setupDom();

const g = globalThis as typeof globalThis & { window: Window & { matchMedia?: (q: string) => MediaQueryList } };
if (typeof g.window.matchMedia !== "function") {
  g.window.matchMedia = (query: string) =>
    ({
      matches: query.includes("min-width: 768px"), // force the desktop branch
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    }) as unknown as MediaQueryList;
}

// React never attaches __reactFiber$* in a way that makes native-dispatched
// input events trigger onChange under plain linkedom + react-dom/client —
// same workaround already used in WatchlistClient.render.test.tsx's typeInto.
function typeInto(el: Element, value: string) {
  const propsKey = Object.getOwnPropertyNames(el).find((k) => k.startsWith("__reactProps$"))!;
  (el as any)[propsKey].onChange({ target: { value } });
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

function fixtureSignal(country: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: `sig-${country}`,
    country,
    lat: 15,
    lng: 45,
    commodityImpacts: [],
    currencyPairImpacts: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  } as any;
}

async function mountDesktopOpen(signals: ReturnType<typeof fixtureSignal>[]) {
  const { root } = await renderElement(
    document,
    createElement(LocationList, {
      signals,
      radiusKm: 150,
      selectedCountry: null,
      onSelectCountry: () => {},
      onClearCountry: () => {},
      onSelectChokepoint: () => {},
      desktopOpen: true,
      onToggleDesktop: () => {},
      desktopLeft: "1rem",
      desktopRight: "1rem",
      mobileExpanded: false,
      onToggleMobile: () => {},
    }),
  );
  // layout resolves via a matchMedia-driven effect, one tick after mount.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  return root;
}

async function main() {
  await runTest("filter input narrows the location list to a case-insensitive contains match", async () => {
    const signals = [fixtureSignal("Yemen"), fixtureSignal("Ukraine"), fixtureSignal("Sudan")];
    const root = await mountDesktopOpen(signals);
    try {
      const rowsBefore = document.querySelectorAll('[data-testid="location-row"]');
      assert.equal(rowsBefore.length, 3);

      const filterInput = document.querySelector('[data-testid="location-filter"]')!;
      await act(async () => typeInto(filterInput, "ukr"));

      const rowsAfter = [...document.querySelectorAll('[data-testid="location-row"]')];
      assert.equal(rowsAfter.length, 1);
      assert.equal(rowsAfter[0].getAttribute("data-country"), "Ukraine");
      assert.equal(document.querySelector('[data-testid="location-filter-empty"]'), null);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("no matches shows 'No matching locations.' instead of an empty list", async () => {
    const signals = [fixtureSignal("Yemen")];
    const root = await mountDesktopOpen(signals);
    try {
      const filterInput = document.querySelector('[data-testid="location-filter"]')!;
      await act(async () => typeInto(filterInput, "zzz-no-such-place"));

      const empty = document.querySelector('[data-testid="location-filter-empty"]');
      assert.ok(empty, "expected the empty-state message");
      assert.equal(empty!.textContent, "No matching locations.");
      assert.equal(document.querySelectorAll('[data-testid="location-row"]').length, 0);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("clearing the filter restores the full list", async () => {
    const signals = [fixtureSignal("Yemen"), fixtureSignal("Ukraine")];
    const root = await mountDesktopOpen(signals);
    try {
      const filterInput = document.querySelector('[data-testid="location-filter"]')!;
      await act(async () => typeInto(filterInput, "yem"));
      assert.equal(document.querySelectorAll('[data-testid="location-row"]').length, 1);

      await act(async () => typeInto(filterInput, ""));
      assert.equal(document.querySelectorAll('[data-testid="location-row"]').length, 2);
    } finally {
      await act(async () => root.unmount());
    }
  });
}

main();
