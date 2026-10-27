import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Root } from "react-dom/client";

import { setupDom, renderElement } from "@/lib/test-render";
import { ArchiveClient } from "./ArchiveClient";

const document = setupDom();

// useArchiveFeed's sentinelRef wires an IntersectionObserver; linkedom doesn't
// implement one, so a minimal no-op stub is enough to let the hook mount.
class FakeIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).IntersectionObserver = FakeIntersectionObserver;
(globalThis as any).window.IntersectionObserver = FakeIntersectionObserver;

function runTest(name: string, fn: () => Promise<void>) {
  return fn()
    .then(() => console.log(`✔ ${name}`))
    .catch((err) => {
      console.error(`✖ ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

async function main() {
  await runTest("renders one h1 Archive inside page-shell at medium width", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ signals: [], total: 0 }), { status: 200 })) as typeof fetch;
    const client = new QueryClient();
    let root: Root | undefined;
    try {
      const rendered = await renderElement(
        document,
        createElement(QueryClientProvider, { client }, createElement(ArchiveClient)),
      );
      root = rendered.root;
      const h1s = rendered.html.match(/<h1[^>]*>/g) ?? [];
      assert.equal(h1s.length, 1);
      assert.match(rendered.html, />Archive<\/h1>/);
      assert.match(rendered.html, /data-testid="page-shell"/);
      assert.match(rendered.html, /max-w-4xl/);
      for (const id of [
        "archive-filters",
        "archive-from",
        "archive-to",
        "archive-commodity",
        "archive-region",
        "archive-keyword",
      ]) {
        assert.match(rendered.html, new RegExp(`data-testid="${id}"`), id);
      }
    } finally {
      globalThis.fetch = original;
      await act(async () => root?.unmount());
      client.clear();
    }
  });
}

main();
