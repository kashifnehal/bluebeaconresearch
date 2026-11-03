// Rendered coverage for the assessment detail page (rule 13): every block is
// present, the footer line is exact, the three CTA links carry utm_* values,
// and a draft/unknown slug triggers notFound(). Same linkedom + react-dom/client
// harness as components/signals/SignalQuickView.test.tsx, via lib/test-render.ts.
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

function fixture(overrides: Partial<PublicAssessment> = {}): PublicAssessment {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    slug: "houthi-strait-traffic",
    headline: "Houthi activity slows strait traffic",
    summary: "Tankers are waiting longer to transit; insurers have raised war-risk premiums for the route.",
    eventTime: "2026-11-01T08:00:00.000Z",
    assessedAt: "2026-11-01T12:00:00.000Z",
    markets: ["USOIL", "UKOIL"],
    body: {
      what_happened: "Reported strikes near the strait slowed commercial transit for several vessels.",
      exposure: [{ market: "USOIL", mechanism: "route", note: "Longer transit times raise shipping cost per barrel." }],
      evidence: ["Three independent shipping trackers reported the same vessel delays."],
      uncertainty: ["The duration of the slowdown is not yet known."],
      what_to_watch: [{ date: "2026-11-05", item: "Next scheduled convoy transit", source: "Shipping authority bulletin" }],
    },
    sources: [
      { publisher: "Example Wire", title: "Tankers delayed near strait", url: "https://example.com/a", published_at: "2026-11-01T09:00:00.000Z" },
    ],
    publishedAt: "2026-11-01T12:30:00.000Z",
    updatedAt: "2026-11-01T12:30:00.000Z",
    ...overrides,
  };
}

async function main() {
  const { renderAssessmentDetail, buildAssessmentMetadata } = await import("./page");

  await runTest("every block, the exact footer line, and three CTA links carrying utm values", async () => {
    const element = await renderAssessmentDetail(
      "houthi-strait-traffic",
      { utm_source: "newsletter", utm_campaign: "weekly", other: "dropped" },
      { getAssessment: async () => fixture() },
    );
    const { html, root } = await renderElement(document, element as any);
    try {
      for (const id of [
        "section-event",
        "section-exposure",
        "section-evidence",
        "section-what-is-uncertain",
        "section-what-to-watch",
        "section-sources",
      ]) {
        assert.match(html, new RegExp(`data-testid="${id}"`), `expected ${id} to render`);
      }
      assert.match(
        html,
        /Informational research, not investment advice\. Sources and dates are shown on each item\./,
      );

      const walkthrough = document.querySelector('[data-testid="cta-walkthrough"]') as HTMLAnchorElement;
      const signup = document.querySelector('[data-testid="cta-signup"]') as HTMLAnchorElement;
      const subscribe = document.querySelector('[data-testid="cta-subscribe"]') as HTMLAnchorElement;
      for (const a of [walkthrough, signup, subscribe]) {
        const href = a.getAttribute("href") ?? "";
        assert.match(href, /utm_source=newsletter/);
        assert.match(href, /utm_campaign=weekly/);
        assert.doesNotMatch(href, /other=dropped/);
      }
      assert.match(walkthrough.getAttribute("href") ?? "", /^\/walkthrough\?/);
      assert.match(signup.getAttribute("href") ?? "", /^\/signup\?/);
      assert.match(subscribe.getAttribute("href") ?? "", /^\/subscribe\?/);

      assert.match(html, /Houthi activity slows strait traffic/);
      assert.match(html, /Event: 2026-11-01 08:00 UTC/);
      assert.match(html, /Assessed: 2026-11-01 12:00 UTC/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("a source link has rel=noopener noreferrer and opens in a new tab", async () => {
    const element = await renderAssessmentDetail("houthi-strait-traffic", {}, { getAssessment: async () => fixture() });
    const { root } = await renderElement(document, element as any);
    try {
      const link = document.querySelector('[data-testid="sources-list"] a') as HTMLAnchorElement;
      assert.equal(link.getAttribute("rel"), "noopener noreferrer");
      assert.equal(link.getAttribute("target"), "_blank");
      assert.equal(link.getAttribute("href"), "https://example.com/a");
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("a null eventTime omits the Event prefix in the meta line", async () => {
    const element = await renderAssessmentDetail(
      "houthi-strait-traffic",
      {},
      { getAssessment: async () => fixture({ eventTime: null }) },
    );
    const { html, root } = await renderElement(document, element as any);
    try {
      const meta = document.querySelector('[data-testid="assessment-meta"]');
      assert.doesNotMatch(meta?.textContent ?? "", /Event:/);
      assert.match(meta?.textContent ?? "", /Assessed: 2026-11-01 12:00 UTC/);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("an unknown slug calls notFound()", async () => {
    let threw: unknown = null;
    try {
      await renderAssessmentDetail("does-not-exist", {}, { getAssessment: async () => null });
    } catch (err) {
      threw = err;
    }
    assert.ok(threw, "expected notFound() to throw");
    assert.equal((threw as { digest?: string }).digest, "NEXT_HTTP_ERROR_FALLBACK;404");
  });

  await runTest("a draft slug (getAssessment returns null for non-published) calls notFound()", async () => {
    let threw: unknown = null;
    try {
      await renderAssessmentDetail("draft-item", {}, { getAssessment: async () => null });
    } catch (err) {
      threw = err;
    }
    assert.equal((threw as { digest?: string }).digest, "NEXT_HTTP_ERROR_FALLBACK;404");
  });

  await runTest("buildAssessmentMetadata returns {} for a missing/draft slug (no crash)", async () => {
    const metadata = await buildAssessmentMetadata("does-not-exist", { getAssessment: async () => null });
    assert.deepEqual(metadata, {});
  });

  await runTest("buildAssessmentMetadata sets title/description/canonical/openGraph/twitter for a real slug", async () => {
    const metadata = await buildAssessmentMetadata("houthi-strait-traffic", { getAssessment: async () => fixture() });
    assert.equal(metadata.title, "Houthi activity slows strait traffic | Blue Beacon Research");
    assert.equal(metadata.description, fixture().summary);
    assert.equal(metadata.alternates?.canonical, "https://www.bluebeaconresearch.com/assessments/houthi-strait-traffic");
    assert.equal((metadata.openGraph as any)?.type, "article");
    assert.equal((metadata.twitter as any)?.card, "summary_large_image");
  });
}

void main();
