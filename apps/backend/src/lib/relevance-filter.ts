import { COMMODITY_REGISTRY } from "@blue-beacon-research/shared";

/**
 * Shared relevance filter for all ingestion collectors.
 *
 * Three feed tiers:
 *  - "official" feeds (central banks, EIA, USTR, etc.): hard-exclude spam/sports
 *    + the routine-noise drop below, but skip the geopolitical/market keyword
 *    gate — a government/agency press release is assumed material on its own.
 *  - "finance" feeds (BBC Business, MarketWatch, etc.): only hard-exclude spam/sports,
 *    then the routine-noise drop below
 *  - "world" feeds + APIs (broadcasters/aggregators, GDELT, GNews): exclude spam,
 *    drop routine insider-trade and analyst-rating titles, then match geopolitical
 *    OR market/finance keywords
 */

/** Hard drops — unambiguous spam/noise regardless of context: sports, celebrity,
 * recipes/lifestyle, legacy noise patterns. Never show regardless of source. */
export const EXCLUDE_KEYWORDS_HARD = [
  "sports", "football", "soccer", "fifa", "nfl", "nba", "mlb", "nhl", "olympics",
  "marathon runner", "marathon race", "half marathon",
  "celebrity", "music", "album", "concert", "movie",
  "film festival", "film review", "box office",
  "awards ceremony", "award show", "oscar", "grammy", "emmy",
  "lifestyle", "recipe", "horoscope",
  "tug-of-war", "war movie", "war film", "star wars",
  "bcci", "cricket", "ipl", "tennis", "golf", "basketball", "baseball",
  "oil painting", "anti-war protest 1970",
  // Added 2026-08-25 (Batch 2 / Prompt 5) — confirmed recurring false-positive patterns,
  // each traced against real production `signals` rows. See 08_CURRENT_STATUS.md.
  "farmers market", "farmer's market", "farmer market", "community market",
  "dollar tree", "dollar general",
  "military fitness", "military history", "military hall of fame",
  "net worth", "revolutionary war",
];

/** Ambiguous drops — noise in most headlines, but real in a geopolitical or
 * commodity one (a "trade deadline" at a border crossing, a "war game" run by a
 * military alliance, a "fashion" headline about a sanctions-hit retailer). Only
 * dropped when the title+summary has no anchor — see hasAnchor() below. */
// "cooking" moved here from HARD 2026-10-10 — a probe on origin/main found it hard-dropping
// real commodity headlines ("Cooking oil prices surge after Indonesia export ban", "India
// raises cooking gas cylinder price") with no anchor exemption available. "Cooking show
// returns for a new season" (no anchor) still drops.
export const EXCLUDE_KEYWORDS_AMBIGUOUS = ["trade deadline", "fashion", "war game", "wargame", "cooking"];

/** Combined list, kept for existing external imports (gdelt-collector.ts re-export). */
export const EXCLUDE_KEYWORDS = [...EXCLUDE_KEYWORDS_HARD, ...EXCLUDE_KEYWORDS_AMBIGUOUS];

/** Matches a historical-noise year (1970-2005) only as a standalone number, not as a
 * substring of a larger number (e.g. must not match "2000" inside "12000" or "1970"
 * inside "41970"), and not a dollar amount (e.g. "$2000" is a price, not a year). */
const HISTORICAL_YEAR_PATTERN = /(?<![\d$])(19[7-9]\d|200[0-5])(?!\d)/;

/** Short tokens requiring word-boundary match. Exported (claude/w16a) so
 * rss-collector.ts's midwordOnly diagnostic can test the same list against a
 * plain substring to see if word-boundary protection is the only reason a
 * nokeyword drop didn't pass. */
export const EXACT_WORD_KEYWORDS = new Set([
  "war", "oil", "gas", "fed", "sec", "ipo", "etf", "gdp", "cpi", "ppe",
  "bomb", "coup", "riot", "gold", "corn", "opec",
  // "bank" and "deal" removed 2026-08-25 — confirmed too generic even with word-boundary
  // matching ("bank holiday", "Patriots Deal WR Boutte", any retail "deal"). Real bank/deal
  // signal is still covered: "central bank"/"world bank"/"banking" below, and "trade deal"/
  // "peace deal"/"nuclear deal"/"arms deal" in GEOPOLITICAL_KEYWORDS.
]);

/** Geopolitical + macro conflict keywords */
export const GEOPOLITICAL_KEYWORDS = [
  "conflict", "missile", "explosion", "troops", "military", "sanction", "blockade",
  "invasion", "airstrike", "ceasefire", "drone", "civil war", "armed forces", "navy", "warship",
  "crude", "pipeline", "refinery", "hormuz", "energy crisis", "tariff", "embargo",
  "trade war", "geopolit", "escalation", "tension", "standoff", "nuclear", "nato",
  "iran", "russia", "ukraine", "taiwan", "israel", "hamas", "houthi", "china",
  "wheat", "grain", "copper", "commodity", "supply chain", "shortage",
  "tanker", "suez", "red sea", "strait", "maritime",
  // Added 2026-08-25 — real geopolitical "deal" phrases, to preserve coverage after
  // removing the too-generic bare "deal" from EXACT_WORD_KEYWORDS.
  "trade deal", "peace deal", "nuclear deal", "arms deal", "ceasefire deal",
];

/** Market, finance, business & futures keywords (expanded per product request) */
export const MARKET_FINANCE_KEYWORDS = [
  "stock", "stocks", "market", "markets", "trading", "trader", "trade", "wall street",
  "nasdaq", "dow jones", "s&p", "s&p 500", "sp500", "russell 2000", "nyse", "ftse", "dax", "nikkei",
  "futures", "future contract", "stock options", "derivatives", "hedge", "hedging",
  "earnings", "revenue", "profit", "quarterly", "guidance", "forecast", "outlook",
  "inflation", "deflation", "recession", "growth", "gdp", "jobs report", "payrolls",
  "interest rate", "rate cut", "rate hike", "central bank", "world bank", "federal reserve", "ecb", "boe",
  "bond", "bonds", "treasury", "yield", "yields", "debt ceiling", "credit",
  "currency", "forex", "dollar", "euro", "yen", "yuan", "exchange rate",
  "oil price", "crude price", "brent", "wti", "natural gas", "commodity prices",
  "gold price", "silver", "bitcoin", "crypto", "ethereum",
  "merger", "acquisition", "takeover", "bankruptcy", "layoff", "layoffs",
  "investor", "investment", "portfolio", "fund", "hedge fund", "private equity",
  "ceo", "executive", "shareholder", "dividend", "buyback", "ipo", "listing",
  "regulation", "regulator", "sec ", "ftc", "antitrust", "lawsuit",
  "supply chain", "chip", "semiconductor", "ai stock", "tech stock",
  "banking", "lender", "mortgage", "commercial real estate",
  "volatile", "volatility", "selloff", "surge", "plunge", "tumble", "soar",
  // Removed 2026-08-25 (Batch 2 / Prompt 5), each confirmed against real production
  // false positives via `matchesKeywords()` traced live, not guessed:
  //  - bare "dow" -> "dow jones": substring-matched "Down"/"Downers"/any word containing "dow"
  //  - bare "russell" -> "russell 2000": matched the name "Russell T Davies"
  //  - bare "options" -> "stock options": matched "quarterback options" (sports)
  //  - bare "bank": matched "bank holiday"; "banking"/"central bank"/"world bank" kept
  //  - bare "rally": matched "Dodgers rally" (sports comeback), redundant with
  //    stock/market/index keywords already covering real market-rally headlines
  //  - "economic", "economy", "financial", "finance", "business", "corporate": matched
  //    e.g. "grows new microgreen business" — near-zero specificity as standalone words;
  //    real macro stories still caught via recession/inflation/gdp/growth/country names/etc.
];

export type FeedTier = "world" | "finance" | "official";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Derived from the shared COMMODITY_REGISTRY's filterAnchors — the plain-English
 * words a headline would actually use for each tracked commodity. */
export const TRACKED_COMMODITY_NAMES: string[] = [
  ...new Set(COMMODITY_REGISTRY.flatMap((c) => c.filterAnchors)),
];

/** An anchor is an existing geopolitical word or a tracked commodity name —
 * enough context that an AMBIGUOUS exclude keyword shouldn't drop the title. */
export function hasAnchor(text: string): boolean {
  if (GEOPOLITICAL_KEYWORDS.some((kw) => text.includes(kw))) return true;
  if (TRACKED_COMMODITY_NAMES.some((kw) => new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i").test(text))) return true;
  // "gas" isn't in TRACKED_COMMODITY_NAMES (only "natural gas" is), but it's already
  // treated as a relevant anchor elsewhere via EXACT_WORD_KEYWORDS (matchesKeywords()
  // below) — added here too so "cooking gas" (now an AMBIGUOUS exclude, see
  // EXCLUDE_KEYWORDS_AMBIGUOUS) isn't dropped on a headline matchesKeywords() would keep.
  return /\bgas\b/i.test(text);
}

export function shouldExclude(title: string, summary: string = ""): boolean {
  const text = (title + " " + summary).toLowerCase();
  // Word-boundary match, not plain substring — found live 2026-08-25 (Batch 2 / Prompt 5)
  // that bare `.includes()` here let short EXCLUDE_KEYWORDS entries like "nfl" silently
  // hard-exclude any headline containing "inflation", "conflict", or "influence" (all
  // contain "nfl" as a substring) — dropping some of the most important geopolitical/
  // macro headlines for this product with no trace, since filtered items are never logged.
  if (EXCLUDE_KEYWORDS_HARD.some((kw) => new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i").test(text))) return true;
  if (
    EXCLUDE_KEYWORDS_AMBIGUOUS.some((kw) => new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i").test(text)) &&
    !hasAnchor(text)
  ) {
    return true;
  }
  // Historical-year headlines (e.g. "1973 oil crisis retrospective") are log-only,
  // not a drop — whole-number match only, so it can't fire on a year substring
  // inside a larger number (e.g. "2000" inside "12000 barrels") or a dollar amount.
  if (HISTORICAL_YEAR_PATTERN.test(text)) {
    console.log(`[RELEVANCE] exclude-year would-drop title="${title}"`);
  }
  return false;
}

/** Diagnostic only: which exclude phrase actually matched shouldExclude(), and
 * whether it matched in the title alone or only once the (usually hidden)
 * summary text was included. Used by the [RSS-DROP] sample log so an
 * "exclude" drop is traceable instead of silent. */
export function findExcludeMatch(
  title: string,
  summary: string = "",
): { phrase: string; location: "title" | "summary" } | null {
  const titleText = title.toLowerCase();
  const combinedText = (title + " " + summary).toLowerCase();
  const anchored = hasAnchor(combinedText);

  for (const kw of EXCLUDE_KEYWORDS_HARD) {
    const re = new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i");
    if (re.test(combinedText)) return { phrase: kw, location: re.test(titleText) ? "title" : "summary" };
  }
  if (!anchored) {
    for (const kw of EXCLUDE_KEYWORDS_AMBIGUOUS) {
      const re = new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i");
      if (re.test(combinedText)) return { phrase: kw, location: re.test(titleText) ? "title" : "summary" };
    }
  }
  return null;
}

function matchesKeywords(text: string): boolean {
  for (const kw of EXACT_WORD_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`, "i").test(text)) return true;
  }
  if (GEOPOLITICAL_KEYWORDS.some((kw) => text.includes(kw))) return true;
  if (MARKET_FINANCE_KEYWORDS.some((kw) => text.includes(kw))) return true;
  return false;
}

/**
 * Routine insider-trade and analyst-rating headlines.
 *
 * Measured 2026-10-07 on 1,111 articles: 103 headlines matched these two
 * patterns and none of them became a signal. The patterns were built on that
 * same sample (in-sample), so every drop is logged for audit.
 */
const INSIDER_TRADE_TITLE =
  /(director|ceo|cfo|coo|cto|\bvp\b|\bevp\b|\bsvp\b|officer|insider|chairman|president|\bcao\b).{0,60}\b(sells?|sold|buys?|bought|purchases?)\b.{0,40}\$/i;
const INSIDER_TRADE_SHARES =
  /\b(sells?|buys?)\b \$[0-9,.]+[kmb]? (in|of) (company |class . )?(shares|stock)/i;
const ANALYST_RATING =
  /(price target|stock rating|rating maintained|reiterates .{0,40}(rating|stock)|upgrades .{0,40}(stock|rating)|downgrades .{0,40}(stock|rating)|consensus (rating|recommendation)|average (recommendation|price target|rating)|stock now rated|stock has average)/i;

export function isRoutineMarketNoise(title: string): boolean {
  return INSIDER_TRADE_TITLE.test(title) || INSIDER_TRADE_SHARES.test(title) || ANALYST_RATING.test(title);
}

/**
 * Main relevance gate used by GDELT, GNews, and world-tier RSS feeds.
 */
export function isRelevantEvent(title: string, summary: string = "", feedTier: FeedTier = "world"): boolean {
  if (shouldExclude(title, summary)) return false;
  if (isRoutineMarketNoise(title)) {
    console.log(`[RELEVANCE] routine-noise drop title="${title}"`);
    return false;
  }
  // Finance-category and official-agency RSS feeds: accept all non-excluded
  // headlines — a central-bank/agency press release is assumed material
  // without the geopolitical/market keyword gate below.
  if (feedTier === "finance" || feedTier === "official") return true;
  return matchesKeywords((title + " " + summary).toLowerCase());
}

/**
 * Diagnostic only: why isRelevantEvent() would drop (or keep) a given input.
 * Mirrors isRelevantEvent()'s own check order exactly, using the same functions,
 * so (dropReason(...) === null) always equals isRelevantEvent(...) — never
 * changes a keep/drop decision, only names the reason.
 *
 * Returns "exclude:<phrase>@title|summary", "noise:<insider|shares|rating>",
 * "year" (world/world-keyword-gate drop that also hit the log-only historical
 * year pattern), "nokeyword", or null (kept).
 */
export function dropReason(title: string, summary: string = "", feedTier: FeedTier = "world"): string | null {
  const match = findExcludeMatch(title, summary);
  if (match) return `exclude:${match.phrase}@${match.location}`;

  if (isRoutineMarketNoise(title)) {
    let pattern: "insider" | "shares" | "rating";
    if (INSIDER_TRADE_TITLE.test(title)) pattern = "insider";
    else if (INSIDER_TRADE_SHARES.test(title)) pattern = "shares";
    else pattern = "rating";
    return `noise:${pattern}`;
  }

  if (feedTier === "finance" || feedTier === "official") return null;

  const text = (title + " " + summary).toLowerCase();
  if (matchesKeywords(text)) return null;
  return HISTORICAL_YEAR_PATTERN.test(text) ? "year" : "nokeyword";
}

// Re-export for backward compatibility with existing imports from gdelt-collector
export const HIGH_RELEVANCE_KEYWORDS = [...GEOPOLITICAL_KEYWORDS, ...MARKET_FINANCE_KEYWORDS];
