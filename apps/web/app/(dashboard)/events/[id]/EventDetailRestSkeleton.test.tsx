// Rendered test (rule 13) for the Suspense fallback shown while the heavy
// sections (market impact, related, chat, outcomes) are still streaming in.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement } from "@/lib/test-render";

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
  const { EventDetailRestSkeleton } = await import("./EventDetailRestSkeleton");

  await runTest("renders the heavy-block skeleton placeholders", async () => {
    const { root } = await renderElement(document, createElement(EventDetailRestSkeleton));
    try {
      const container = document.querySelector('[data-testid="event-detail-rest-skeleton"]');
      assert.ok(container, "expected the skeleton container to render");
      const pulses = document.querySelectorAll('[data-testid="event-detail-rest-skeleton"] [data-slot="skeleton"]');
      assert.ok(pulses.length >= 3, `expected several skeleton blocks, got ${pulses.length}`);
    } finally {
      await act(async () => root.unmount());
    }
  });
}

void main();
