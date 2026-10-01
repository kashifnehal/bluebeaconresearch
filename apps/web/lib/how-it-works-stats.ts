import { CONFIGURED_RSS_FEED_COUNT } from "@blue-beacon-research/shared";

/**
 * Non-RSS ingestion collectors that ACTUALLY INGEST today: GDELT
 * (apps/backend/src/workers/gdelt-collector.ts) and GNews
 * (apps/backend/src/workers/gnews-collector.ts).
 *
 * ACLED (apps/backend/src/workers/acled-collector.ts) is deliberately NOT counted.
 * It is wired into apps/backend/src/workers.ts and its login works, but ACLED has
 * not granted this account API data access (the data read returns HTTP 403), so it
 * has ingested 0 events. Counting it would overstate "sources monitored".
 * ADD IT BACK (set this to 3) once raw_events rows with source = 'acled' exist.
 * Update this if a collector module is added or removed.
 */
export const OTHER_COLLECTOR_COUNT = 2;

/** RSS feeds (packages/shared/src/constants/ingestion.ts) plus the other
 *  collector modules above — the total sources the ingestion pipeline polls. */
export const TOTAL_COLLECTOR_COUNT = CONFIGURED_RSS_FEED_COUNT + OTHER_COLLECTOR_COUNT;

/** Thousands-separated stat value for the stats bar, e.g. "2,996". */
export function formatStatNumber(n: number): string {
  return n.toLocaleString("en-US");
}
