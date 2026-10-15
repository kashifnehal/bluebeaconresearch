// regionMatches mirrors the normalizeRegionKey mapping in
// apps/web/lib/signal-filters.ts (expandRegionVariants) so an alert_rules.regions
// entry written with an old label ("Middle East") matches a signals.region
// value written with the new one ("middle-east"), and vice versa.
// apps/backend does not depend on @blue-beacon-research/shared or apps/web —
// see the identical note on sortByRelevance in ./relevance-rank.ts — so this
// is a small duplicated mapping, not a new cross-app dependency.
//
// canonicalizeRegion is separate: it collapses free text onto the 8 canonical
// ids. regionMatches itself is unchanged.

import { countryRegion } from "./country-region.js";
import {
  CANONICAL_REGION_IDS,
  CANONICAL_REGIONS,
  type CanonicalRegionId,
} from "./region-registry.js";

function normalizeRegionKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}

const CANONICAL_ID_BY_KEY = new Map<string, CanonicalRegionId>();
for (const region of CANONICAL_REGIONS) {
  CANONICAL_ID_BY_KEY.set(normalizeRegionKey(region.id), region.id);
  CANONICAL_ID_BY_KEY.set(normalizeRegionKey(region.label), region.id);
}

// Whole-string synonyms seen at least 3 times in the 90 days before
// 2026-10-15. Keys are normalizeRegionKey form. Each names one place.
// Ambiguous strings (Latin America, Arctic) and legacy "americas" are omitted.
export const REGION_SYNONYMS: Record<string, CanonicalRegionId> = {
  "united states": "north-america",
  "united kingdom": "europe",
  "south asia": "asia-pacific",
  "west africa": "africa",
  canada: "north-america",
  australia: "asia-pacific",
  india: "asia-pacific",
  "southeast asia": "asia-pacific",
  "east asia": "asia-pacific",
  china: "asia-pacific",
  asia: "asia-pacific",
  nigeria: "africa",
  "central asia": "asia-pacific",
  "black sea": "eastern-europe",
  "sub saharan africa": "africa",
  "east africa": "africa",
  "united states florida": "north-america",
  "south africa": "africa",
  "new zealand": "asia-pacific",
  "southern africa": "africa",
  ireland: "europe",
  "united states oklahoma": "north-america",
  "northern europe": "europe",
  "south korea": "asia-pacific",
  "united states louisiana": "north-america",
  caribbean: "north-america",
};

const CANONICAL_ID_SET = new Set<string>(CANONICAL_REGION_IDS);

export function regionMatches(ruleRegions: string[], signalRegion: string): boolean {
  if (!signalRegion) return false;
  const signalKey = normalizeRegionKey(signalRegion);
  return ruleRegions.some((ruleRegion) => normalizeRegionKey(ruleRegion) === signalKey);
}

function matchCanonicalIdOrLabel(raw: string): CanonicalRegionId | null {
  return CANONICAL_ID_BY_KEY.get(normalizeRegionKey(raw)) ?? null;
}

function firstSegment(raw: string): string | null {
  const cuts = ["/", ",", " - "]
    .map((delimiter) => ({ delimiter, index: raw.indexOf(delimiter) }))
    .filter((cut) => cut.index >= 0)
    .sort((a, b) => a.index - b.index);
  if (cuts.length === 0) return null;
  return raw.slice(0, cuts[0].index).trim();
}

export function canonicalizeRegion(
  rawRegion: string | null | undefined,
  country: string | null | undefined,
): CanonicalRegionId {
  const raw = rawRegion ?? "";
  const direct = raw.trim() ? matchCanonicalIdOrLabel(raw) : null;
  if (direct) return direct;

  const segment = raw ? firstSegment(raw) : null;
  if (segment) {
    const fromSegment = matchCanonicalIdOrLabel(segment);
    if (fromSegment) return fromSegment;
  }

  const key = raw.trim() ? normalizeRegionKey(raw) : "";
  if (key && REGION_SYNONYMS[key]) return REGION_SYNONYMS[key];

  const fromCountry = countryRegion(country);
  if (fromCountry && CANONICAL_ID_SET.has(fromCountry)) return fromCountry;

  return "global";
}
