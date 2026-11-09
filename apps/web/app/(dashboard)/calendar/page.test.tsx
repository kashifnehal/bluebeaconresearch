import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
// next/link's prefetch-on-visible wiring calls requestIdleCallback, which
// references the browser global `self` — absent under plain linkedom.
if (typeof g.self === "undefined") g.self = g;
if (typeof (window as any).self === "undefined") (window as any).self = window;

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
  scheduleStatus: "confirmed" | "tentative" | "unpublished" | "cancelled";
  lastCheckedAt: string;
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
    scheduleStatus: "confirmed",
    lastCheckedAt: "2026-10-27",
    ...overrides,
  };
}

async function main() {
  const {
    EventTable,
    OptionsIvNote,
    ScheduleEndNotice,
    WeeklyRhythmRow,
    NextEventChip,
    MyCommoditiesToggle,
    OfficialFiguresPanel,
    HistoricalContextPanels,
  } = await import("./page");
  const { weeklyRhythm } = await import("@/lib/calendar-rhythm");
  const { eventMatchesSymbols } = await import("@/lib/calendar-filters");
  const { formatOfficialFigures } = await import("@/lib/calendar-values");

  // Mirrors exactly how CalendarPage wires useMyPreferences()'s output into
  // MyCommoditiesToggle + eventMatchesSymbols + EventTable — built here from
  // real exports, with "my symbols" passed in directly (stubbed, standing in
  // for a resolved preferences+watchlist union) rather than mounting the
  // Supabase-backed hook itself.
  function MyCommoditiesTestHarness({
    events,
    mySymbols,
  }: {
    events: Fixture[];
    mySymbols: string[];
  }) {
    const [onlyMine, setOnlyMine] = useState(mySymbols.length > 0);
    const visible = onlyMine ? events.filter((e) => eventMatchesSymbols(e, mySymbols)) : events;
    return createElement(
      "div",
      null,
      createElement(MyCommoditiesToggle, { checked: onlyMine, onChange: setOnlyMine }),
      createElement(EventTable, {
        events: visible,
        timeZone: "utc",
        highlightAllMarkets: onlyMine,
        visibleColumns: { forecast: false, previous: false, actual: false },
      }),
    );
  }

  await runTest("My commodities toggle defaults on when my symbols is non-empty, filtering out non-matching events", async () => {
    const events = [
      fixtureEvent({ id: "evt-energy", category: "Energy", event: "EIA Weekly Petroleum Status Report" }),
      fixtureEvent({ id: "evt-agri", category: "Agriculture", event: "USDA WASDE" }),
      fixtureEvent({ id: "evt-macro", category: "Monetary policy", event: "FOMC Interest Rate Decision" }),
    ];
    const { html, root } = await mount(createElement(MyCommoditiesTestHarness, { events, mySymbols: ["USOIL"] }));
    try {
      assert.match(html, /aria-pressed="true"/);
      const text = visibleText(html);
      assert.match(text, /EIA Weekly Petroleum Status Report/); // Energy -> USOIL matches
      assert.doesNotMatch(text, /USDA WASDE/); // Agriculture -> WHEAT\/CORN, no match
      assert.match(text, /FOMC Interest Rate Decision/); // unmapped macro event always stays
      assert.match(html, /data-testid="calendar-all-markets-tag"/);

      // Toggle off — everything (including USDA WASDE) should reappear.
      const toggle = document.querySelector('[data-testid="calendar-my-commodities-toggle"]')!;
      await act(async () => {
        (toggle as HTMLElement).click();
      });
      const offText = visibleText(document.body.innerHTML);
      assert.match(offText, /USDA WASDE/);
      assert.match(document.body.innerHTML, /aria-pressed="false"/);

      // Toggle back on — USDA WASDE should hide again.
      await act(async () => {
        (toggle as HTMLElement).click();
      });
      const onAgainText = visibleText(document.body.innerHTML);
      assert.doesNotMatch(onAgainText, /USDA WASDE/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("My commodities toggle defaults off when my symbols is empty", async () => {
    const events = [fixtureEvent({ id: "evt-agri", category: "Agriculture", event: "USDA WASDE" })];
    const { html, root } = await mount(createElement(MyCommoditiesTestHarness, { events, mySymbols: [] }));
    try {
      assert.match(html, /aria-pressed="false"/);
      assert.match(visibleText(html), /USDA WASDE/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("mounting the page sends exactly one calendar_viewed usage event", async () => {
    const { AppRouterContext } = await import(
      "next/dist/shared/lib/app-router-context.shared-runtime.js"
    );

    const eventsSent: { eventType: string; metadata?: unknown }[] = [];
    const originalFetch = g.fetch;
    g.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/market-impact")) {
        return new Response(JSON.stringify({ magnitudes: {} }), { status: 200 });
      }
      if (url.includes("/api/events") && init?.method === "POST") {
        eventsSent.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ inserted: true }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    };

    const fakeRouter = {
      push: () => {},
      replace: () => {},
      back: () => {},
      forward: () => {},
      refresh: () => {},
      prefetch: async () => {},
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { default: CalendarPage } = await import("./page");

    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(
          createElement(
            AppRouterContext.Provider,
            { value: fakeRouter },
            createElement(QueryClientProvider, { client }, createElement(CalendarPage)),
          ),
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      const viewedCalls = eventsSent.filter((e) => e.eventType === "calendar_viewed");
      assert.equal(viewedCalls.length, 1);

      const toggle = document.querySelector('[data-testid="calendar-my-commodities-toggle"]')!;
      await act(async () => {
        (toggle as HTMLElement).click();
      });

      const toggledCalls = eventsSent.filter((e) => e.eventType === "calendar_my_commodities_toggled");
      assert.equal(toggledCalls.length, 1);
      assert.deepEqual(toggledCalls[0].metadata, { on: true });
    } finally {
      await act(async () => root.unmount());
      g.fetch = originalFetch;
    }
  });

  await runTest("page copy: new description, sourced-footer date, and 'Week Ahead' breadcrumb", async () => {
    const { AppRouterContext } = await import(
      "next/dist/shared/lib/app-router-context.shared-runtime.js"
    );
    const originalFetch = g.fetch;
    g.fetch = async () => new Response(JSON.stringify({ magnitudes: {} }), { status: 200 });
    const fakeRouter = {
      push: () => {},
      replace: () => {},
      back: () => {},
      forward: () => {},
      refresh: () => {},
      prefetch: async () => {},
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { default: CalendarPage } = await import("./page");
    const calendarData = (await import("@/data/economic-calendar.json")).default;

    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(
          createElement(
            AppRouterContext.Provider,
            { value: fakeRouter },
            createElement(QueryClientProvider, { client }, createElement(CalendarPage)),
          ),
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      const text = visibleText(document.body.innerHTML);
      assert.match(
        text,
        /The scheduled releases that move the commodities Blue Beacon tracks: central bank decisions, official energy and farm reports, and policy meetings\./,
      );
      const oldestLastCheckedAt = calendarData.events.reduce(
        (oldest, e) => (e.lastCheckedAt < oldest ? e.lastCheckedAt : oldest),
        calendarData.events[0].lastCheckedAt,
      );
      const sourcedAtFormatted = new Date(`${oldestLastCheckedAt}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
      assert.match(text, new RegExp(`last checked on ${sourcedAtFormatted}`));
      // The footer must never claim a check as recent as today's sourcedAt
      // when an older row exists — that is exactly the contradiction being fixed.
      assert.notEqual(oldestLastCheckedAt, calendarData._meta.sourcedAt);
      assert.doesNotMatch(text, /Forecast/);
      const breadcrumbs = document.querySelector('[data-testid="breadcrumbs"]')!;
      const breadcrumbText = visibleText(breadcrumbs.innerHTML);
      assert.match(breadcrumbText, /Week Ahead/);
      assert.doesNotMatch(breadcrumbText, /^Calendar$|Dashboard Calendar$/);
    } finally {
      await act(async () => root.unmount());
      g.fetch = originalFetch;
    }
  });

  await runTest("clicking a source link sends calendar_source_clicked with only the event id", async () => {
    const eventsSent: { eventType: string; metadata?: unknown }[] = [];
    const originalFetch = g.fetch;
    g.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/events") && init?.method === "POST") {
        eventsSent.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ inserted: true }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    };
    try {
      const events = [fixtureEvent({ id: "evt-click-me" })];
      const { root } = await mount(
        createElement(EventTable, {
          events,
          timeZone: "utc",
          visibleColumns: { forecast: false, previous: false, actual: false },
        }),
      );
      try {
        const link = document.querySelector('a[href="https://www.eia.gov/petroleum/supply/weekly/schedule.php"]')!;
        await act(async () => {
          (link as HTMLElement).click();
        });
        const clickCalls = eventsSent.filter((e) => e.eventType === "calendar_source_clicked");
        assert.equal(clickCalls.length, 1);
        assert.deepEqual(clickCalls[0].metadata, { id: "evt-click-me" });
      } finally {
        await act(async () => root.unmount());
      }
    } finally {
      g.fetch = originalFetch;
    }
  });

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
      // Wednesday's EIA entry has a confirmed sourceUrl — it should link out.
      assert.match(html, /href="https:\/\/www\.eia\.gov\/petroleum\/supply\/weekly\/schedule\.php"/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("every event row's source label links to its sourceUrl, opening in a new tab", async () => {
    const events = [fixtureEvent({ sourceUrl: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", sourceLabel: "federalreserve.gov" })];
    const { html, root } = await mount(
      createElement(EventTable, { events, timeZone: "utc" }),
    );
    try {
      assert.match(html, /href="https:\/\/www\.federalreserve\.gov\/monetarypolicy\/fomccalendars\.htm"/);
      assert.match(html, /target="_blank"/);
      assert.match(html, /rel="noopener noreferrer"/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("a 'tentative' scheduleStatus shows the Tentative tag; a confirmed row does not", async () => {
    const events = [
      fixtureEvent({ id: "evt-tentative", scheduleStatus: "tentative" }),
      fixtureEvent({ id: "evt-confirmed", scheduleStatus: "confirmed" }),
    ];
    const { html, root } = await mount(
      createElement(EventTable, { events, timeZone: "utc" }),
    );
    try {
      const tags = html.match(/data-testid="calendar-schedule-status-tag"/g) ?? [];
      assert.equal(tags.length, 2); // one per layout (mobile card + desktop row) for the single tentative event
      assert.match(html, /data-status="tentative"/);
      assert.doesNotMatch(html, /data-status="confirmed"/); // confirmed rows render no tag at all
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("every scheduleStatus value renders a row with the right tag (or no tag for confirmed)", async () => {
    const events = (["confirmed", "tentative", "unpublished", "cancelled"] as const).map((scheduleStatus) =>
      fixtureEvent({ id: `evt-${scheduleStatus}`, scheduleStatus }),
    );
    const { html, root } = await mount(createElement(EventTable, { events, timeZone: "utc" }));
    try {
      assert.match(html, /data-status="tentative"/);
      assert.match(html, /data-status="unpublished"/);
      assert.match(html, /data-status="cancelled"/);
      const rows = html.match(/data-testid="calendar-event-row"/g) ?? [];
      assert.equal(rows.length, 4);
      // "Checked <date>" line renders for every row regardless of status
      const checkedLines = html.match(/data-testid="calendar-last-checked"/g) ?? [];
      assert.equal(checkedLines.length, 8); // mobile card + desktop row per event
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
      createElement(EventTable, { events, timeZone: "utc" }),
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

  const officialFigureRows = [
    {
      series_id: "WCESTUS1",
      period: "2026-10-17",
      value: 425300,
      unit: "thousand barrels",
      source_url: "https://www.eia.gov/petroleum/supply/weekly/",
      released_at: "2026-10-22T14:30:00Z",
      fetched_at: "2026-10-22T15:00:00Z",
    },
    {
      series_id: "WCESTUS1",
      period: "2026-10-10",
      value: 423000,
      unit: "thousand barrels",
      source_url: "https://www.eia.gov/petroleum/supply/weekly/",
      released_at: "2026-10-15T14:30:00Z",
      fetched_at: "2026-10-15T15:00:00Z",
    },
    {
      series_id: "NW2_EPG0_SWO_R48_BCF",
      period: "2026-10-17",
      value: 3812,
      unit: "Bcf",
      source_url: "https://www.eia.gov/naturalgas/storage/",
      released_at: "2026-10-22T14:30:00Z",
      fetched_at: "2026-10-22T15:00:00Z",
    },
    {
      series_id: "NW2_EPG0_SWO_R48_BCF",
      period: "2026-10-10",
      value: 3790,
      unit: "Bcf",
      source_url: "https://www.eia.gov/naturalgas/storage/",
      released_at: "2026-10-15T14:30:00Z",
      fetched_at: "2026-10-15T15:00:00Z",
    },
  ];

  await runTest("OfficialFiguresPanel renders nothing when there are no figures", async () => {
    const { html, root } = await mount(createElement(OfficialFiguresPanel, { figures: [] }));
    try {
      assert.doesNotMatch(html, /calendar-official-figures/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("OfficialFiguresPanel shows both series with a footer link to each sourceUrl", async () => {
    const figures = formatOfficialFigures(officialFigureRows);
    const { html, root } = await mount(createElement(OfficialFiguresPanel, { figures }));
    try {
      assert.match(html, /data-testid="calendar-official-figures"/);
      const text = visibleText(html);
      assert.match(text, /U\.S\. commercial crude oil stocks/);
      assert.match(text, /U\.S\. Lower 48 working gas in storage/);
      assert.match(text, /425\.3/);
      assert.match(text, /3812/);
      assert.match(text, /million barrels/);
      assert.match(text, /Bcf/);
      assert.match(html, /href="https:\/\/www\.eia\.gov\/petroleum\/supply\/weekly\/"/);
      assert.match(html, /href="https:\/\/www\.eia\.gov\/naturalgas\/storage\/"/);
      assert.match(text, /Source: U\.S\. Energy Information Administration \(October 2026\)/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("full page: official figures panel is hidden and no usage event fires when the route returns no values", async () => {
    const { AppRouterContext } = await import(
      "next/dist/shared/lib/app-router-context.shared-runtime.js"
    );
    const eventsSent: { eventType: string }[] = [];
    const originalFetch = g.fetch;
    g.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/market-impact")) return new Response(JSON.stringify({ magnitudes: {} }), { status: 200 });
      if (url.includes("/api/calendar/values")) return new Response(JSON.stringify({ values: [] }), { status: 200 });
      if (url.includes("/api/events") && init?.method === "POST") {
        eventsSent.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ inserted: true }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    };
    const fakeRouter = { push: () => {}, replace: () => {}, back: () => {}, forward: () => {}, refresh: () => {}, prefetch: async () => {} };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { default: CalendarPage } = await import("./page");

    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(
          createElement(
            AppRouterContext.Provider,
            { value: fakeRouter },
            createElement(QueryClientProvider, { client }, createElement(CalendarPage)),
          ),
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      assert.doesNotMatch(document.body.innerHTML, /calendar-official-figures/);
      assert.equal(eventsSent.filter((e) => e.eventType === "calendar_values_shown").length, 0);
    } finally {
      await act(async () => root.unmount());
      g.fetch = originalFetch;
    }
  });

  await runTest("full page: official figures panel shows and fires calendar_values_shown exactly once when the route returns rows", async () => {
    const { AppRouterContext } = await import(
      "next/dist/shared/lib/app-router-context.shared-runtime.js"
    );
    const eventsSent: { eventType: string }[] = [];
    const originalFetch = g.fetch;
    g.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/market-impact")) return new Response(JSON.stringify({ magnitudes: {} }), { status: 200 });
      if (url.includes("/api/calendar/values")) return new Response(JSON.stringify({ values: officialFigureRows }), { status: 200 });
      if (url.includes("/api/events") && init?.method === "POST") {
        eventsSent.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ inserted: true }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    };
    const fakeRouter = { push: () => {}, replace: () => {}, back: () => {}, forward: () => {}, refresh: () => {}, prefetch: async () => {} };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { default: CalendarPage } = await import("./page");

    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(
          createElement(
            AppRouterContext.Provider,
            { value: fakeRouter },
            createElement(QueryClientProvider, { client }, createElement(CalendarPage)),
          ),
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      assert.match(document.body.innerHTML, /calendar-official-figures/);
      assert.equal(eventsSent.filter((e) => e.eventType === "calendar_values_shown").length, 1);
    } finally {
      await act(async () => root.unmount());
      g.fetch = originalFetch;
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

  // 2026-11-09 (TASK W-CALENDAR Part 4): magnitude/method-note rendering moved
  // out of EventTable entirely and into the section-level HistoricalContextPanels
  // component, so it renders once per category instead of once per row.
  await runTest("HistoricalContextPanels: magnitude line drops the sample size; it only shows behind 'View historical pattern'", async () => {
    const events = [fixtureEvent({ id: "evt-energy", category: "Energy" })];
    const marketImpact = {
      USOIL: {
        magnitude: { medianMovePct: 0.97, sampleSize: 1232, unchangedCount: 0 },
        timeHorizonLabel: "multi-day" as const,
        baselines: [
          { windowHours: 24, medianMovePct: 1.46, windowCount: 1204, eventRowsMatched: 1232, spanDays: 88 },
        ],
      },
    };
    const { html, root } = await mount(
      createElement(HistoricalContextPanels, { events, marketImpact }),
    );
    try {
      assert.match(html, /data-testid="calendar-magnitude-line"/);
      const text = visibleText(html);
      assert.equal(text.includes("Across 1232 tracked BBR signals"), false);
      assert.match(text, /For comparison, across 1204 USOIL price windows/);

      assert.match(html, /data-testid="calendar-method-note-toggle"/);
      // <details> with no `open` attribute renders collapsed by default.
      assert.equal(/<details(?![^>]*\sopen)[^>]*class="group"/.test(html), true);
      assert.match(text, /Method: 1232 tracked BBR signals that listed USOIL/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("HistoricalContextPanels: no panel renders when the category has no magnitude data", async () => {
    const events = [fixtureEvent({ id: "evt-energy", category: "Energy" })];
    const { html, root } = await mount(
      createElement(HistoricalContextPanels, { events, marketImpact: {} }),
    );
    try {
      assert.equal(html.includes("data-testid=\"calendar-method-note-toggle\""), false);
      assert.equal(html.includes("data-testid=\"calendar-magnitude-line\""), false);
    } finally {
      await act(async () => root.unmount());
    }
  });

  // Part 4's core requirement: one panel per event TYPE, not per row — this is
  // the regression test for the reported bug ("the same stats block repeats 22
  // times"). 3 Energy-category rows must still produce exactly 1 panel.
  await runTest("HistoricalContextPanels renders exactly one panel per category, regardless of how many rows share that category", async () => {
    const events = [
      fixtureEvent({ id: "evt-energy-1", category: "Energy" }),
      fixtureEvent({ id: "evt-energy-2", category: "Energy" }),
      fixtureEvent({ id: "evt-energy-3", category: "Energy" }),
      fixtureEvent({ id: "evt-growth-1", category: "Growth" }),
    ];
    const marketImpact = {
      USOIL: {
        magnitude: { medianMovePct: 0.97, sampleSize: 1232, unchangedCount: 0 },
        timeHorizonLabel: "multi-day" as const,
        baselines: [
          { windowHours: 24, medianMovePct: 1.46, windowCount: 1204, eventRowsMatched: 1232, spanDays: 88 },
        ],
      },
    };
    const { html, root } = await mount(createElement(HistoricalContextPanels, { events, marketImpact }));
    try {
      const panels = html.match(/data-testid="calendar-historical-panel"/g) ?? [];
      assert.equal(panels.length, 1); // only Energy has magnitude data mapped above; still 1, not 3
      assert.doesNotMatch(html, /BBR importance/i); // Part 4: no BBR importance tag added
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("subscribe-feed link exists with a webcal href, alongside the export button", async () => {
    const { AppRouterContext } = await import(
      "next/dist/shared/lib/app-router-context.shared-runtime.js"
    );
    const originalFetch = g.fetch;
    g.fetch = async () => new Response(JSON.stringify({ magnitudes: {} }), { status: 200 });
    const fakeRouter = {
      push: () => {},
      replace: () => {},
      back: () => {},
      forward: () => {},
      refresh: () => {},
      prefetch: async () => {},
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { default: CalendarPage } = await import("./page");

    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(
          createElement(
            AppRouterContext.Provider,
            { value: fakeRouter },
            createElement(QueryClientProvider, { client }, createElement(CalendarPage)),
          ),
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      const link = document.querySelector('[data-testid="calendar-subscribe-feed"]');
      assert.ok(link, "calendar-subscribe-feed link not found");
      const href = link!.getAttribute("href") ?? "";
      assert.ok(
        href.startsWith("webcal://www.bluebeaconresearch.com/api/calendar/feed"),
        `unexpected href: ${href}`,
      );
      const exportButton = document.querySelector('[data-testid="calendar-export-ics"]');
      assert.ok(exportButton, "calendar-export-ics button should still exist");
    } finally {
      await act(async () => root.unmount());
      g.fetch = originalFetch;
    }
  });

  // Part 5 (TASK W-CALENDAR, 2026-11-09): the reported bug happened on a
  // Sunday, so the regression test mocks the clock to Sunday 8 Nov 2026
  // 10:00 UTC and renders the real page against the real data file. A
  // Sunday-dated event (opec-plus-2026-11-01, the Sunday *before* this
  // fixture's week) must NOT show in This Week, and the Mon-Sun week
  // containing the fixture's Sunday must.
  await runTest("renders correctly on a Sunday fixture (8 Nov 2026 10:00 UTC): current week is Mon 2 Nov - Sun 8 Nov", async () => {
    const { AppRouterContext } = await import(
      "next/dist/shared/lib/app-router-context.shared-runtime.js"
    );
    const originalFetch = g.fetch;
    g.fetch = async () => new Response(JSON.stringify({ magnitudes: {} }), { status: 200 });
    const fakeRouter = {
      push: () => {},
      replace: () => {},
      back: () => {},
      forward: () => {},
      refresh: () => {},
      prefetch: async () => {},
    };

    const FIXED_NOW = new Date("2026-11-08T10:00:00.000Z").getTime();
    const OriginalDate = Date;
    class MockDate extends OriginalDate {
      constructor(...args: ConstructorParameters<typeof Date> | []) {
        if (args.length === 0) {
          super(FIXED_NOW);
        } else {
          super(...args);
        }
      }
      static now() {
        return FIXED_NOW;
      }
    }
    g.Date = MockDate as unknown as typeof Date;

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { default: CalendarPage } = await import("./page");

    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(
          createElement(
            AppRouterContext.Provider,
            { value: fakeRouter },
            createElement(QueryClientProvider, { client }, createElement(CalendarPage)),
          ),
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      const html = document.body.innerHTML as string;

      const thisWeekSection = document.querySelector('[data-testid="calendar-this-week"]');
      assert.ok(thisWeekSection, "This Week section not found");
      // eia-petroleum-2026-11-04 (Wed) and us-nfp-2026-11-06 (Fri) are inside
      // the Mon 2 Nov - Sun 8 Nov week and must appear in This Week. (The EIA
      // report recurs weekly with an identical title/sourceUrl, so the date
      // text "Nov 4" — not the title — is what distinguishes this week's row
      // from every other week's.)
      assert.match(thisWeekSection!.innerHTML, /Nov 4<\/span>/); // eia-petroleum-2026-11-04
      assert.match(thisWeekSection!.innerHTML, /Nov 6<\/span>/); // us-nfp-2026-11-06
      // opec-plus-2026-11-01 is dated the *previous* Sunday (1 Nov) — the
      // week before this fixture's week — and must NOT show as this week's
      // (it must not appear anywhere at all, since dt < start for both lists).
      assert.doesNotMatch(thisWeekSection!.innerHTML, /Nov 1<\/span>/);
      // Next week's dates (the actual bug: these used to leak into "this
      // week" on a Sunday) must not appear in This Week either.
      assert.doesNotMatch(thisWeekSection!.innerHTML, /Nov 10<\/span>/);
      assert.doesNotMatch(thisWeekSection!.innerHTML, /Nov 12<\/span>/);

      const upcomingSection = document.querySelector('[data-testid="calendar-upcoming"]');
      assert.ok(upcomingSection, "Upcoming section not found");
      // us-cpi-2026-11-10 is in the following week (Mon 9 Nov - Sun 15 Nov)
      // and must show as upcoming, not this week.
      assert.match(upcomingSection!.innerHTML, /US Consumer Price Index/);
      assert.match(upcomingSection!.innerHTML, /Nov 10<\/span>/);
      // This week's own dates must not also leak into Upcoming.
      assert.doesNotMatch(upcomingSection!.innerHTML, /Nov 4<\/span>/);
      assert.doesNotMatch(upcomingSection!.innerHTML, /Nov 6<\/span>/);
      // opec-plus-2026-11-01 (the previous week) must not be in Upcoming either.
      assert.doesNotMatch(upcomingSection!.innerHTML, /Nov 1<\/span>/);
    } finally {
      await act(async () => root.unmount());
      g.fetch = originalFetch;
      g.Date = OriginalDate;
    }
  });

  await runTest(
    "CalendarSourcingFooter shows the oldest of two rows' check dates, never the newer one",
    async () => {
      const { CalendarSourcingFooter } = await import("./page");
      const { root } = await mount(
        createElement(CalendarSourcingFooter, {
          events: [{ lastCheckedAt: "2026-10-27" }, { lastCheckedAt: "2026-10-17" }],
        }),
      );
      try {
        const footer = document.querySelector('[data-testid="calendar-sourcing-footer"]');
        assert.match(footer?.textContent ?? "", /last checked on October 17, 2026/);
        assert.doesNotMatch(footer?.textContent ?? "", /October 27, 2026/);
      } finally {
        await act(async () => root.unmount());
      }
    },
  );
}

main();
