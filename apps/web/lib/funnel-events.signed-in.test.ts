// Signed-in counterpart to funnel-events.test.ts (TASK W2-DB Part 4,
// 2026-11-09), in its own process: a signed-in user's logUsageEvent call must
// still POST /api/events despite firing on mount before AuthProvider's own
// sibling effect has resolved anything (child effects run before parent
// effects on initial mount) — logUsageEvent awaits waitForAuthResolved()
// internally to cross that race instead of dropping the event.
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
  const { setupSignedInSupabase } = await import("./test-render");
  await setupSignedInSupabase(document);
  const { AuthProvider } = await import("@/components/auth/AuthProvider");
  const { logUsageEvent } = await import("./funnel-events");

  function Caller({ eventType }: { eventType: string }) {
    useEffect(() => {
      logUsageEvent(eventType, undefined, false);
    }, [eventType]);
    return null;
  }

  await runTest("signed in: logUsageEvent POSTs /api/events despite the mount-effect ordering race", async () => {
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
        root.render(createElement(AuthProvider, null, createElement(Caller, { eventType: "w2db_signed_in_probe" })));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      assert.ok(eventsCalls > 0, "a signed-in user's logUsageEvent call should POST /api/events");
      await act(async () => root.unmount());
    } finally {
      globalThis.fetch = original;
    }
  });
}

main().then(() => {
  // setupSignedInSupabase() creates a real browser auth client with a
  // token-refresh timer — exit so the test chain continues (same fix as
  // components/FirstTouchCapture.test.tsx).
  process.exit(process.exitCode ?? 0);
});
