import { FOREX_PAIRS } from "@blue-beacon-research/shared";

const DAY_MS = 24 * 60 * 60 * 1000;

export type PulseImpact = {
  asset?: string | null;
  direction?: string | null;
};

/** A `signals` row as selected by `GET /api/signals/pulse`. */
export type PulseSignalRow = {
  created_at: string;
  commodity_impacts?: PulseImpact[] | null;
  currency_pair_impacts?: PulseImpact[] | null;
};

export type PulseCounts = {
  last24h: number;
  prior24h: number;
  /** Null when `prior24h` is 0 — a percent change off zero is not a number. */
  changePct: number | null;
  /** UTC hour 0–23 with the most publishes in the last 24 hours. Null when that window is empty. */
  peakHourUtc: number | null;
  peakHourCount: number;
  up: number;
  down: number;
  other: number;
};

/**
 * Counts of signals BBR published (`created_at`) for one symbol.
 * `last24h` is [now−24h, now]. `prior24h` is [now−48h, now−24h).
 * Up / down / other use the impact whose asset is this symbol, over `last24h` only.
 */
export function computePulse(
  rows: readonly PulseSignalRow[],
  symbol: string,
  now: Date,
): PulseCounts {
  const symbolKey = symbol.trim().toUpperCase();
  const isForex = FOREX_PAIRS.some((pair) => pair.symbol === symbolKey);
  const nowMs = now.getTime();
  const lastStart = nowMs - DAY_MS;
  const priorStart = nowMs - 2 * DAY_MS;

  let last24h = 0;
  let prior24h = 0;
  let up = 0;
  let down = 0;
  let other = 0;
  const hours = new Array<number>(24).fill(0);

  for (const row of rows) {
    const published = Date.parse(row.created_at);
    if (!Number.isFinite(published) || published > nowMs || published < priorStart) continue;
    if (published >= lastStart) {
      last24h += 1;
      hours[new Date(published).getUTCHours()] += 1;
      const direction = directionForSymbol(row, symbolKey, isForex);
      if (direction === "up") up += 1;
      else if (direction === "down") down += 1;
      else other += 1;
    } else {
      prior24h += 1;
    }
  }

  let peakHourUtc: number | null = null;
  let peakHourCount = 0;
  if (last24h > 0) {
    for (let hour = 0; hour < 24; hour += 1) {
      if (hours[hour] > peakHourCount) {
        peakHourCount = hours[hour];
        peakHourUtc = hour;
      }
    }
  }

  return {
    last24h,
    prior24h,
    changePct: prior24h === 0 ? null : ((last24h - prior24h) / prior24h) * 100,
    peakHourUtc,
    peakHourCount,
    up,
    down,
    other,
  };
}

function directionForSymbol(
  row: PulseSignalRow,
  symbol: string,
  isForex: boolean,
): "up" | "down" | "other" {
  const columns = isForex
    ? [row.currency_pair_impacts, row.commodity_impacts]
    : [row.commodity_impacts];
  for (const impacts of columns) {
    if (!Array.isArray(impacts)) continue;
    for (const impact of impacts) {
      if ((impact?.asset ?? "").trim().toUpperCase() !== symbol) continue;
      if (impact.direction === "up" || impact.direction === "down") return impact.direction;
      return "other";
    }
  }
  return "other";
}
