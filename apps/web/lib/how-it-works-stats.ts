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

type CountResult = { count: number | null; error: unknown };

export type HowItWorksCountQuery = PromiseLike<CountResult> & {
  gte: (column: string, value: string) => PromiseLike<CountResult>;
};

export type HowItWorksCountClient = {
  from: (table: string) => {
    select: (columns: string, options: { count: "exact"; head: true }) => HowItWorksCountQuery;
  };
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Live signal counts for the public how-it-works page.
 * `head: true` asks Postgres for the count only, so the response does not
 * include one row per signal. A total of 0 is treated as the anon client
 * hiding every row and is returned as null so the page can omit that stat.
 */
export async function loadHowItWorksSignalCounts(
  getClient: () => Promise<HowItWorksCountClient>,
  now: number = Date.now(),
): Promise<{ total: number | null; last7Days: number | null }> {
  let total: number | null = null;
  let last7Days: number | null = null;

  try {
    const supabase = await getClient();
    const { count, error } = await supabase.from("signals").select("id", { count: "exact", head: true });
    if (!error && count != null && count > 0) {
      total = count;
    } else if (error) {
      console.error("[how-it-works] total signals query failed:", error);
    }
  } catch (err) {
    console.error("[how-it-works] total signals query threw:", err);
  }

  try {
    const supabase = await getClient();
    const sevenDaysAgo = new Date(now - SEVEN_DAYS_MS).toISOString();
    const { count, error } = await supabase
      .from("signals")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo);
    if (!error && count != null) {
      last7Days = count;
    } else if (error) {
      console.error("[how-it-works] 7-day signals query failed:", error);
    }
  } catch (err) {
    console.error("[how-it-works] 7-day signals query threw:", err);
  }

  return { total, last7Days };
}

export type ClassificationMethodRow = { classification_method: string | null };
type RowsResult = { data: ClassificationMethodRow[] | null; error: unknown };

export type HowItWorksRowsQuery = PromiseLike<RowsResult> & {
  gte: (column: string, value: string) => PromiseLike<RowsResult>;
};

export type HowItWorksRowsClient = {
  from: (table: string) => {
    select: (columns: string) => HowItWorksRowsQuery;
  };
};

export type KeywordFallbackShare = { heuristicCount: number; total: number; pct: number };

/**
 * Share of signals created in the last 7 days classified by the keyword
 * fallback (`signals.classification_method = 'heuristic'`, as opposed to
 * `'claude'` — see apps/web/lib/status-checks.ts's evaluateClassifierHealth
 * for the same two values). Null when there are no signals in the window or
 * the query fails, so the page omits the stat rather than showing 0%.
 */
export async function loadKeywordFallbackShare(
  getClient: () => Promise<HowItWorksRowsClient>,
  now: number = Date.now(),
): Promise<KeywordFallbackShare | null> {
  try {
    const supabase = await getClient();
    const sevenDaysAgo = new Date(now - SEVEN_DAYS_MS).toISOString();
    const { data, error } = await supabase
      .from("signals")
      .select("classification_method")
      .gte("created_at", sevenDaysAgo);
    if (error) {
      console.error("[how-it-works] classification_method query failed:", error);
      return null;
    }
    const rows = data ?? [];
    if (rows.length === 0) return null;
    const heuristicCount = rows.filter((r) => r.classification_method === "heuristic").length;
    return { heuristicCount, total: rows.length, pct: (heuristicCount / rows.length) * 100 };
  } catch (err) {
    console.error("[how-it-works] classification_method query threw:", err);
    return null;
  }
}

export type AcledHealthRow = { status: string | null; detail: string | null } | null;
type AcledHealthResult = { data: AcledHealthRow; error: unknown };

export type HowItWorksAcledClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (column: string, opts: { ascending: boolean }) => {
          limit: (n: number) => {
            maybeSingle: () => PromiseLike<AcledHealthResult>;
          };
        };
      };
    };
  };
};

/**
 * Current ACLED collector state, read live from the most recent
 * `service_health_events` row for `service = 'acled'` (written by
 * apps/backend/src/workers/acled-collector.ts). Always returns a sentence —
 * there is nothing to hide here, only an honest "we don't know" when the
 * query itself fails.
 */
export async function loadAcledState(getClient: () => Promise<HowItWorksAcledClient>): Promise<string> {
  const unavailable = "ACLED conflict data: live state unavailable right now.";
  try {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("service_health_events")
      .select("status, detail")
      .eq("service", "acled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[how-it-works] ACLED health query failed:", error);
      return unavailable;
    }
    if (!data) return "ACLED conflict data: no health events recorded yet.";
    if (data.status === "ok") {
      return `ACLED conflict data: last reported healthy (${data.detail ?? "ok"}).`;
    }
    const detail = data.detail ?? "not currently healthy";
    return `ACLED conflict data: ${detail}${detail.endsWith(".") ? "" : "."}`;
  } catch (err) {
    console.error("[how-it-works] ACLED health query threw:", err);
    return unavailable;
  }
}
