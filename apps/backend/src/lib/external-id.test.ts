import assert from "node:assert/strict";
import { articleExternalId, canonicalUrl } from "./external-id.js";

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

runTest("two different BBC URLs give different ids", () => {
  const a = articleExternalId("rss", "https://www.bbc.co.uk/news/world-asia-11111111");
  const b = articleExternalId("rss", "https://www.bbc.co.uk/news/world-asia-22222222");
  assert.notEqual(a, b);
});

runTest("the same URL with and without a utm_source param gives the same id", () => {
  const a = articleExternalId("gdelt", "https://example.com/story?utm_source=x&id=1");
  const b = articleExternalId("gdelt", "https://example.com/story?id=1");
  assert.equal(a, b);
});

runTest("trailing slash and #fragment do not change the id", () => {
  const base = articleExternalId("gnews", "https://example.com/story");
  const withSlash = articleExternalId("gnews", "https://example.com/story/");
  const withFragment = articleExternalId("gnews", "https://example.com/story#section");
  assert.equal(base, withSlash);
  assert.equal(base, withFragment);
});

runTest("ids are stable across runs (same input, same output)", () => {
  const url = "https://example.com/news/some-article?gclid=abc";
  const first = articleExternalId("rss", url);
  const second = articleExternalId("rss", url);
  assert.equal(first, second);
});

runTest("collector-style prefetch skip: canonical URL of an already-seen article matches a differently-decorated re-fetch", () => {
  const seenCanonicalUrls = new Set<string>([canonicalUrl("https://example.com/story?id=1")]);
  const refetchedUrl = "https://example.com/story?id=1&utm_source=newsletter#top";
  assert.ok(seenCanonicalUrls.has(canonicalUrl(refetchedUrl)));
});

runTest("different prefixes on the same URL give different ids (readable source tagging preserved)", () => {
  const url = "https://example.com/story";
  assert.notEqual(articleExternalId("gdelt", url), articleExternalId("rss", url));
});

runTest("hash portion is 43 base64url characters (full SHA-256, no truncation)", () => {
  const id = articleExternalId("gdelt", "https://example.com/a");
  const hashPart = id.slice("gdelt-".length);
  assert.equal(hashPart.length, 43);
});

runTest("an invalid URL never throws", () => {
  assert.doesNotThrow(() => articleExternalId("rss", "not-a-valid-url"));
});
