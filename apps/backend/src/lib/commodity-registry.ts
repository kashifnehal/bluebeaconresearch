// Hand-kept copy of packages/shared/src/constants/commodities.ts. The backend
// must not import that package at runtime. A parity test keeps the two arrays
// equal. `provider` is "yahoo" or "none" (2026-10-14): "none" has no
// yahooTicker and no quoteCurrency. Price jobs read PRICED_COMMODITIES only.
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

export const PRICED_COMMODITIES = COMMODITY_REGISTRY.filter(isPricedCommodity);
