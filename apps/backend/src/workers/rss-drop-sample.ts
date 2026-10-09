import type { FeedTier } from "../lib/relevance-filter.js";

// "exclude-year" is log-only (relevance-filter.ts's shouldExclude() never returns
// true for the year rule now, see [RELEVANCE] exclude-year logs instead) — kept
// here as a reason value so the type documents all 4 relevance-filter drop paths,
// even though only exclude-phrase/noise/nokeyword can appear in a real Drop today.
export type DropReason = "exclude-phrase" | "exclude-year" | "noise" | "nokeyword";

// detail, when set, is "<phrase>@title" or "<phrase>@summary" for an exclude-phrase
// drop — which exclude keyword matched and whether it was in the title or only
// showed up once the (usually hidden) summary was included.
export type Drop = { feed: string; tier: FeedTier; title: string; reason: DropReason; detail?: string };

export type DropSample = {
  feed: string;
  tier: FeedTier;
  n: number;
  sample: { t: string; r: string }[];
};

export function buildDropSample(drops: Drop[], maxPerFeed = 6, maxTitleChars = 110): DropSample[] {
  const byFeed = new Map<string, { tier: FeedTier; n: number; sample: { t: string; r: string }[] }>();

  for (const drop of drops) {
    let entry = byFeed.get(drop.feed);
    if (!entry) {
      entry = { tier: drop.tier, n: 0, sample: [] };
      byFeed.set(drop.feed, entry);
    }
    entry.n++;
    if (entry.sample.length < maxPerFeed) {
      const r = drop.detail ? `exclude:${drop.detail}` : drop.reason;
      entry.sample.push({ t: drop.title.slice(0, maxTitleChars), r });
    }
  }

  return Array.from(byFeed.entries()).map(([feed, entry]) => ({
    feed,
    tier: entry.tier,
    n: entry.n,
    sample: entry.sample,
  }));
}
