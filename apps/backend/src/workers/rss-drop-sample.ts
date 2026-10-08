import type { FeedTier } from "../lib/relevance-filter.js";

export type DropReason = "exclude" | "noise" | "nokeyword";

export type Drop = { feed: string; tier: FeedTier; title: string; reason: DropReason };

export type DropSample = {
  feed: string;
  tier: FeedTier;
  n: number;
  sample: { t: string; r: DropReason }[];
};

export function buildDropSample(drops: Drop[], maxPerFeed = 6, maxTitleChars = 110): DropSample[] {
  const byFeed = new Map<string, { tier: FeedTier; n: number; sample: { t: string; r: DropReason }[] }>();

  for (const drop of drops) {
    let entry = byFeed.get(drop.feed);
    if (!entry) {
      entry = { tier: drop.tier, n: 0, sample: [] };
      byFeed.set(drop.feed, entry);
    }
    entry.n++;
    if (entry.sample.length < maxPerFeed) {
      entry.sample.push({ t: drop.title.slice(0, maxTitleChars), r: drop.reason });
    }
  }

  return Array.from(byFeed.entries()).map(([feed, entry]) => ({
    feed,
    tier: entry.tier,
    n: entry.n,
    sample: entry.sample,
  }));
}
