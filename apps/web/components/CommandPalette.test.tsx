import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

const dir = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(dir, "CommandPalette.tsx"), "utf8");

// These two are not about the 503 case — kept as source-text checks, same as
// before this file's 503-specific tests below were converted to rendered ones.
runTest("the message only shows for the 503 case, not for a normal 'nothing matched' result", () => {
  assert.match(
    source,
    /const assistUnavailable =\s*\n\s*assistEnabled && !assistFetching && assistData\?\.status === "unavailable";/,
  );
  // Gated on the dedicated "unavailable" status, not the pre-existing
  // "no_confident_answer" status (an ordinary empty result).
  assert.doesNotMatch(source, /assistData\?\.status === "no_confident_answer"/);
});

runTest("page and signal search are untouched by the 503 path — same queries, same results list", () => {
  // The assist fetch failing never short-circuits the deterministic
  // signals/pages/watchlist/alert-rules search above it.
  assert.match(source, /queryKey: \["command-palette-signals", debouncedQuery\]/);
  assert.match(source, /const results = useMemo<ResultItem\[\]>/);
});

// --- Rendered tests for the 503 ("AI answers are unavailable") case ---
//
// CommandPalette renders inside next/navigation's useRouter and a Base UI
// Dialog portal. useRouter() is satisfied with a stub AppRouterContext
// (only router.push is called, by the Signals-group path, not exercised
// here). Typing is driven by calling the input's own onChange prop directly
// (read off the fiber's `__reactProps$*` key) rather than dispatching a
// native "input" DOM event: in this linkedom + react-dom/client combination
// React never attaches `__reactFiber$*` to host nodes, so its native
// ChangeEventPlugin event-to-fiber lookup silently no-ops on a dispatched
// event — calling the real onChange handler still exercises the component's
// actual state/effect/debounce logic, just without relying on that broken
// native-event path. The 250ms debounce (lib: query -> debouncedQuery) is
// waited out with real timers inside `act`, matching this file's existing
// async-wait convention (no fake-timer helper is set up in this repo's test
// harness).

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

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}
(window as any).localStorage = new MemoryStorage();

const FORBIDDEN_WORDS_RE = /503|budget|ai_temporarily_unavailable|Anthropic|HTTP/;
// A query that matches nothing in STATIC_PAGES/COMMODITIES/alert rules, so
// the deterministic result count stays under the assist feature's cap.
const QUERY = "zzzqqq";

async function runAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function renderPalette(assistResponse: { status: number; body: unknown }): Promise<Root> {
  g.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/search/assist")) {
      return new Response(JSON.stringify(assistResponse.body), { status: assistResponse.status });
    }
    if (url.includes("/api/signals")) {
      return new Response(JSON.stringify({ signals: [] }), { status: 200 });
    }
    if (url.includes("/api/alert-rules")) {
      return new Response(JSON.stringify({ rules: [] }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  };

  const { AppRouterContext } = await import(
    "next/dist/shared/lib/app-router-context.shared-runtime.js"
  );
  const { useUIStore } = await import("../store/useUIStore");
  const { CommandPalette } = await import("./CommandPalette");

  useUIStore.setState({ commandPaletteOpen: true });

  document.body.replaceChildren();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const fakeRouter = {
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: async () => {},
  };

  await act(async () => {
    root.render(
      createElement(
        AppRouterContext.Provider,
        { value: fakeRouter },
        createElement(QueryClientProvider, { client }, createElement(CommandPalette)),
      ),
    );
  });

  const input = document.querySelector("input")!;
  const propsKey = Object.getOwnPropertyNames(input).find((k) => k.startsWith("__reactProps$"))!;
  const onChange = (input as any)[propsKey].onChange;
  await act(async () => {
    onChange({ target: { value: QUERY } });
  });
  // 250ms debounce (query -> debouncedQuery) plus the stubbed fetches settling.
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
  }

  return root;
}

async function main() {
  await runAsync(
    'a 503 from /api/search/assist shows the exact plain-language line and its data-testid',
    async () => {
      const root = await renderPalette({ status: 503, body: {} });
      try {
        const html = document.body.innerHTML;
        assert.equal(
          html.includes("AI answers are unavailable right now. Page and signal search still work."),
          true,
        );
        assert.equal(html.includes('data-testid="command-palette-assist-unavailable"'), true);
      } finally {
        await act(async () => {
          root.unmount();
        });
      }
    },
  );

  await runAsync(
    'a normal 200 "no_confident_answer" result does not show the unavailable line',
    async () => {
      const root = await renderPalette({ status: 200, body: { status: "no_confident_answer" } });
      try {
        const html = document.body.innerHTML;
        assert.equal(
          html.includes("AI answers are unavailable right now. Page and signal search still work."),
          false,
        );
        assert.equal(html.includes('data-testid="command-palette-assist-unavailable"'), false);
      } finally {
        await act(async () => {
          root.unmount();
        });
      }
    },
  );

  await runAsync("the 503 case never leaks a status code, budget, or vendor name into the document", async () => {
    const root = await renderPalette({ status: 503, body: {} });
    try {
      const text = (document.body.textContent ?? "").replace(/\s+/g, " ");
      assert.doesNotMatch(text, FORBIDDEN_WORDS_RE);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });
}

void main();
