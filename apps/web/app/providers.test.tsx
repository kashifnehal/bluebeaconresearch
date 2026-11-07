// Counts Providers renders and fails if a consent or analytics effect loops.
import assert from "node:assert/strict";
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import { setupDom } from "@/lib/test-render";

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

async function main() {
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const g = globalThis as typeof globalThis & { window: Window & { matchMedia?: (q: string) => MediaQueryList } };
  if (typeof g.window.matchMedia !== "function") {
    g.window.matchMedia = () =>
      ({
        matches: false,
        media: "",
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() {
          return false;
        },
      }) as unknown as MediaQueryList;
  }

  const { Providers } = await import("./providers");
  let renders = 0;
  function CountingProviders({ children }: { children: ReactNode }) {
    renders += 1;
    if (renders > 4) {
      throw new Error(`provider rendered ${renders} times`);
    }
    return Providers({ children });
  }

  await runTest("Providers renders at most 4 times", async () => {
    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(createElement(CountingProviders, null, createElement("p", null, "child")));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      assert.ok(renders >= 1, "provider did not render");
      assert.ok(renders <= 4, `provider rendered ${renders} times`);
    } finally {
      await act(async () => root.unmount());
    }
  });
}

void main();
