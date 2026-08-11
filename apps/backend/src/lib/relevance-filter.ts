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
  "bomb", "coup", "riot", "gold", "corn", "bank", "deal", "opec",
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
];

/** Market, finance, business & futures keywords (expanded per product request) */
export const MARKET_FINANCE_KEYWORDS = [
  "stock", "stocks", "market", "markets", "trading", "trader", "trade", "wall street",
  "nasdaq", "dow", "s&p", "s&p 500", "sp500", "russell", "nyse", "ftse", "dax", "nikkei",
  "futures", "future contract", "options", "derivatives", "hedge", "hedging",
  "earnings", "revenue", "profit", "quarterly", "guidance", "forecast", "outlook",
  "inflation", "deflation", "recession", "growth", "gdp", "jobs report", "payrolls",
  "interest rate", "rate cut", "rate hike", "central bank", "federal reserve", "ecb", "boe",
  "bond", "bonds", "treasury", "yield", "yields", "debt ceiling", "credit",
  "currency", "forex", "dollar", "euro", "yen", "yuan", "exchange rate",
  "oil price", "crude price", "brent", "wti", "natural gas", "commodity prices",
  "gold price", "silver", "bitcoin", "crypto", "ethereum",
  "merger", "acquisition", "takeover", "bankruptcy", "layoff", "layoffs",
  "investor", "investment", "portfolio", "fund", "hedge fund", "private equity",
  "ceo", "executive", "shareholder", "dividend", "buyback", "ipo", "listing",
  "regulation", "regulator", "sec ", "ftc", "antitrust", "lawsuit",
  "supply chain", "chip", "semiconductor", "ai stock", "tech stock",
  "bank", "banking", "lender", "mortgage", "commercial real estate",
  "economic", "economy", "financial", "finance", "business", "corporate",
  "volatile", "volatility", "selloff", "rally", "surge", "plunge", "tumble", "soar",
];

export type FeedTier = "world" | "finance";

export function shouldExclude(title: string, summary: string = ""): boolean {
  const text = (title + " " + summary).toLowerCase();
  if (EXCLUDE_KEYWORDS.some((kw) => text.includes(kw))) return true;
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
