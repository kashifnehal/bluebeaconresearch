// Single source of truth for every per-commodity fact (Yahoo ticker when the
// asset has a price, Claude classifier allowlist/aliases, RSS relevance-filter
// anchor words). `provider` is "yahoo" or "none" (2026-10-14): "none" has no
// yahooTicker and no quoteCurrency. COMMODITIES below is the priced display
// list apps/web consumes for watchlist and onboarding; it matches
// PRICED_COMMODITIES, not the news-only rows. It is NOT derived from this
// registry so its literal `symbol` union stays narrow (chokepoints.ts depends
// on that). A test checks the match. Forex pairs are out of scope here.
export const COMMODITY_PROVIDERS = ["yahoo", "none"] as const;
export type CommodityProvider = (typeof COMMODITY_PROVIDERS)[number];

type RegistryBase = {
  symbol: string;
  label: string;
  unit: string;
  category: "energy" | "agriculture" | "metals";
  aliases: readonly string[];
  filterAnchors: readonly string[];
};

export type PricedCommodityEntry = RegistryBase & {
  provider: "yahoo";
  yahooTicker: string;
  quoteCurrency: string;
};

export type NewsOnlyCommodityEntry = RegistryBase & {
  provider: "none";
};

export type CommodityRegistryEntry = PricedCommodityEntry | NewsOnlyCommodityEntry;

export const COMMODITY_REGISTRY = [
  {
    symbol: "USOIL",
    label: "WTI Crude",
    unit: "USD/bbl",
    category: "energy",
    yahooTicker: "CL=F",
    provider: "yahoo",
    quoteCurrency: "USD",
    aliases: ["OIL", "CRUDE OIL", "CRUDE", "WTI", "WTI CRUDE", "US OIL"],
    filterAnchors: ["crude", "oil"],
  },
  {
    symbol: "UKOIL",
    label: "Brent Crude",
    unit: "USD/bbl",
    category: "energy",
    yahooTicker: "BZ=F",
    provider: "yahoo",
    quoteCurrency: "USD",
    aliases: ["BRENT", "BRENT CRUDE", "BRENT OIL", "UK OIL"],
    filterAnchors: ["crude", "oil"],
  },
  {
    symbol: "XAUUSD",
    label: "Gold",
    unit: "USD/oz",
    category: "metals",
    yahooTicker: "GC=F",
    provider: "yahoo",
    quoteCurrency: "USD",
    aliases: ["GOLD", "XAU/USD", "XAU"],
    filterAnchors: ["gold"],
  },
  {
    symbol: "WHEAT",
    label: "Wheat",
    unit: "USc/bu",
    category: "agriculture",
    yahooTicker: "ZW=F",
    provider: "yahoo",
    quoteCurrency: "USD",
    aliases: [] as string[],
    filterAnchors: ["wheat"],
  },
  {
    symbol: "NGAS",
    label: "Natural Gas",
    unit: "USD/MMBtu",
    category: "energy",
    yahooTicker: "NG=F",
    provider: "yahoo",
    quoteCurrency: "USD",
    aliases: ["NATURAL GAS", "NAT GAS", "NG", "LNG", "GAS"],
    filterAnchors: ["natural gas"],
  },
  // COPPER added 2026-08-25: 01_PRODUCT.md §2.13 specs COPPER, which this list was
  // missing even though the price-syncer worker (apps/backend/src/workers/price-syncer.ts)
  // already fetches it from Yahoo Finance (HG=F) — added alongside CORN rather than
  // replacing it, since CORN is equally real/working and nothing calls for dropping it.
  {
    symbol: "CORN",
    label: "Corn",
    unit: "USc/bu",
    category: "agriculture",
    yahooTicker: "ZC=F",
    provider: "yahoo",
    quoteCurrency: "USD",
    aliases: ["MAIZE"],
    filterAnchors: ["corn"],
  },
  {
    symbol: "COPPER",
    label: "Copper",
    unit: "USD/lb",
    category: "metals",
    yahooTicker: "HG=F",
    provider: "yahoo",
    quoteCurrency: "USD",
    aliases: ["COPPER", "COPPER FUTURES", "HG"],
    filterAnchors: ["copper"],
  },
  // XAGUSD added 2026-10-01 (doc 278 Part C, founder default): price-syncer.ts
  // already fetches it (SI=F, same as COPPER's HG=F pattern above) but it was
  // never in this list, so it never showed up anywhere in the product. Zero
  // signals carry XAGUSD yet — the classifier isn't touched by this change —
  // so its watchlist page shows a live price chart with an honest "no signals"
  // driver/correlated-events state until a separate task adds silver coverage.
  {
    symbol: "XAGUSD",
    label: "Silver",
    unit: "USD/oz",
    category: "metals",
    yahooTicker: "SI=F",
    provider: "yahoo",
    quoteCurrency: "USD",
    aliases: ["SILVER", "XAG", "XAG/USD", "SILVER FUTURES"],
    filterAnchors: ["silver"],
  },
  // TTF_GAS added 2026-10-10 (W-ASSETS-ENERGY-3): quoteCurrency EUR per the
  // 2026-10-10 Yahoo ticker probe (docs/claude_project/probe-yahoo-tickers-2026-10-10.md,
  // TTF=F returned EUR, price ~81.4 — consistent with EUR/MWh, the unit TTF is
  // quoted in). Alias/filterAnchor sourced from real stored headlines ("european
  // gas" appears repeatedly in signals.title, e.g. "Hormuz tensions push european
  // gas prices to 3.5-year high") — no literal "TTF" headline exists yet.
  {
    symbol: "TTF_GAS",
    label: "European Gas (TTF)",
    unit: "EUR/MWh",
    category: "energy",
    yahooTicker: "TTF=F",
    provider: "yahoo",
    quoteCurrency: "EUR",
    aliases: ["EUROPEAN GAS"],
    filterAnchors: ["european gas"],
  },
  // RBOB added 2026-10-10 (W-ASSETS-ENERGY-3 part 2/3): quoteCurrency USD per
  // the probe (RB=F, price ~3.15). Alias/filterAnchor sourced from real stored
  // headlines ("gasoline" appears in signals.title, e.g. "Iran fuel crisis
  // deepens as regime faces growing gasoline shortfall") — no literal "RBOB"
  // headline exists yet.
  {
    symbol: "RBOB",
    label: "RBOB Gasoline",
    unit: "USD/gal",
    category: "energy",
    yahooTicker: "RB=F",
    provider: "yahoo",
    quoteCurrency: "USD",
    aliases: ["GASOLINE"],
    filterAnchors: ["gasoline"],
  },
  // HEATING_OIL added 2026-10-10 (W-ASSETS-ENERGY-3 part 3/3): quoteCurrency
  // USD per the probe (HO=F, price ~4.74). Alias/filterAnchor sourced from
  // real stored headlines — no literal "heating oil"/"ULSD" headline exists
  // yet, but "diesel" (the real-world fuel this NYMEX contract tracks)
  // appears repeatedly in signals.title (e.g. "Diesel prices soar past $6 a
  // gallon").
  {
    symbol: "HEATING_OIL",
    label: "Heating Oil / ULSD",
    unit: "USD/gal",
    category: "energy",
    yahooTicker: "HO=F",
    provider: "yahoo",
    quoteCurrency: "USD",
    aliases: ["DIESEL"],
    filterAnchors: ["diesel"],
  },
  // News-only tags added 2026-10-14. No Yahoo ticker and no quote currency.
  // filterAnchors stay empty: an anchor only keeps a headline that an
  // ambiguous exclude word would otherwise drop. It does not add retrieval.
  {
    symbol: "VEG_OILS",
    label: "Vegetable Oils",
    unit: "",
    category: "agriculture",
    provider: "none",
    aliases: ["PALM OIL", "SUNFLOWER OIL", "RAPESEED OIL", "CANOLA OIL", "VEGETABLE OIL", "EDIBLE OIL"],
    filterAnchors: [] as string[],
  },
  {
    symbol: "SOYBEANS",
    label: "Soybeans and Soy Oil",
    unit: "",
    category: "agriculture",
    provider: "none",
    aliases: ["SOYBEANS", "SOYBEAN", "SOY OIL", "SOYBEAN OIL", "SOYBEAN MEAL"],
    filterAnchors: [] as string[],
  },
  {
    symbol: "SUGAR",
    label: "Sugar",
    unit: "",
    category: "agriculture",
    provider: "none",
    aliases: ["SUGAR"],
    filterAnchors: [] as string[],
  },
  {
    symbol: "COFFEE",
    label: "Coffee",
    unit: "",
    category: "agriculture",
    provider: "none",
    aliases: ["COFFEE"],
    filterAnchors: [] as string[],
  },
  {
    symbol: "COCOA",
    label: "Cocoa",
    unit: "",
    category: "agriculture",
    provider: "none",
    aliases: ["COCOA"],
    filterAnchors: [] as string[],
  },
  {
    symbol: "ALUMINIUM",
    label: "Aluminium",
    unit: "",
    category: "metals",
    provider: "none",
    aliases: ["ALUMINIUM", "ALUMINUM"],
    filterAnchors: [] as string[],
  },
  {
    symbol: "NICKEL",
    label: "Nickel",
    unit: "",
    category: "metals",
    provider: "none",
    aliases: ["NICKEL"],
    filterAnchors: [] as string[],
  },
] as const satisfies readonly CommodityRegistryEntry[];

function isPricedCommodity<T extends { provider: CommodityProvider }>(
  entry: T,
): entry is Extract<T, { provider: "yahoo" }> {
  return entry.provider === "yahoo";
}

function isNewsOnlyCommodity<T extends { provider: CommodityProvider }>(
  entry: T,
): entry is Extract<T, { provider: "none" }> {
  return entry.provider === "none";
}

export const PRICED_COMMODITIES = COMMODITY_REGISTRY.filter(isPricedCommodity);
export const NEWS_ONLY_COMMODITIES = COMMODITY_REGISTRY.filter(isNewsOnlyCommodity);

// Priced display catalog only (2026-10-14). News-only symbols stay in
// NEWS_ONLY_COMMODITIES so watchlist and onboarding do not gain them here.
export const COMMODITIES = [
  { symbol: "USOIL", label: "WTI Crude", unit: "USD/bbl", category: "energy" },
  { symbol: "UKOIL", label: "Brent Crude", unit: "USD/bbl", category: "energy" },
  { symbol: "XAUUSD", label: "Gold", unit: "USD/oz", category: "metals" },
  { symbol: "WHEAT", label: "Wheat", unit: "USc/bu", category: "agriculture" },
  {
    symbol: "NGAS",
    label: "Natural Gas",
    unit: "USD/MMBtu",
    category: "energy",
  },
  { symbol: "CORN", label: "Corn", unit: "USc/bu", category: "agriculture" },
  { symbol: "COPPER", label: "Copper", unit: "USD/lb", category: "metals" },
  // EURUSD / USDRUB removed 2026-08-15: addable in the watchlist but /api/prices
  // never fetches them (not in its SYMBOLS list), so they permanently showed a
  // flat "— 0.00%" placeholder. Re-add only once the price-syncer worker actually
  // ingests FX pairs from Yahoo Finance.
  { symbol: "XAGUSD", label: "Silver", unit: "USD/oz", category: "metals" },
  // TTF_GAS / RBOB / HEATING_OIL added W-ASSETS-ENERGY-3 (2026-10-10), same
  // reasoning as COPPER/XAGUSD above: registry carries them, this hand-kept
  // list must too or they never show up anywhere in the product.
  { symbol: "TTF_GAS", label: "European Gas (TTF)", unit: "EUR/MWh", category: "energy" },
  { symbol: "RBOB", label: "RBOB Gasoline", unit: "USD/gal", category: "energy" },
  { symbol: "HEATING_OIL", label: "Heating Oil / ULSD", unit: "USD/gal", category: "energy" },
] as const;

// Forex pairs (#87). The same six the classifier emits
// (claude.service.ts ALLOWED_FOREX_PAIRS) and the price-syncer worker syncs
// (price-syncer.ts FOREX_SYMBOLS). `symbol` matches both
// signals.currency_pair_impacts[].asset and the commodity_prices.symbol the
// price-syncer writes; `label` is the slash-formatted display form. `unit` /
// `category` mirror the COMMODITIES shape so the two lists can be spread into
// one array on the watchlist without widening every meta lookup.
export const FOREX_PAIRS = [
  { symbol: "EURUSD", label: "EUR/USD", unit: "rate", category: "forex" },
  { symbol: "GBPUSD", label: "GBP/USD", unit: "rate", category: "forex" },
  { symbol: "USDJPY", label: "USD/JPY", unit: "rate", category: "forex" },
  { symbol: "USDCHF", label: "USD/CHF", unit: "rate", category: "forex" },
  { symbol: "USDRUB", label: "USD/RUB", unit: "rate", category: "forex" },
  { symbol: "USDCNY", label: "USD/CNY", unit: "rate", category: "forex" },
  // USDINR added W7-ASSET-LISTS (2026-10-05, founder decision D2a: USDINR
  // yes, D2b no equities/stocks).
  { symbol: "USDINR", label: "USD/INR", unit: "rate", category: "forex" },
] as const;

export const REGIONS = [
  { id: "middle-east", label: "Middle East", emoji: "🌍" },
  { id: "eastern-europe", label: "Eastern Europe", emoji: "🌍" },
  { id: "europe", label: "Europe", emoji: "🌍" },
  { id: "north-america", label: "North America", emoji: "🌎" },
  { id: "south-america", label: "South America", emoji: "🌎" },
  { id: "asia-pacific", label: "Asia-Pacific", emoji: "🌏" },
  { id: "africa", label: "Africa", emoji: "🌍" },
  { id: "global", label: "Global", emoji: "🌐" },
] as const;

export const SEVERITY_CONFIG = {
  10: { label: "Critical", color: "#EF4444", bgColor: "#2D1B1B" },
  9: { label: "Extreme", color: "#F97316", bgColor: "#2D1B10" },
  8: { label: "High", color: "#F59E0B", bgColor: "#2D2210" },
  7: { label: "Elevated", color: "#EAB308", bgColor: "#2D2610" },
} as const;
