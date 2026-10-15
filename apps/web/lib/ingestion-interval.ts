/** Must match the backend ingestion schedule. */
export const INGESTION_INTERVAL_MINUTES = 30;

export const HOMEPAGE_COLLECTION_BADGE = `Monitoring active global conflicts — collection runs about every ${INGESTION_INTERVAL_MINUTES} minutes while the daily budget is open`;

export const HOMEPAGE_LATEST_SIGNAL_SCHEDULE = `The most recent signal from the collector pipeline. New events are collected on a regular schedule, about every ${INGESTION_INTERVAL_MINUTES} minutes. Every signal shows when the story was reported and when we flagged it.`;

export const DASHBOARD_FEED_SUBHEAD = `Global signal monitoring. Collection runs about every ${INGESTION_INTERVAL_MINUTES} minutes. Each card shows when the story was reported.`;

export const CHECK_IT_TITLE = "What we say, and where you can check it";

export const CHECK_IT_ROWS = [
  ["Every signal has a clock.", "Open any signal: source time, fetch time, flag time, delay."],
  ["Every claim has a source.", "Named outlets and links on the Sources tab."],
  [
    "Every price move has a baseline.",
    "Price at the first report, at our flag and now, next to that asset's normal 24-hour move, where we have the history.",
  ],
] as const;
