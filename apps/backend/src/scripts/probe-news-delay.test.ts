import assert from "node:assert/strict";
import {
  DAILY_REQUEST_CAP,
  PROBE_QUERIES,
  articleRecord,
  articlesFromVendorBody,
  decideRequest,
  formatCountShare,
  formatOverlap,
  formatVendorSummary,
  gnewsSearchUrl,
  lagMinutes,
  marketauxLimit,
  marketauxPublishedAfter,
  marketauxSearchUrl,
  overlapCounts,
  percentile,
  publishedDateWindow,
  redactSecrets,
  selectNewArticles,
  summarizeVendor,
  usedRequests,
  vendorsFromEnv,
  type ProbeLine,
  type VendorCounts,
} from "./probe-news-delay.js";

let failed = false;
function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    failed = true;
    console.error(`✖ ${name}`);
    console.error(err);
  }
}

function line(overrides: Partial<ProbeLine> = {}): ProbeLine {
  return {
    vendor: "gnews",
    query: PROBE_QUERIES[0],
    key: "https://example.com/story",
    domain: "example.com",
    title: "Story",
    published_at: "2026-10-15T12:00:00.000Z",
    first_seen_at: "2026-10-15T13:30:00.000Z",
    poll_started_at: "2026-10-15T13:30:00.000Z",
    ...overrides,
  };
}

runTest("percentile interpolates the median and the 90th percentile", () => {
  const values = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
  assert.equal(percentile(values, 50), 45);
  assert.equal(percentile(values, 90), 81);
  assert.equal(percentile([7], 90), 7);
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([10, 30, 50], 50), 30);
});

runTest("lag is first seen minus published, in minutes", () => {
  assert.equal(lagMinutes("2026-10-15T12:00:00.000Z", "2026-10-15T13:30:00.000Z"), 90);
  assert.equal(lagMinutes("2026-10-15T12:00:00.000Z", "2026-10-15T13:00:00.000Z"), 60);
  assert.equal(lagMinutes("not-a-date", "2026-10-15T13:00:00.000Z"), null);
});

runTest("de-duplication keeps the first unseen key and drops repeats", () => {
  const existing = new Set(["https://example.com/a"]);
  const fresh = selectNewArticles(existing, [
    { key: "https://example.com/a" },
    { key: "https://example.com/b" },
    { key: "https://example.com/b" },
    { key: "" },
  ]);
  assert.deepEqual(fresh, [{ key: "https://example.com/b" }]);
  assert.equal(existing.has("https://example.com/b"), false);
});

runTest("request counter allows 89, refuses 90, and leaves other days alone", () => {
  const start: VendorCounts = { gnews: { "2026-10-15": 89 }, marketaux: { "2026-10-15": 90 } };
  const allowed = decideRequest(start, "gnews", "2026-10-15");
  assert.equal(allowed.ok, true);
  if (allowed.ok) {
    assert.equal(allowed.used, 90);
    assert.equal(usedRequests(allowed.counts, "gnews", "2026-10-15"), 90);
  }
  assert.equal(usedRequests(start, "gnews", "2026-10-15"), 89);
  const atCap = decideRequest({ gnews: { "2026-10-15": DAILY_REQUEST_CAP } }, "gnews", "2026-10-15");
  assert.equal(atCap.ok, false);
  if (!atCap.ok) assert.equal(atCap.used, DAILY_REQUEST_CAP);
  const nextDay = decideRequest({ gnews: { "2026-10-15": 90 } }, "gnews", "2026-10-16");
  assert.equal(nextDay.ok, true);
  const otherVendor = decideRequest(start, "marketaux", "2026-10-15");
  assert.equal(otherVendor.ok, false);
});

runTest("vendor summary reports lag, domains, and distinct polls", () => {
  const summary = summarizeVendor("gnews", [
    line({ key: "https://a.example/1", domain: "a.example", poll_started_at: "2026-10-15T13:00:00.000Z", first_seen_at: "2026-10-15T12:30:00.000Z" }),
    line({
      key: "https://b.example/2",
      domain: "b.example",
      published_at: "2026-10-15T10:00:00.000Z",
      first_seen_at: "2026-10-15T12:00:00.000Z",
      poll_started_at: "2026-10-15T12:00:00.000Z",
    }),
    line({
      key: "https://a.example/3",
      domain: "a.example",
      published_at: "2026-10-15T11:00:00.000Z",
      first_seen_at: "2026-10-15T12:00:00.000Z",
      poll_started_at: "2026-10-15T12:00:00.000Z",
    }),
    line({
      key: "https://c.example/4",
      domain: "",
      published_at: "nope",
      first_seen_at: "nope",
      poll_started_at: "2026-10-15T13:00:00.000Z",
    }),
  ]);
  assert.equal(summary.articlesFirstSeen, 4);
  assert.equal(summary.distinctDomains, 2);
  assert.equal(summary.olderThan60Minutes, 1);
  assert.equal(summary.oldestPublishedUtc, "2026-10-15T10:00:00.000Z");
  assert.equal(summary.newestPublishedUtc, "2026-10-15T12:00:00.000Z");
  assert.equal(summary.polls, 2);
  assert.equal(summary.medianLagMinutes, 60);
  assert.equal(summary.p90LagMinutes, 108);
  const printed = formatVendorSummary(summary);
  assert.equal(printed.includes("https://"), false);
  assert.equal(printed.includes("older than 60 minutes at first sight: 1"), true);
  assert.equal(printed.includes("polls: 2"), true);
});

runTest("overlap counts both directions with canonical urls", () => {
  const counts = overlapCounts(
    ["https://www.example.com/story?utm_source=x", "https://other.test/only-vendor"],
    ["https://www.example.com/story/", "https://rss.test/only-rss", "https://www.example.com/story"],
  );
  assert.deepEqual(counts, { vendorArticles: 2, vendorInRss: 1, rssArticles: 2, rssInVendor: 1 });
  assert.equal(formatCountShare(1, 2), "1/2 (50.0%)");
  assert.equal(formatCountShare(0, 0), "0/0");
  assert.equal(formatOverlap(counts).includes("1/2"), true);
});

runTest("published window covers the UTC days of the file", () => {
  const window = publishedDateWindow([
    line({ published_at: "2026-10-14T23:00:00.000Z" }),
    line({ published_at: "2026-10-15T01:00:00.000Z" }),
  ]);
  assert.deepEqual(window, { start: "2026-10-14T00:00:00.000Z", endExclusive: "2026-10-16T00:00:00.000Z" });
});

runTest("search requests use the collector parameters and the marketaux window", () => {
  const gnews = new URL(gnewsSearchUrl("oil OR crude", "test-token"));
  assert.equal(gnews.origin + gnews.pathname, "https://gnews.io/api/v4/search");
  assert.equal(gnews.searchParams.get("lang"), "en");
  assert.equal(gnews.searchParams.get("max"), "10");
  assert.equal(gnews.searchParams.get("sortby"), "publishedAt");
  assert.equal(gnews.searchParams.get("q"), "oil OR crude");
  assert.equal(gnews.searchParams.get("token"), "test-token");

  assert.equal(marketauxPublishedAfter(new Date("2026-10-15T18:44:59.000Z")), "2026-10-15T15:44");
  assert.equal(marketauxPublishedAfter(new Date("2026-10-15T02:10:00.000Z")), "2026-10-14T23:10");
  assert.equal(marketauxLimit(undefined), 3);
  assert.equal(marketauxLimit("4"), 4);
  assert.equal(marketauxLimit("0"), 3);
  const marketaux = new URL(marketauxSearchUrl("Hormuz OR tanker", "test-token", 3, "2026-10-15T15:44"));
  assert.equal(marketaux.origin + marketaux.pathname, "https://api.marketaux.com/v1/news/all");
  assert.equal(marketaux.searchParams.get("language"), "en");
  assert.equal(marketaux.searchParams.get("limit"), "3");
  assert.equal(marketaux.searchParams.get("search"), "Hormuz OR tanker");
  assert.equal(marketaux.searchParams.get("published_after"), "2026-10-15T15:44");
});

runTest("article keys ignore tracking params and a secret is stripped from text", () => {
  const record = articleRecord({
    vendor: "gnews",
    query: PROBE_QUERIES[1],
    url: "https://www.Reuters.com/story/?utm_source=gnews",
    title: "Hormuz",
    publishedAt: "2026-10-15T12:00:00.000Z",
    firstSeenAt: "2026-10-15T12:20:00.000Z",
    pollStartedAt: "2026-10-15T12:19:00.000Z",
  });
  assert.equal(record?.key, "https://www.reuters.com/story");
  assert.equal(record?.domain, "reuters.com");
  assert.equal(articleRecord({
    vendor: "gnews",
    query: PROBE_QUERIES[0],
    url: "",
    title: "",
    publishedAt: "2026-10-15T12:00:00.000Z",
    firstSeenAt: "2026-10-15T12:00:00.000Z",
    pollStartedAt: "2026-10-15T12:00:00.000Z",
  }), null);
  const leaked = "failed https://gnews.io/api/v4/search?token=super-secret&q=oil";
  assert.equal(redactSecrets(leaked, ["super-secret"]).includes("super-secret"), false);
  assert.deepEqual(vendorsFromEnv({}), []);
  assert.deepEqual(vendorsFromEnv({ GNEWS_API_KEY: "a", MARKETAUX_API_KEY: "b" }), ["gnews", "marketaux"]);
  assert.equal(articlesFromVendorBody("gnews", { articles: [{ url: "https://a.test/x", title: "T", publishedAt: "2026-10-15T00:00:00.000Z" }] }).length, 1);
  assert.equal(articlesFromVendorBody("marketaux", { data: [{ url: "https://a.test/y", title: "U", published_at: "2026-10-15T00:00:00.000Z" }] })[0]?.publishedAt, "2026-10-15T00:00:00.000Z");
});

if (failed) process.exitCode = 1;
