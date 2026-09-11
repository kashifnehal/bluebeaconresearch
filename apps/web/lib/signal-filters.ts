import { REGIONS } from "@blue-beacon-research/shared";
import { formatRegionLabel } from "@/lib/utils";

/**
 * Commodity list for the shared FilterBar — copied from
 * `apps/backend/src/routes/commodities.ts` (the live /v1/commodities catalog),
 * not from `packages/shared` COMMODITIES, which has since diverged (COPPER in,
 * EURUSD/USDRUB moved to FOREX_PAIRS).
 */
export const FILTER_COMMODITIES = [
  { symbol: "USOIL", label: "WTI Crude", unit: "USD/bbl", category: "energy" },
  { symbol: "UKOIL", label: "Brent Crude", unit: "USD/bbl", category: "energy" },
  { symbol: "XAUUSD", label: "Gold", unit: "USD/oz", category: "metals" },
  { symbol: "WHEAT", label: "Wheat", unit: "USc/bu", category: "agriculture" },
  { symbol: "NGAS", label: "Natural Gas", unit: "USD/MMBtu", category: "energy" },
  { symbol: "CORN", label: "Corn", unit: "USc/bu", category: "agriculture" },
  { symbol: "EURUSD", label: "EUR/USD", unit: "", category: "fx" },
  { symbol: "USDRUB", label: "USD/RUB", unit: "", category: "fx" },
] as const;

export type FilterCommodity = (typeof FILTER_COMMODITIES)[number];
export type CommodityCategory = FilterCommodity["category"];

export const COMMODITY_CATEGORY_PREFIX = "cat:";

export const FILTER_CATEGORIES: { id: CommodityCategory; label: string }[] = [
  { id: "energy", label: "Energy" },
  { id: "agriculture", label: "Agriculture" },
  { id: "metals", label: "Metals" },
  { id: "fx", label: "FX" },
];

export type FeedWindow = "24h" | "7d" | "30d";

export type FilterBarValue = {
  /** Single symbol (USOIL) or category key (`cat:energy`). Null = all. */
  commodity: string | null;
  /** Canonical region id or a normalized extra-region key. Null = all. */
  region: string | null;
  minSeverity: number;
  /** Null = All (omit `window` on the feed; map still sends `window=all`). */
  window: FeedWindow | null;
};

export const DEFAULT_FILTERS: FilterBarValue = {
  commodity: null,
  region: null,
  minSeverity: 1,
  window: null,
};

export const WINDOW_OPTIONS: { id: FeedWindow | null; label: string }[] = [
  { id: "24h", label: "Today" },
  { id: "7d", label: "This week" },
  { id: "30d", label: "This month" },
  { id: null, label: "All" },
];

/** Lowercase + trim + hyphen/underscore → space, so "middle-east" === "Middle East". */
export function normalizeRegionKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}

export function regionsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return !a && !b;
  return normalizeRegionKey(a) === normalizeRegionKey(b);
}

/**
 * Casing / hyphen variants of a selected region, for `.in("region", variants)`
 * against the live DB (which stores both "middle-east" and "Middle East").
 */
export function expandRegionVariants(selected: string): string[] {
  const raw = selected.trim();
  const key = normalizeRegionKey(raw);
  if (!key) return [];
  const hyphen = key.replace(/ /g, "-");
  const titleSpace = key.replace(/\b\w/g, (c) => c.toUpperCase());
  const titleHyphen = hyphen
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join("-");
  const known = REGIONS.find(
    (r) => normalizeRegionKey(r.id) === key || normalizeRegionKey(r.label) === key,
  );
  return [
    ...new Set(
      [raw, key, hyphen, titleSpace, titleHyphen, known?.id, known?.label].filter(
        (v): v is string => Boolean(v),
      ),
    ),
  ];
}

export type RegionOption = { id: string; label: string };

/**
 * Deduped dropdown options: canonical REGIONS first, then any extra raw values
 * folded in by normalized key so "global" and "Global" appear once.
 */
export function buildRegionOptions(extraRaw: string[] = []): RegionOption[] {
  const byKey = new Map<string, RegionOption>();
  for (const r of REGIONS) {
    byKey.set(normalizeRegionKey(r.id), { id: r.id, label: r.label });
  }
  for (const raw of extraRaw) {
    if (!raw || !raw.trim()) continue;
    const key = normalizeRegionKey(raw);
    if (!key || key === "n/a" || key === "unknown") continue;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      id: key,
      label: formatRegionLabel(key.replace(/ /g, "-")),
    });
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function isCommodityCategoryValue(value: string): boolean {
  return value.startsWith(COMMODITY_CATEGORY_PREFIX);
}

export function symbolsForCommodityFilter(value: string | null): string[] {
  if (!value) return [];
  if (isCommodityCategoryValue(value)) {
    const cat = value.slice(COMMODITY_CATEGORY_PREFIX.length);
    return FILTER_COMMODITIES.filter((c) => c.category === cat).map(
      (c) => c.symbol,
    );
  }
  return [value];
}

export function signalMatchesCommodity(
  impacts: { asset: string }[] | null | undefined,
  forexImpacts: { asset: string }[] | null | undefined,
  commodity: string | null,
): boolean {
  const symbols = symbolsForCommodityFilter(commodity);
  if (symbols.length === 0) return true;
  const assets = new Set([
    ...(impacts ?? []).map((c) => c.asset),
    ...(forexImpacts ?? []).map((c) => c.asset),
  ]);
  return symbols.some((s) => assets.has(s));
}

export type DeskPresetId = "oil" | "grain" | "metals";

export const DESK_PRESETS: Record<
  DeskPresetId,
  {
    id: DeskPresetId;
    label: string;
    commodity: string;
    region: string | null;
  }
> = {
  oil: {
    id: "oil",
    label: "Oil Desk",
    commodity: `${COMMODITY_CATEGORY_PREFIX}energy`,
    region: "middle-east",
  },
  grain: {
    id: "grain",
    label: "Grain Desk",
    commodity: `${COMMODITY_CATEGORY_PREFIX}agriculture`,
    region: null,
  },
  metals: {
    id: "metals",
    label: "Metals Desk",
    commodity: "XAUUSD",
    region: null,
  },
};

export function deskMatchesFilters(
  desk: DeskPresetId,
  filters: FilterBarValue,
): boolean {
  const preset = DESK_PRESETS[desk];
  const regionOk =
    preset.region == null
      ? filters.region == null
      : regionsMatch(filters.region, preset.region);
  return filters.commodity === preset.commodity && regionOk;
}
