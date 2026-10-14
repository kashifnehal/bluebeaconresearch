import type { CommodityImpact } from "@blue-beacon-research/shared";

export type LocationOrder = "recent" | "count" | "up" | "down" | "az";

/** A signal is enough for grouping when it has a country and a timestamp. */
export type LocationGroupSignal = {
  country?: string | null;
  commodityImpacts?: CommodityImpact[] | null;
  createdAt: string;
  updatedAt?: string | null;
};

export type LocationGroup = {
  country: string;
  count: number;
  up: number;
  down: number;
  other: number;
  /** Raw `updatedAt ?? createdAt` of the newest signal in the group. */
  latest: string;
};

export type LocationGrouping = {
  groups: LocationGroup[];
  withLocation: number;
  total: number;
  up: number;
  down: number;
  uniqueLocations: number;
  noLocation: number;
};

export function countryKey(country: string | null | undefined): string {
  return (country ?? "").trim();
}

/** Milliseconds of `updatedAt ?? createdAt`. Unparseable values sort last. */
export function signalRecencyMs(signal: {
  updatedAt?: string | null;
  createdAt: string;
}): number {
  const raw = signal.updatedAt ?? signal.createdAt;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

/**
 * Highest-confidence commodity impact. Equal confidence keeps the earlier
 * impact (stable sort). Anything other than up or down, including no impact,
 * is "other".
 */
export function primaryImpactDirection(
  impacts: CommodityImpact[] | null | undefined,
): "up" | "down" | "other" {
  const ranked = [...(impacts ?? [])].sort(
    (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0),
  );
  const top = ranked[0];
  if (!top) return "other";
  if (top.direction === "up" || top.direction === "down") return top.direction;
  return "other";
}

function compareGroups(a: LocationGroup, b: LocationGroup, order: LocationOrder): number {
  let diff = 0;
  if (order === "recent") {
    diff = signalRecencyMs({ updatedAt: b.latest, createdAt: b.latest }) -
      signalRecencyMs({ updatedAt: a.latest, createdAt: a.latest });
  } else if (order === "count") {
    diff = b.count - a.count;
  } else if (order === "up") {
    diff = b.up - a.up;
  } else if (order === "down") {
    diff = b.down - a.down;
  }
  if (diff !== 0) return diff;
  return a.country.localeCompare(b.country, "en");
}

export function groupSignalsByLocation(
  signals: LocationGroupSignal[],
  order: LocationOrder,
): LocationGrouping {
  const byCountry = new Map<string, LocationGroup & { latestMs: number }>();
  let noLocation = 0;
  let up = 0;
  let down = 0;

  for (const signal of signals) {
    const country = countryKey(signal.country);
    if (!country) {
      noLocation += 1;
      continue;
    }
    const direction = primaryImpactDirection(signal.commodityImpacts);
    const { raw, ms } = stampOf(signal);
    let group = byCountry.get(country);
    if (!group) {
      group = {
        country,
        count: 0,
        up: 0,
        down: 0,
        other: 0,
        latest: raw,
        latestMs: ms,
      };
      byCountry.set(country, group);
    }
    group.count += 1;
    if (direction === "up") {
      group.up += 1;
      up += 1;
    } else if (direction === "down") {
      group.down += 1;
      down += 1;
    } else {
      group.other += 1;
    }
    if (ms > group.latestMs) {
      group.latestMs = ms;
      group.latest = raw;
    }
  }

  const groups = Array.from(byCountry.values())
    .map(({ latestMs: _latestMs, ...group }) => group)
    .sort((a, b) => compareGroups(a, b, order));

  return {
    groups,
    withLocation: signals.length - noLocation,
    total: signals.length,
    up,
    down,
    uniqueLocations: groups.length,
    noLocation,
  };
}

function stampOf(signal: LocationGroupSignal): { raw: string; ms: number } {
  const raw = signal.updatedAt ?? signal.createdAt;
  return { raw, ms: signalRecencyMs(signal) };
}
