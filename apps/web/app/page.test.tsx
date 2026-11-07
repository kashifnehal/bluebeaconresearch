// Rendered coverage for the homepage pricing and assessment link (rule 13).
// The data layer is passed in; this file does not call Supabase.
import assert from "node:assert/strict";
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

function oneAssessment(): PublicAssessment {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    slug: "sample-assessment",
    headline: "Sample assessment",
    summary: "A published assessment.",
    eventTime: null,
    assessedAt: "2026-11-01T12:00:00.000Z",
    markets: ["USOIL"],
    body: { what_happened: "x", exposure: [], evidence: [], uncertainty: [], what_to_watch: [] },
    sources: [],
    publishedAt: "2026-11-01T12:30:00.000Z",
    updatedAt: "2026-11-01T12:30:00.000Z",
  };
}

function sampleLink() {
  return [...document.querySelectorAll("a")].find(
    (a) => a.getAttribute("href") === "/assessments" && (a.textContent ?? "").includes("Read a sample assessment"),
  );
}

async function renderHome(assessments: PublicAssessment[]) {
  const { renderHomePage } = await import("./page");
  return renderElement(
    document,
    renderHomePage({
      signedIn: false,
      latestSignal: null,
      totalSignals: null,
      assessments,
    }),
  );
}

async function main() {
  const { SHOW_PLAN_PRICES } = await import("./page");

  await runTest("no published assessment: sample link is absent", async () => {
    const { root } = await renderHome([]);
    try {
      assert.equal(sampleLink(), undefined);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("one published assessment: sample link is present", async () => {
    const { root } = await renderHome([oneAssessment()]);
    try {
      const link = sampleLink();
      assert.ok(link, "expected a Read a sample assessment link");
      assert.equal(link?.getAttribute("href"), "/assessments");
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("pricing section uses the two new buttons and drops the old plan claims", async () => {
    const { root } = await renderHome([]);
    try {
      const pricing = document.querySelector("#pricing");
      assert.ok(pricing);
      const text = pricing.textContent ?? "";
      assert.equal(text.includes("REST"), false);
      assert.equal(text.includes("WS API"), false);
      assert.equal(text.includes("5-year"), false);
      assert.equal(text.includes("Multi-user"), false);
      assert.equal(/opening soon/i.test(text), false);
      const monitor = [...pricing.querySelectorAll("a")].find((a) =>
        (a.textContent ?? "").includes("Create a free account"),
      );
      const professional = [...pricing.querySelectorAll("a")].find((a) =>
        (a.textContent ?? "").includes("Request professional access"),
      );
      assert.equal(monitor?.getAttribute("href"), "/signup");
      assert.equal(professional?.getAttribute("href"), "/walkthrough?type=professional");
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("accuracy link says View the accuracy page and keeps the hero line", async () => {
    const { root } = await renderHome([]);
    try {
      const link = [...document.querySelectorAll("a")].find((a) =>
        (a.textContent ?? "").includes("View the accuracy page"),
      );
      assert.ok(link, "expected the accuracy page link");
      assert.equal(link?.getAttribute("href"), "/accuracy");
      const text = document.body.textContent ?? "";
      assert.equal(text.includes("View the live track record"), false);
      assert.equal(text.includes("Geopolitical intelligence for markets that matter."), true);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("research footer links Research Standard and Corrections", async () => {
    const { root } = await renderHome([]);
    try {
      const researchStandard = [...document.querySelectorAll("a")].find(
        (a) => a.getAttribute("href") === "/research-standard" && (a.textContent ?? "").includes("Research Standard"),
      );
      const corrections = [...document.querySelectorAll("a")].find(
        (a) => a.getAttribute("href") === "/corrections" && (a.textContent ?? "").includes("Corrections"),
      );
      assert.ok(researchStandard, "expected a Research Standard footer link");
      assert.ok(corrections, "expected a Corrections footer link");
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("SHOW_PLAN_PRICES false: pricing section has no dollar sign", async () => {
    assert.equal(SHOW_PLAN_PRICES, false);
    const { root } = await renderHome([]);
    try {
      const pricing = document.querySelector("#pricing");
      assert.ok(pricing);
      assert.equal((pricing.textContent ?? "").includes("$"), false);
      assert.match(pricing.textContent ?? "", /Free/);
    } finally {
      await act(async () => root.unmount());
    }
  });
}

void main();
