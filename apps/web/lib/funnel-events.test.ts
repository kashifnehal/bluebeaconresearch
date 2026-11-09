// Render coverage for TASK W2-DB Part 4 (2026-11-09): logUsageEvent must skip
// POST /api/events entirely for a signed-out visitor (the route 401s without a
// session — this was wasted traffic on every public-reachable dashboard-group
// page). No Supabase env vars are set in this process, so AuthProvider
// genuinely resolves to no user (same "no Supabase configured" path
// apps/web/app/api/signals/route.test.ts relies on).
//
// The signed-in counterpart lives in its own file/process
// (funnel-events.signed-in.test.ts): AuthProvider's module-level
// hasSignedInUser()/waitForAuthResolved() state is a real page-load-lifetime
// singleton (by design — it mirrors production, where AuthProvider mounts
// exactly once per page load), so it can't be reset mid-process to try both
// outcomes in one file without faking a scenario that can't actually happen.
import assert from "node:assert/strict";
import { createElement, useEffect } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";

declare module "linkedom" {
  export function parseHTML(html: string): { window: any; document: Document };
}

const { window: domWindow, document } = parseHTML("<!doctype html><html><body></body></html>");
const g = globalThis as any;
for (const key of ["window", "document", "HTMLElement", "Element", "Node", "DocumentFragment", "MutationObserver"] as const) {
  Object.defineProperty(g, key, {
    value: key === "window" ? domWindow : key === "document" ? document : (domWindow as any)[key],
    configurable: true,
  });
}
g.IS_REACT_ACT_ENVIRONMENT = true;
if (typeof g.self === "undefined") g.self = g;
if (typeof (domWindow as any).self === "undefined") (domWindow as any).self = domWindow;

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
  const { AuthProvider } = await import("@/components/auth/AuthProvider");
  const { logUsageEvent } = await import("./funnel-events");

  // Fires unconditionally on mount, same as every real caller (e.g.
  // dashboard_viewed/calendar_viewed's own `useEffect(() => {...}, [])`) —
  // this runs before AuthProvider's sibling effect below has resolved
  // anything (child effects fire before parent effects on initial mount).
  // logUsageEvent itself must cross that race internally (waitForAuthResolved
  // in components/auth/AuthProvider.tsx), not this test working around it.
  function Caller({ eventType }: { eventType: string }) {
    useEffect(() => {
      logUsageEvent(eventType, undefined, false);
    }, [eventType]);
    return null;
  }

  await runTest("signed out: logUsageEvent never POSTs /api/events", async () => {
    let eventsCalls = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/events")) eventsCalls += 1;
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;
    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(createElement(AuthProvider, null, createElement(Caller, { eventType: "w2db_signed_out_probe" })));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      assert.equal(eventsCalls, 0, "a signed-out visitor must not POST /api/events");
      await act(async () => root.unmount());
    } finally {
      globalThis.fetch = original;
    }
  });
}

void main();
