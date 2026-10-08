import assert from "node:assert/strict";

import sitemap from "./sitemap";

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

runTest("sitemap includes /how-it-works", () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);
  assert.ok(
    urls.some((u) => u.endsWith("/how-it-works")),
    `expected a /how-it-works entry, got: ${urls.join(", ")}`,
  );
});

runTest("sitemap includes /about", () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);
  assert.ok(
    urls.some((u) => u.endsWith("/about")),
    `expected a /about entry, got: ${urls.join(", ")}`,
  );
});
