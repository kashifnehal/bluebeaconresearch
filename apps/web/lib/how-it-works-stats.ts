import { CONFIGURED_RSS_FEED_COUNT } from "@blue-beacon-research/shared";

/**
 * Non-RSS ingestion collectors configured in the pipeline, one per collector
 * module: apps/backend/src/workers/gdelt-collector.ts,
 * apps/backend/src/workers/gnews-collector.ts,
 * apps/backend/src/workers/acled-collector.ts (wired into
 * apps/backend/src/workers.ts; ACLED currently fails auth per
 * service_health_events, so it is "configured", not "ingesting").
 * Update this if a collector module is added or removed.
 */
export const OTHER_COLLECTOR_COUNT = 3;

/** RSS feeds (packages/shared/src/constants/ingestion.ts) plus the other
 *  collector modules above — the total sources the ingestion pipeline polls. */
export const TOTAL_COLLECTOR_COUNT = CONFIGURED_RSS_FEED_COUNT + OTHER_COLLECTOR_COUNT;

/** Thousands-separated stat value for the stats bar, e.g. "2,996". */
export function formatStatNumber(n: number): string {
  return n.toLocaleString("en-US");
}
