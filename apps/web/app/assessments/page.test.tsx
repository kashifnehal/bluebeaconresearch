// Rendered coverage for the assessments index page (rule 13): the empty
// state and its noindex metadata when there are no rows, and the list +
// index-allowed metadata when there is at least one.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement } from "@/lib/test-render";
import type { PublicAssessment } from "@/lib/public-assessments";

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

function fixture(): PublicAssessment {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    slug: "houthi-strait-traffic",
    headline: "Houthi activity slows strait traffic",
    summary: "Tankers are waiting longer to transit.",
    eventTime: null,
    assessedAt: "2026-11-01T12:00:00.000Z",
    markets: ["USOIL"],
    body: { what_happened: "x", exposure: [], evidence: [], uncertainty: [], what_to_watch: [] },
    sources: [],
    publishedAt: "2026-11-01T12:30:00.000Z",
    updatedAt: "2026-11-01T12:30:00.000Z",
  };
}

async function main() {
  const { renderAssessmentsList, buildAssessmentsListMetadata } = await import("./page");

  await runTest("no rows: shows the empty state and sets robots noindex", async () => {
    const element = await renderAssessmentsList({ getAssessments: async () => [] });
    const { html, root } = await renderElement(document, element as any);
    try {
      assert.match(html, /No public assessments are published yet\./);
      assert.doesNotMatch(html, /data-testid="assessments-list"/);
    } finally {
      await act(async () => root.unmount());
    }

    const metadata = await buildAssessmentsListMetadata({ getAssessments: async () => [] });
    assert.deepEqual(metadata.robots, { index: false, follow: false });
  });

  await runTest("at least one row: shows the list and sets robots index", async () => {
    const element = await renderAssessmentsList({ getAssessments: async () => [fixture()] });
    const { html, root } = await renderElement(document, element as any);
    try {
      assert.match(html, /data-testid="assessments-list"/);
      assert.match(html, /Houthi activity slows strait traffic/);
      assert.doesNotMatch(html, /No public assessments are published yet\./);
    } finally {
      await act(async () => root.unmount());
    }

    const metadata = await buildAssessmentsListMetadata({ getAssessments: async () => [fixture()] });
    assert.deepEqual(metadata.robots, { index: true, follow: true });
  });
}

void main();
