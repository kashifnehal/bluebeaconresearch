import { GEOPOLITICAL_KEYWORDS, MARKET_FINANCE_KEYWORDS } from "./relevance-filter.js";

/**
 * Placement-proxy adjustment (claude/277 A6). RavenPack's own webinar claims that
 * events placed high in an article (i.e. in the headline) tend to carry more price
 * impact than the same event reported only deep in the body. That is RavenPack's
 * unverified claim about their own data, not a finding verified on BBR's data — see
 * the HEADLINE_PLACEMENT_SEVERITY_BONUS comment in claude.service.ts for how (and how
 * cautiously) this gets used.
 *
 * "Triggering keyword/event content" is defined here as the same geopolitical/market
 * keyword lists relevance-filter.ts already uses to decide whether a raw article is
 * relevant enough to ingest at all (GEOPOLITICAL_KEYWORDS, MARKET_FINANCE_KEYWORDS) —
 * reused rather than inventing a second, parallel keyword taxonomy for this feature.
 */
const TRIGGER_KEYWORDS = [...GEOPOLITICAL_KEYWORDS, ...MARKET_FINANCE_KEYWORDS];

export type HeadlinePlacement = "headline" | "body" | "none";

/**
 * "none" covers both "no trigger keyword anywhere" and "no body text was available to
 * check" (GDELT's articles carry no body/summary at all — see gdelt-collector.ts) —
 * in both cases there's nothing for the body-only branch to match against, so a
 * keyword hit found only in the title still counts as "headline", never "body".
 */
export function detectHeadlinePlacement(
  title: string | null | undefined,
  bodyText: string | null | undefined,
): HeadlinePlacement {
  const titleLower = String(title ?? "").toLowerCase();
  if (TRIGGER_KEYWORDS.some((kw) => titleLower.includes(kw))) return "headline";

  const bodyLower = String(bodyText ?? "").toLowerCase();
  if (TRIGGER_KEYWORDS.some((kw) => bodyLower.includes(kw))) return "body";

  return "none";
}
