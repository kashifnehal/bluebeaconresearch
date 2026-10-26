import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// Same linkedom + react-dom/client harness as components/signals/SignalQuickView.test.tsx
// and components/CommandPalette.test.tsx — see those files for why this setup is needed
// (React never attaches __reactFiber$* to host nodes under plain linkedom + react-dom/client,
// so native-dispatched input events no-op; calling onChange/onClick props directly, or
// element.click(), is the established workaround in this repo).

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

function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
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

async function mount(element: ReturnType<typeof createElement>): Promise<{ html: string; root: Root }> {
  document.body.replaceChildren();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  return { html: document.body.innerHTML, root };
}

type Fixture = {
  id: string;
  date: string;
  time: string | null;
  timeApprox: boolean;
  country: string;
  countryCode: string;
  event: string;
  category: string;
  impact: "high" | "medium" | "low";
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  sourceUrl: string;
  sourceLabel: string;
  status?: "confirmed" | "tentative";
};

function fixtureEvent(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: "evt-1",
    date: "2026-11-03",
    time: "12:00",
    timeApprox: false,
    country: "United States",
    countryCode: "US",
    event: "EIA Weekly Petroleum Status Report",
    category: "Energy",
    impact: "high",
    forecast: null,
    previous: null,
    actual: null,
    sourceUrl: "https://www.eia.gov/petroleum/supply/weekly/schedule.php",
    sourceLabel: "eia.gov",
    ...overrides,
  };
}

async function main() {
  const { EventTable, OptionsIvNote, ScheduleEndNotice, WeeklyRhythmRow, NextEventChip } = await import("./page");
  const { weeklyRhythm } = await import("@/lib/calendar-rhythm");

  await runTest("WeeklyRhythmRow renders every entry with its day and event name", async () => {
    const rhythm = weeklyRhythm();
    const { html, root } = await mount(createElement(WeeklyRhythmRow, { rhythm }));
    try {
      assert.match(html, /data-testid="calendar-weekly-rhythm"/);
      const entries = html.match(/data-testid="calendar-weekly-rhythm-entry"/g) ?? [];
      assert.equal(entries.length, rhythm.length);
      const text = visibleText(html);
      for (const entry of rhythm) {
        assert.match(text, new RegExp(entry.event.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
      // Wednesday's EIA entry is the only one with a known sourceUrl — it should link out.
      assert.match(html, /href="https:\/\/www\.eia\.gov\/petroleum\/supply\/weekly\/schedule\.php"/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("every event row's source label links to its sourceUrl, opening in a new tab", async () => {
    const events = [fixtureEvent({ sourceUrl: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", sourceLabel: "federalreserve.gov" })];
    const { html, root } = await mount(
      createElement(EventTable, { events, timeZone: "utc", marketImpact: null }),
    );
    try {
      assert.match(html, /href="https:\/\/www\.federalreserve\.gov\/monetarypolicy\/fomccalendars\.htm"/);
      assert.match(html, /target="_blank"/);
      assert.match(html, /rel="noopener noreferrer"/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("a 'tentative' status shows the Tentative tag; a confirmed/unset row does not", async () => {
    const events = [
      fixtureEvent({ id: "evt-tentative", status: "tentative" }),
      fixtureEvent({ id: "evt-confirmed" }),
    ];
    const { html, root } = await mount(
      createElement(EventTable, { events, timeZone: "utc", marketImpact: null }),
    );
    try {
      const tags = html.match(/data-testid="calendar-tentative-tag"/g) ?? [];
      assert.equal(tags.length, 2); // one per layout (mobile card + desktop row) for the single tentative event
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("NextEventChip shows 'Next: <event>, <time>' with no countdown numbers", async () => {
    const now = new Date("2026-10-26T12:00:00Z");
    const upcoming = fixtureEvent({
      id: "evt-next",
      event: "FOMC Interest Rate Decision",
      date: "2026-10-28",
      time: "18:00",
    });
    // `now` picks which fixture would be "next" in the real page — asserted
    // here by construction (2026-10-28 is after 2026-10-26).
    assert.ok(new Date(`${upcoming.date}T${upcoming.time}:00Z`).getTime() > now.getTime());
    const { html, root } = await mount(createElement(NextEventChip, { event: upcoming }));
    try {
      assert.match(html, /data-testid="calendar-next-chip"/);
      const text = visibleText(html);
      assert.match(text, /Next:/);
      assert.match(text, /FOMC Interest Rate Decision/);
      assert.doesNotMatch(text, /\d+d \d+h/); // no countdown digits
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("NextEventChip keeps the 'approx' wording when timeApprox is true", async () => {
    const upcoming = fixtureEvent({ id: "evt-approx", timeApprox: true });
    const { html, root } = await mount(createElement(NextEventChip, { event: upcoming }));
    try {
      assert.match(visibleText(html), /approx\.?/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("NextEventChip with no next event shows a plain message, not a crash", async () => {
    const { html, root } = await mount(createElement(NextEventChip, { event: null }));
    try {
      assert.match(html, /data-testid="calendar-next-chip"/);
      assert.match(visibleText(html), /No upcoming events/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("ScheduleEndNotice shows nothing when the last event is far out", async () => {
    const events = [fixtureEvent({ date: "2026-12-01" })];
    const today = new Date("2026-10-26T00:00:00Z");
    const { html, root } = await mount(createElement(ScheduleEndNotice, { events, today }));
    try {
      assert.doesNotMatch(html, /calendar-schedule-end-notice/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("ScheduleEndNotice shows the end date and 'added regularly' line within 14 days", async () => {
    const events = [fixtureEvent({ date: "2026-11-03" })];
    const today = new Date("2026-10-26T00:00:00Z");
    const { html, root } = await mount(createElement(ScheduleEndNotice, { events, today }));
    try {
      assert.match(html, /data-testid="calendar-schedule-end-notice"/);
      const text = visibleText(html);
      assert.match(text, /ends on/);
      assert.match(text, /Nov(ember)? 3,? 2026|November 3/);
      assert.match(text, /More dates are added regularly/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("OptionsIvNote cites Ederington and Lee, not Wright, and keeps its testid", async () => {
    const { html, root } = await mount(createElement(OptionsIvNote));
    try {
      assert.match(html, /data-testid="calendar-iv-note"/);
      const text = visibleText(html);
      assert.match(text, /Ederington and Lee/);
      assert.doesNotMatch(text, /Wright/);
      assert.doesNotMatch(text, /crush/);
      assert.doesNotMatch(text, /Cboe/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("no '—' value cell renders when forecast/previous/actual are all null", async () => {
    const events = [fixtureEvent(), fixtureEvent({ id: "evt-2", category: "Agriculture" })];
    const { html, root } = await mount(
      createElement(EventTable, {
        events,
        timeZone: "utc",
        marketImpact: null,
        visibleColumns: { forecast: false, previous: false, actual: false },
      }),
    );
    try {
      assert.doesNotMatch(visibleText(html), /—/);
      assert.doesNotMatch(html, /Forecast/);
      assert.doesNotMatch(html, /Previous/);
      assert.doesNotMatch(html, />Actual</);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("no impact bar renders — a plain category tag shows instead", async () => {
    const events = [fixtureEvent()];
    const { html, root } = await mount(
      createElement(EventTable, { events, timeZone: "utc", marketImpact: null }),
    );
    try {
      assert.match(html, /data-testid="calendar-category-tag"/);
      assert.doesNotMatch(html, /High impact/);
      assert.doesNotMatch(html, /🔴|🟡|🟢/);
      assert.match(visibleText(html), /Energy/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("a value column shows once any event in the list has a value, others stay hidden", async () => {
    const events = [
      fixtureEvent({ id: "evt-1", forecast: "2.1%" }),
      fixtureEvent({ id: "evt-2", forecast: null }),
    ];
    const { html, root } = await mount(
      createElement(EventTable, {
        events,
        timeZone: "utc",
        marketImpact: null,
        visibleColumns: { forecast: true, previous: false, actual: false },
      }),
    );
    try {
      assert.match(html, /Forecast/);
      assert.doesNotMatch(html, /Previous/);
      assert.match(visibleText(html), /2\.1%/);
      assert.match(visibleText(html), /—/); // the one evt-2 null forecast cell
    } finally {
      await act(async () => root.unmount());
    }
  });
}

main();
