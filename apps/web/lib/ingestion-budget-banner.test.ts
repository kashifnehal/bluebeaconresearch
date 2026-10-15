import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { IngestionStatusBannerView } from "../components/IngestionStatusBanner";
import { allCollectorsBudgetClosed, newestStoredArticleIso } from "./ingestion-budget-banner";
import { safeFormatDistanceToNow } from "./utils";

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

const ARTICLE_AT = "2026-10-14T12:00:00.000Z";

function status(collectors: Record<string, { budgetClosed?: boolean } | null>, newest?: string) {
  const now = Date.now();
  return {
    status: {
      lastFetchedAt: new Date(now - 10 * 60 * 1000).toISOString(),
      nextFetchEstimate: new Date(now + 20 * 60 * 1000).toISOString(),
      totals: { inserted: 0, signals: 0, fetched: 0 },
      collectors,
      ...(newest ? { newestStoredArticleAt: newest } : {}),
    },
    cronIntervalMinutes: 30,
    degraded: false,
  };
}

function render(data: Parameters<typeof IngestionStatusBannerView>[0]["data"]): string {
  return visibleText(renderToStaticMarkup(createElement(IngestionStatusBannerView, { data })));
}

runTest("all collectors closed shows the live state, the article time, and no paused text", () => {
  const collectors = {
    gdelt: { budgetClosed: true },
    gnews: { budgetClosed: true },
    rss: { budgetClosed: true },
  };
  assert.equal(allCollectorsBudgetClosed(collectors), true);
  assert.equal(newestStoredArticleIso({ newestStoredArticleAt: ARTICLE_AT }), ARTICLE_AT);

  const text = render(status(collectors, ARTICLE_AT));
  const relative = safeFormatDistanceToNow(ARTICLE_AT, { addSuffix: true });
  assert.doesNotMatch(text, /paused/i);
  assert.ok(text.includes("Live ingestion"));
  assert.ok(text.includes("Last fetched"));
  assert.ok(text.includes(`Last collected: ${relative}`));
  assert.ok(text.includes("Next run"));
  assert.ok(text.includes("Every 30 min"));
});

runTest("all collectors closed still shows the live state when the last fetch is old", () => {
  const now = Date.now();
  const text = render({
    status: {
      lastFetchedAt: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
      nextFetchEstimate: new Date(now + 20 * 60 * 1000).toISOString(),
      totals: { inserted: 0, signals: 0, fetched: 0 },
      collectors: {
        gdelt: { budgetClosed: true },
        gnews: { budgetClosed: true },
        rss: { budgetClosed: true },
      },
      newestStoredArticleAt: ARTICLE_AT,
    },
    cronIntervalMinutes: 30,
    degraded: false,
  });
  assert.doesNotMatch(text, /paused/i);
  assert.ok(text.includes("Live ingestion"));
  assert.equal(text.includes("Ingestion delayed"), false);
});

runTest("all collectors closed omits Last collected when no article time is present", () => {
  const text = render(
    status({
      gdelt: { budgetClosed: true },
      gnews: { budgetClosed: true },
      rss: { budgetClosed: true },
    }),
  );
  assert.doesNotMatch(text, /paused/i);
  assert.ok(text.includes("Live ingestion"));
  assert.ok(text.includes("Last fetched"));
  assert.equal(text.includes("Last collected"), false);
  assert.equal(newestStoredArticleIso({}), null);
  assert.equal(newestStoredArticleIso({ newestStoredArticleAt: "not-a-date" }), null);
});

runTest("one collector not budget-closed leaves the healthy lines", () => {
  const collectors = {
    gdelt: { budgetClosed: true },
    gnews: { budgetClosed: false },
    rss: { budgetClosed: true },
  };
  assert.equal(allCollectorsBudgetClosed(collectors), false);
  const text = render(status(collectors, ARTICLE_AT));
  assert.doesNotMatch(text, /paused/i);
  assert.equal(text.includes("Last collected"), false);
  assert.ok(text.includes("Last fetched"));
  assert.ok(text.includes("Next run"));
  assert.ok(text.includes("Every 30 min"));
  assert.ok(text.includes("Live ingestion"));
});

runTest("no collector budget-closed leaves the healthy lines", () => {
  const collectors = {
    gdelt: { budgetClosed: false },
    gnews: { budgetClosed: false },
    rss: { budgetClosed: false },
  };
  assert.equal(allCollectorsBudgetClosed(collectors), false);
  const text = render(status(collectors));
  assert.doesNotMatch(text, /paused/i);
  assert.ok(text.includes("Last fetched"));
  assert.ok(text.includes("Next run in"));
  assert.ok(text.includes("Every 30 min"));
});

runTest("a missing budgetClosed field is not closed", () => {
  const collectors = {
    gdelt: { budgetClosed: true },
    gnews: {},
    rss: { budgetClosed: true },
  };
  assert.equal(allCollectorsBudgetClosed(collectors), false);
  assert.equal(allCollectorsBudgetClosed({}), false);
  assert.equal(allCollectorsBudgetClosed(null), false);
  const text = render(status(collectors));
  assert.doesNotMatch(text, /paused/i);
  assert.ok(text.includes("Last fetched"));
  assert.ok(text.includes("Next run"));
  assert.ok(text.includes("Every 30 min"));
});
