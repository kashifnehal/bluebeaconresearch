/**
 * Shared relevance filter for all ingestion collectors.
 *
 * Two tiers:
 *  - "finance" feeds (BBC Business, MarketWatch, etc.): only hard-exclude spam/sports
 *  - "world" feeds + APIs: exclude spam + match geopolitical OR market/finance keywords
 *
 * See docs/brain/15_INGESTION_PIPELINE.md for full documentation.
 */

/** Hard drops — sports, entertainment, lifestyle (never show regardless of source) */
export const EXCLUDE_KEYWORDS = [
  "sports", "football", "soccer", "fifa", "nfl", "nba", "mlb", "nhl", "olympics", "marathon",
  "celebrity", "music", "album", "concert", "movie", "film", "award", "oscar", "grammy", "emmy",
  "fashion", "lifestyle", "recipe", "cooking", "horoscope",
  "tug-of-war", "war movie", "war film", "star wars", "war game", "wargame",
  "bcci", "cricket", "ipl", "tennis", "golf", "basketball", "baseball",
  "oil painting", "anti-war protest 1970",
  // Added 2026-08-25 (Batch 2 / Prompt 5) — confirmed recurring false-positive patterns,
  // each traced against real production `signals` rows. See 08_CURRENT_STATUS.md.
  "farmers market", "farmer's market", "farmer market", "community market",
  "dollar tree", "dollar general",
  "military fitness", "military history", "military hall of fame",
  "net worth", "revolutionary war", "trade deadline",
];

/** Historical year strings in headlines (legacy archive noise) */
const HISTORICAL_YEARS = [
  "1970", "1971", "1972", "1973", "1974", "1975", "1976", "1977", "1978", "1979",
  "1980", "1981", "1982", "1983", "1984", "1985", "1986", "1987", "1988", "1989",
  "1990", "1991", "1992", "1993", "1994", "1995", "1996", "1997", "1998", "1999",
  "2000", "2001", "2002", "2003", "2004", "2005",
];

/** Short tokens requiring word-boundary match */
const EXACT_WORD_KEYWORDS = new Set([
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

export type FeedTier = "world" | "finance";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function shouldExclude(title: string, summary: string = ""): boolean {
  const text = (title + " " + summary).toLowerCase();
  // Word-boundary match, not plain substring — found live 2026-08-25 (Batch 2 / Prompt 5)
  // that bare `.includes()` here let short EXCLUDE_KEYWORDS entries like "nfl" silently
  // hard-exclude any headline containing "inflation", "conflict", or "influence" (all
  // contain "nfl" as a substring) — dropping some of the most important geopolitical/
  // macro headlines for this product with no trace, since filtered items are never logged.
  if (EXCLUDE_KEYWORDS.some((kw) => new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i").test(text))) return true;
  // Drop headlines anchored on historical years (e.g. "1973 oil crisis retrospective")
  if (HISTORICAL_YEARS.some((yr) => text.includes(yr))) return true;
  return false;
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
 * Main relevance gate used by GDELT, GNews, and world-tier RSS feeds.
 */
export function isRelevantEvent(title: string, summary: string = "", feedTier: FeedTier = "world"): boolean {
  if (shouldExclude(title, summary)) return false;
  // Finance-category RSS feeds: accept all non-excluded business/market headlines
  if (feedTier === "finance") return true;
  return matchesKeywords((title + " " + summary).toLowerCase());
}

// Re-export for backward compatibility with existing imports from gdelt-collector
export const HIGH_RELEVANCE_KEYWORDS = [...GEOPOLITICAL_KEYWORDS, ...MARKET_FINANCE_KEYWORDS];
