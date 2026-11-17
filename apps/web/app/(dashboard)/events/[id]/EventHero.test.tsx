// Rendered test (rule 13) for the event-detail page's server-rendered hero —
// title, summary, severity, times, and the outlet link must all be
// present from a plain fixture, with zero client fetch involved. Suspense/
// the heavier payload (market impact, related, chat, outcomes) live in
// EventDetailRest.tsx instead, which this file does not import, so this test
// doesn't hit the maplibre-gl CSS-import constraint documented in page.test.tsx.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement } from "@/lib/test-render";
import type { EventHeroProps } from "./EventHero";
import { EventDetailRestSkeleton } from "./EventDetailRestSkeleton";
import { buildEventSources, type RawEventRow } from "@/lib/event-sources";

const document = setupDom();

function runTest(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`✔ ${name}`);
    })
    .catch((err) => {
      console.error(`✖ ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

function fixture(overrides: Partial<EventHeroProps> = {}): EventHeroProps {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    title: "Strait traffic slows after reported strikes",
    summary: "Tankers are waiting longer to transit; insurers have raised war-risk premiums for the route.",
    severity: 8,
    country: "Yemen",
    mediaImpactEntity: null,
    mediaImpactCaveat: null,
    sourcesCount: 2,
    createdAt: "2026-11-01T12:00:00.000Z",
    updatedAt: "2026-11-01T12:00:00.000Z",
    sources: [
      {
        title: "Tankers delayed near strait",
        url: "https://example.com/strait-delay",
        sourceLabel: "Example Wire",
        domain: "example.com",
        publishedAt: "2026-11-01T08:00:00.000Z",
      },
    ],
    firstReportAt: "2026-11-01T08:00:00.000Z",
    firstReportKind: "publisher",
    firstFetchedAt: "2026-11-01T08:10:00.000Z",
    ...overrides,
  };
}

async function main() {
  const { EventHero } = await import("./EventHero");

  await runTest("first render contains the title and summary with no client fetch", async () => {
    const { html, root } = await renderElement(document, createElement(EventHero, fixture()));
    try {
      assert.match(html, /Strait traffic slows after reported strikes/);
      assert.match(
        html,
        /Tankers are waiting longer to transit; insurers have raised war-risk premiums for the route\./,
      );
      assert.match(html, /data-testid="event-hero-summary"/);
      assert.match(html, /Signal Summary/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("an available source link renders the outlet name as a clickable link", async () => {
    const { root } = await renderElement(document, createElement(EventHero, fixture()));
    try {
      const link = document.querySelector('[data-testid="event-hero-source"] a') as HTMLAnchorElement;
      assert.ok(link, "expected an outlet link");
      assert.equal(link.getAttribute("href"), "https://example.com/strait-delay");
      assert.equal(link.getAttribute("rel"), "noopener noreferrer");
      assert.equal(link.getAttribute("target"), "_blank");
      assert.equal(link.textContent, "Example Wire");
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("a source with no url shows the outlet name as plain text, never an invented link", async () => {
    const { root } = await renderElement(
      document,
      createElement(
        EventHero,
        fixture({
          sources: [
            {
              title: "Wire report, no link",
              url: null,
              sourceLabel: "Reuters",
              domain: null,
              publishedAt: "2026-11-01T08:00:00.000Z",
            },
          ],
        }),
      ),
    );
    try {
      const container = document.querySelector('[data-testid="event-hero-source"]');
      assert.ok(container, "expected the source block to render");
      assert.equal(container?.querySelector("a"), null, "must not invent a link");
      assert.match(container?.textContent ?? "", /Reuters/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("no linked sources renders the hero with no source line at all", async () => {
    const { html, root } = await renderElement(
      document,
      createElement(EventHero, fixture({ sources: [] })),
    );
    try {
      assert.doesNotMatch(html, /data-testid="event-hero-source"/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("first paint shows the title and summary plus heavy-block skeletons, and does not fetch", async () => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const { html, root } = await renderElement(
      document,
      createElement(
        "div",
        null,
        createElement(EventHero, fixture()),
        createElement(EventDetailRestSkeleton),
      ),
    );
    try {
      assert.match(html, /Strait traffic slows after reported strikes/);
      assert.match(html, /Tankers are waiting longer to transit/);
      assert.ok(document.querySelector('[data-testid="event-detail-rest-skeleton"]'));
      assert.equal(calls.length, 0);
    } finally {
      globalThis.fetch = original;
      await act(async () => root.unmount());
    }
  });

  // React error #31 regression: the event-page hero crashed with HTTP 500 for
  // any signal whose linked raw_events came from NewsAPI, because
  // buildEventSources once copied raw_data.source straight into sourceLabel —
  // a plain string for RSS/GDELT, but NewsAPI's own { id, url, name, country }
  // object. EventHero then rendered that object as the outlet name JSX child.
  // These four cases cover a string source, an object source, no linked raw
  // events at all, and a null source with no url/domain fallback either.
  await runTest("a raw_data.source string renders as the outlet name", async () => {
    const rows: RawEventRow[] = [
      {
        title: "Wire report",
        event_date: "2026-11-01T08:00:00.000Z",
        created_at: "2026-11-01T08:10:00.000Z",
        source: "newsapi",
        raw_data: { url: null, source: "Reuters", domain: null },
      },
    ];
    const { html, root } = await renderElement(
      document,
      createElement(EventHero, fixture({ sources: buildEventSources(rows) })),
    );
    try {
      assert.match(html, /Reuters/);
      assert.doesNotMatch(html, /\[object Object\]/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest(
    "a raw_data.source object ({ id, url, name, country }) renders its name, not the object",
    async () => {
      const rows: RawEventRow[] = [
        {
          title: "Iran: 3 oil tankers hit naval mines in Strait of Hormuz",
          event_date: "2026-11-14T16:04:00.000Z",
          created_at: "2026-11-14T16:10:00.000Z",
          source: "newsapi",
          raw_data: {
            url: "https://www.manilatimes.net/2026/11/15/world/story",
            source: {
              id: "7c666ee953f873d3057b310220f510df",
              url: "https://www.manilatimes.net",
              name: "The Manila Times",
              country: "ph",
            },
            domain: null,
          },
        },
      ];
      const { html, root } = await renderElement(
        document,
        createElement(EventHero, fixture({ sources: buildEventSources(rows) })),
      );
      try {
        assert.match(html, /The Manila Times/);
        assert.doesNotMatch(html, /\[object Object\]/);
      } finally {
        await act(async () => root.unmount());
      }
    },
  );

  await runTest("no linked raw events (empty list) renders without throwing", async () => {
    const rows: RawEventRow[] = [];
    const { html, root } = await renderElement(
      document,
      createElement(EventHero, fixture({ sources: buildEventSources(rows) })),
    );
    try {
      assert.doesNotMatch(html, /data-testid="event-hero-source"/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("a null raw_data.source with no url or domain falls back to the title", async () => {
    const rows: RawEventRow[] = [
      {
        title: "Untitled wire report",
        event_date: "2026-11-01T08:00:00.000Z",
        created_at: "2026-11-01T08:10:00.000Z",
        source: "gdelt",
        raw_data: { url: null, source: null, domain: null },
      },
    ];
    const { html, root } = await renderElement(
      document,
      createElement(EventHero, fixture({ sources: buildEventSources(rows) })),
    );
    try {
      assert.match(html, /Untitled wire report/);
      assert.doesNotMatch(html, /\[object Object\]/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("severity and country render", async () => {
    const { html, root } = await renderElement(document, createElement(EventHero, fixture()));
    try {
      assert.match(html, />8</);
      assert.match(html, /Yemen/);
    } finally {
      await act(async () => root.unmount());
    }
  });
}

void main();
