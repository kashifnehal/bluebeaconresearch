import Fuse, { type FuseOptionKey, type IFuseOptions } from "fuse.js";

/**
 * Tier 1.5 of the command palette's search: fuzzy, keyword-based matching for
 * Pages / Watchlist commodities / Alert rules — sits between the literal
 * Signals/rules lookups and the AI "Suggested" fallback (command-palette-assist.ts).
 * Extracted from CommandPalette.tsx so the matching logic is unit-testable
 * without rendering React.
 */

export type StaticPage = {
  label: string;
  href: string;
  icon: string;
  /** Real words a user might type — not just the page name (e.g. Watchlist
   * needs "charts" to be findable, not just "watchlist"). */
  keywords: string[];
};

/**
 * Keep this list's `href`s in sync with apps/backend/src/lib/search-catalog.ts's
 * SEARCH_PAGE_ENTRIES (the AI-assist RAG catalog) — command-palette-search.test.ts
 * asserts the two page sets match. Both currently cover the same 8 pages.
 */
export const STATIC_PAGES: StaticPage[] = [
  {
    label: "Intelligence Feed",
    href: "/dashboard",
    icon: "dashboard",
    keywords: ["news", "feed", "commodity news", "latest news", "headlines", "home"],
  },
  {
    label: "Map",
    href: "/map",
    icon: "public",
    keywords: ["map", "tension", "risk map", "heatmap", "global map"],
  },
  {
    label: "Watchlist",
    href: "/watchlist",
    icon: "visibility",
    keywords: ["chart", "charts", "price chart", "prices", "track price"],
  },
  {
    label: "Alerts",
    href: "/alerts",
    icon: "notifications",
    keywords: ["alert", "notify", "notification", "rule"],
  },
  {
    label: "Backtesting Lab",
    href: "/backtesting",
    icon: "science",
    keywords: ["backtest", "backtesting", "historical", "scenario"],
  },
  {
    label: "Settings",
    href: "/settings",
    icon: "settings",
    keywords: ["settings", "account", "preferences"],
  },
  {
    label: "Help",
    href: "/help",
    icon: "help",
    keywords: ["help", "faq", "support", "contact", "feedback"],
  },
  {
    label: "Economic Calendar",
    href: "/calendar",
    icon: "calendar_month",
    keywords: ["calendar", "economic calendar", "fed meeting", "cpi", "nfp"],
  },
];

// Common filler words stripped before building the fuzzy query so a natural
// question ("what are the commodity news") doesn't need every word to match —
// only the content words ("commodity", "news") do. Without this, short filler
// tokens (e.g. "what") can also accidentally fuzzy-collide with unrelated
// short keywords, so dropping them is a precision win as well as a recall one.
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "what", "which", "who", "whom",
  "how", "do", "does", "did", "to", "of", "in", "on", "for", "with", "and",
  "or", "i", "you", "it", "this", "that", "be", "been", "am",
]);

/**
 * Builds a Fuse.js extended-search pattern: tokenize, drop stopwords/noise,
 * then `|`-join so matching ANY one remaining real word is enough (OR, not
 * AND) — the whole point is that a multi-word query doesn't need every word
 * to hit.
 */
function buildQueryPattern(query: string): string {
  const rawTokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  // Length >= 3: below that, a fuzzy (edit-distance-tolerant) match against a
  // large combined keyword string throws too many false positives (e.g. a
  // bare "me" fuzzy-colliding with the "home" keyword) to be useful signal.
  const contentTokens = rawTokens.filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  const tokens = contentTokens.length > 0 ? contentTokens : rawTokens;
  return tokens.join(" | ");
}

// Threshold tuned down slightly from the initial ~0.4 starting point: at 0.4,
// a 5-letter noise token ("input") fuzzy-collided with "Intel..." inside
// "Intelligence Feed" (2 edits / 5 chars = 0.4) and surfaced a page for a
// query with zero real relation — exactly what we must not do (see prompt's
// "no fake match for total noise" rule). 0.3 still finds every case this
// change targets (charts, "commodity news", gold, map, ...) while dropping
// that false positive.
function fuseOptions<T>(): IFuseOptions<T> {
  return {
    keys: ["searchText"] as FuseOptionKey<T>[],
    threshold: 0.3,
    ignoreLocation: true,
    useExtendedSearch: true,
  };
}

/**
 * Generic fuzzy filter: matches items against a derived search string (e.g.
 * label + keywords) built by `getSearchText`. Returns every item, unfiltered,
 * when the query is empty (the palette's pre-typing "show everything" state) —
 * matches the previous `!q || ...` behavior for Pages.
 */
export function fuzzyFilter<T>(query: string, items: readonly T[], getSearchText: (item: T) => string): T[] {
  if (!query.trim()) return [...items];
  const pattern = buildQueryPattern(query);
  if (!pattern) return [];
  const indexed = items.map((item) => ({ item, searchText: getSearchText(item) }));
  const fuse = new Fuse(indexed, fuseOptions<(typeof indexed)[number]>());
  return fuse.search(pattern).map((r) => r.item.item);
}

export function matchStaticPages(query: string, pages: readonly StaticPage[] = STATIC_PAGES): StaticPage[] {
  return fuzzyFilter(query, pages, (p) => [p.label, ...p.keywords].join(" "));
}

export function matchCommodities<T extends { symbol: string; label: string }>(
  query: string,
  commodities: readonly T[],
): T[] {
  return fuzzyFilter(query, commodities, (c) => `${c.label} ${c.symbol}`);
}

export function matchAlertRules<T extends { name: string; regions?: string[]; commodities?: string[] }>(
  query: string,
  rules: readonly T[],
): T[] {
  return fuzzyFilter(query, rules, (r) => [r.name, ...(r.regions ?? []), ...(r.commodities ?? [])].join(" "));
}
