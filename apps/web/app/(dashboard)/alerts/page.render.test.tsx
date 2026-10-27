// Full render coverage for Part 5 of TASK UI-ALL (PageHeader + the "Other
// views" nav removal + the channel Checkbox). page.test.tsx already covers
// alertsEmptyStateHeading as a pure function; this file renders the real
// page since, unlike WatchlistClient/ArchiveClient, it no longer uses any
// next/navigation hook (useRouter was removed along with the deleted nav).
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { setupDom, renderElement } from "@/lib/test-render";
import AlertsPage from "./page";

const document = setupDom();

function click(el: Element) {
  const event = new (globalThis as any).window.Event("click", { bubbles: true });
  el.dispatchEvent(event);
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

async function renderAlerts() {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/alert-rules")) {
      return new Response(JSON.stringify({ rules: [] }), { status: 200 });
    }
    if (url.startsWith("/api/alerts/recent")) {
      return new Response(JSON.stringify({ alerts: [], total: 0, hasMore: false }), { status: 200 });
    }
    if (url.startsWith("/api/alerts/rule-stats")) {
      return new Response(JSON.stringify({ stats: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as typeof fetch;

  const client = new QueryClient();
  const { root } = await renderElement(
    document,
    createElement(QueryClientProvider, { client }, createElement(AlertsPage)),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return { root, client, restoreFetch: () => (globalThis.fetch = original) };
}

async function main() {
  await runTest("one h1, '+ New Alert Rule' in the header actions, no 'Other views' nav", async () => {
    const { root, client, restoreFetch } = await renderAlerts();
    try {
      const html = document.body.innerHTML;
      const h1s = html.match(/<h1[^>]*>/g) ?? [];
      assert.equal(h1s.length, 1);
      assert.match(html, />Alert Rules &amp; Signals<\/h1>/);
      assert.doesNotMatch(html, /aria-label="Other views"/);
      assert.match(html, /data-testid="page-shell"/);

      const newRuleButton = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "+ New Alert Rule",
      );
      assert.ok(newRuleButton, "expected the + New Alert Rule button");
    } finally {
      restoreFetch();
      await act(async () => root.unmount());
      client.clear();
    }
  });

  await runTest("the channel Checkbox toggles a channel in the alert modal", async () => {
    const { root, client, restoreFetch } = await renderAlerts();
    try {
      const newRuleButton = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "+ New Alert Rule",
      );
      assert.ok(newRuleButton);
      await act(async () => {
        click(newRuleButton!);
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      const discordCheckbox = document.querySelector(
        '[data-testid="alert-channel-discord"]',
      ) as HTMLInputElement | null;
      assert.ok(discordCheckbox, "expected the discord channel checkbox");
      assert.equal(discordCheckbox!.checked, false);

      discordCheckbox!.checked = true;
      await act(async () => click(discordCheckbox!));
      assert.equal(discordCheckbox!.checked, true);
    } finally {
      restoreFetch();
      await act(async () => root.unmount());
      client.clear();
    }
  });
}

main();
