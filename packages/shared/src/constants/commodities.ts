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
  // COPPER added 2026-08-25: 01_PRODUCT.md §2.13 specs COPPER, which this list was
  // missing even though the price-syncer worker (apps/backend/src/workers/price-syncer.ts)
  // already fetches it from Yahoo Finance (HG=F) — added alongside CORN rather than
  // replacing it, since CORN is equally real/working and nothing calls for dropping it.
  { symbol: "COPPER", label: "Copper", unit: "USD/lb", category: "metals" },
  // EURUSD / USDRUB removed 2026-08-15: addable in the watchlist but /api/prices
  // never fetches them (not in its SYMBOLS list), so they permanently showed a
  // flat "— 0.00%" placeholder. Re-add only once the price-syncer worker actually
  // ingests FX pairs from Yahoo Finance.
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
] as const;

export const REGIONS = [
  { id: "middle-east", label: "Middle East", emoji: "🌍" },
  { id: "eastern-europe", label: "Eastern Europe", emoji: "🌍" },
  { id: "africa", label: "Africa", emoji: "🌍" },
  { id: "asia-pacific", label: "Asia-Pacific", emoji: "🌏" },
  { id: "americas", label: "Americas", emoji: "🌎" },
  { id: "global", label: "Global", emoji: "🌐" },
] as const;

export const SEVERITY_CONFIG = {
  10: { label: "Critical", color: "#EF4444", bgColor: "#2D1B1B" },
  9: { label: "Extreme", color: "#F97316", bgColor: "#2D1B10" },
  8: { label: "High", color: "#F59E0B", bgColor: "#2D2210" },
  7: { label: "Elevated", color: "#EAB308", bgColor: "#2D2610" },
} as const;

