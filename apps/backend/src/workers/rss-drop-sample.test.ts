import assert from "node:assert/strict";
import { buildDropSample, type Drop } from "./rss-drop-sample.js";

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

runTest("returns nothing for empty input", () => {
  assert.deepEqual(buildDropSample([]), []);
});

runTest("caps sample at maxPerFeed but keeps n as the true total", () => {
  const drops: Drop[] = Array.from({ length: 9 }, (_, i) => ({
    feed: "BBC World",
    tier: "world",
    title: `Headline ${i}`,
    reason: "nokeyword",
  }));

  const result = buildDropSample(drops, 6, 110);
  assert.equal(result.length, 1);
  assert.equal(result[0].feed, "BBC World");
  assert.equal(result[0].tier, "world");
  assert.equal(result[0].n, 9);
  assert.equal(result[0].sample.length, 6);
  assert.deepEqual(result[0].sample[0], { t: "Headline 0", r: "nokeyword" });
  assert.deepEqual(result[0].sample[5], { t: "Headline 5", r: "nokeyword" });
});

runTest("cuts titles to maxTitleChars", () => {
  const longTitle = "A".repeat(200);
  const drops: Drop[] = [{ feed: "Al Jazeera", tier: "world", title: longTitle, reason: "exclude-phrase" }];

  const result = buildDropSample(drops, 6, 110);
  assert.equal(result[0].sample[0].t.length, 110);
  assert.equal(result[0].sample[0].t, longTitle.slice(0, 110));
});

runTest("groups drops per feed and preserves reason", () => {
  const drops: Drop[] = [
    { feed: "BBC World", tier: "world", title: "a", reason: "exclude-phrase" },
    { feed: "BBC World", tier: "world", title: "b", reason: "noise" },
    { feed: "OilPrice", tier: "finance", title: "c", reason: "nokeyword" },
  ];

  const result = buildDropSample(drops);
  assert.equal(result.length, 2);
  const bbc = result.find((r) => r.feed === "BBC World")!;
  assert.equal(bbc.n, 2);
  assert.deepEqual(bbc.sample, [
    { t: "a", r: "exclude-phrase" },
    { t: "b", r: "noise" },
  ]);
  const oilprice = result.find((r) => r.feed === "OilPrice")!;
  assert.equal(oilprice.n, 1);
  assert.equal(oilprice.tier, "finance");
});

runTest('an exclude-phrase drop with a detail prints "exclude:<phrase>@<location>" as r', () => {
  const drops: Drop[] = [
    {
      feed: "Guardian Business",
      tier: "finance",
      title: "Retailer announces new store opening",
      reason: "exclude-phrase",
      detail: "fashion@summary",
    },
  ];

  const result = buildDropSample(drops);
  assert.deepEqual(result[0].sample[0], {
    t: "Retailer announces new store opening",
    r: "exclude:fashion@summary",
  });
});

if (failed) {
  console.error("\nSome rss-drop-sample tests failed.");
  process.exit(1);
} else {
  console.log("\nAll rss-drop-sample tests passed.");
}
