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

