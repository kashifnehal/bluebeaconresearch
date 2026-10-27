import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Root } from "react-dom/client";

import { setupDom, renderElement } from "@/lib/test-render";
import SettingsPage from "./page";

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

async function main() {
  await runTest("renders inside page-shell with no md:fixed element, and Notifications switches toggle", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;
    const client = new QueryClient();
    let root: Root | undefined;
    try {
      const rendered = await renderElement(
        document,
        createElement(QueryClientProvider, { client }, createElement(SettingsPage)),
      );
      root = rendered.root;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      assert.match(document.body.innerHTML, /data-testid="page-shell"/);
      assert.doesNotMatch(document.body.innerHTML, /md:fixed/);

      const notificationsTab = [...document.querySelectorAll("button")].find(
        (b) => b.textContent === "NOTIFICATIONS",
      );
      assert.ok(notificationsTab, "expected a NOTIFICATIONS tab button");
      await act(async () => click(notificationsTab!));

      const switches = document.querySelectorAll('[role="switch"]');
      assert.equal(switches.length, 3);

      const digest = document.querySelector('[aria-label="Daily digest email"]');
      assert.ok(digest, "expected the Daily Digest switch");
      assert.equal(digest!.getAttribute("aria-checked"), "true");

      const emailAlerts = document.querySelector('[aria-label="Email alerts"]');
      assert.ok(emailAlerts);
      assert.equal(emailAlerts!.getAttribute("aria-checked"), "true");
      await act(async () => click(emailAlerts!));
      assert.equal(emailAlerts!.getAttribute("aria-checked"), "false");

      const push = document.querySelector('[aria-label="Push notifications"]');
      assert.ok(push);
      assert.equal(push!.getAttribute("aria-checked"), "false");
      await act(async () => click(push!));
      assert.equal(push!.getAttribute("aria-checked"), "true");
    } finally {
      globalThis.fetch = original;
      await act(async () => root?.unmount());
      client.clear();
    }
  });
}

main();
