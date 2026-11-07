import assert from "node:assert/strict";

import { buildSitemap as sitemap } from "./sitemap";
import { SITE_ORIGIN } from "@/lib/site-metadata";

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

const NO_ASSESSMENTS = { getAssessments: async () => [] };

async function main() {
  await runTest("sitemap includes /how-it-works", async () => {
    const entries = await sitemap(NO_ASSESSMENTS);
    const urls = entries.map((e) => e.url);
    assert.ok(
      urls.some((u) => u.endsWith("/how-it-works")),
      `expected a /how-it-works entry, got: ${urls.join(", ")}`,
    );
  });

  await runTest("sitemap includes /about", async () => {
    const entries = await sitemap(NO_ASSESSMENTS);
    const urls = entries.map((e) => e.url);
    assert.ok(
      urls.some((u) => u.endsWith("/about")),
      `expected a /about entry, got: ${urls.join(", ")}`,
    );
  });

  await runTest("sitemap includes /accuracy and /status monthly at priority 0.5", async () => {
    const entries = await sitemap(NO_ASSESSMENTS);
    for (const path of ["/accuracy", "/status"]) {
      const entry = entries.find((e) => e.url.endsWith(path));
      assert.ok(entry, `expected a ${path} entry, got: ${entries.map((e) => e.url).join(", ")}`);
      assert.equal(entry.changeFrequency, "monthly");
      assert.equal(entry.priority, 0.5);
    }
  });

  await runTest("sitemap entries use SITE_ORIGIN, not a localhost fallback", async () => {
    const entries = await sitemap(NO_ASSESSMENTS);
    assert.ok(entries.every((e) => e.url.startsWith(SITE_ORIGIN)));
    assert.ok(entries.every((e) => !e.url.includes("localhost")));
  });

  await runTest("sitemap includes a static /assessments entry even with no published rows", async () => {
    const entries = await sitemap(NO_ASSESSMENTS);
    assert.ok(entries.some((e) => e.url === `${SITE_ORIGIN}/assessments`));
  });

  await runTest("sitemap includes /research-standard and /corrections monthly at priority 0.3", async () => {
    const entries = await sitemap(NO_ASSESSMENTS);
    for (const path of ["/research-standard", "/corrections"]) {
      const entry = entries.find((e) => e.url === `${SITE_ORIGIN}${path}`);
      assert.ok(entry, `expected a ${path} entry, got: ${entries.map((e) => e.url).join(", ")}`);
      assert.equal(entry.changeFrequency, "monthly");
      assert.equal(entry.priority, 0.3);
    }
  });

  await runTest("sitemap adds one entry per published assessment, using its updated_at", async () => {
    const updatedAt = "2026-11-02T00:00:00.000Z";
    const entries = await sitemap({
      getAssessments: async () =>
        [
          {
            id: "1",
            slug: "my-assessment",
            headline: "h",
            summary: "s",
            eventTime: null,
            assessedAt: "2026-11-01T00:00:00.000Z",
            markets: [],
            body: { what_happened: "x", exposure: [], evidence: [], uncertainty: [], what_to_watch: [] },
            sources: [],
            publishedAt: "2026-11-01T00:00:00.000Z",
            updatedAt,
          },
        ] as any,
    });
    const entry = entries.find((e) => e.url === `${SITE_ORIGIN}/assessments/my-assessment`);
    assert.ok(entry, `expected an entry for my-assessment, got: ${entries.map((e) => e.url).join(", ")}`);
    assert.equal((entry!.lastModified as Date).toISOString(), updatedAt);
  });

  await runTest("a database read failure returns the static entries only, never throws", async () => {
    const entries = await sitemap({
      getAssessments: async () => {
        throw new Error("boom");
      },
    });
    assert.ok(entries.some((e) => e.url === `${SITE_ORIGIN}/`));
    assert.ok(entries.every((e) => !e.url.includes("/assessments/")));
  });
}

void main();
