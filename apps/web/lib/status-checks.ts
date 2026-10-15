import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { BASEMAP_TILE_URLS } from "@/lib/map-config";

export type CheckStatus = "Operational" | "Degraded" | "Unknown";
export type SystemCheck = { name: string; status: CheckStatus; detail: string };

const CHECK_TIMEOUT_MS = 3000;

/** BBR working value. No published source. */
export const STATUS_CHECK_RETRIES = 1;

/**
 * Runs a Supabase or Redis check again when it times out or throws.
 * A returned result, including Degraded and Unknown, is not retried.
 * `unknown` is what the caller already showed for a failed check, so the
 * detail text stays the same after the retry is used up.
 */
export async function runStatusCheckWithRetry(
  check: () => Promise<SystemCheck>,
  unknown: SystemCheck = { name: "", status: "Unknown", detail: "" },
): Promise<SystemCheck> {
  const attempts = STATUS_CHECK_RETRIES + 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await check();
    } catch {
      if (attempt === attempts - 1) return unknown;
    }
  }
  return unknown;
}

async function readWithRetry<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (err) {
    if (STATUS_CHECK_RETRIES < 1) throw err;
    return await read();
  }
}

// Ingestion collectors that feed the Intelligence Feed (the `signals` table) via
// raw_events — gdelt/gnews/rss run inside runIngestionCycle() and acled runs right
// after it, all on the same INGESTION_INTERVAL_CRON tick (apps/backend/src/workers.ts).
// price-syncer ("yahoo_finance") writes market prices, not signal content, so it's
// excluded here.
const INGESTION_COLLECTOR_SERVICES = ["gdelt", "gnews", "rss", "acled"] as const;

// Mirrors FALLBACK_INTERVAL_MINUTES in apps/web/app/api/ingestion/status/route.ts —
// the real cadence (buildPipelineStatus's intervalMinutes, apps/backend/src/lib/
// pipeline-status.ts) is self-reported via Redis `pipeline:last_run`; this is only
// used when that's unavailable.
const FALLBACK_INTERVAL_MINUTES = 30;

// 2x the write interval, derived from the observed interval, not a sourced threshold.
function freshnessCutoffMs(intervalMinutes: number): number {
  return intervalMinutes * 2 * 60 * 1000;
}

function formatMinutesAgo(ms: number): string {
  return `${Math.round(ms / 60000)} min ago`;
}

/**
 * Pure decision logic for the Intelligence Feed check, split out from the Supabase
 * fetch so it can be unit tested without a live DB. `latestOkHealthRow` is the most
 * recent status:'ok' row across INGESTION_COLLECTOR_SERVICES (or null if none exist
 * within the lookback window the caller queried); `latestSignalCreatedAt` is used
 * only to add age-of-newest-signal as extra detail text, never as the pass/fail rule.
 * When `budgetClosed` is true, an old collector run is not an outage: the check
 * stays Operational and the detail is the newest-signal age only (2026-10-16).
 * When false, a stale or missing collector run is still Degraded.
 */
export function evaluateIntelligenceFeedHealth(
  latestOkHealthRow: { service: string; created_at: string } | null,
  latestSignalCreatedAt: string | null,
  intervalMinutes: number = FALLBACK_INTERVAL_MINUTES,
  now: number = Date.now(),
  budgetClosed = false,
): SystemCheck {
  const signalAge = latestSignalCreatedAt
    ? formatMinutesAgo(now - new Date(latestSignalCreatedAt).getTime())
    : null;

  if (budgetClosed) {
    return {
      name: "Intelligence Feed",
      status: "Operational",
      detail: signalAge ? `Newest signal ${signalAge}.` : "No signals recorded yet.",
    };
  }

  const signalDetail = signalAge ? `newest signal ${signalAge}` : "no signals recorded yet";

  if (!latestOkHealthRow) {
    return {
      name: "Intelligence Feed",
      status: "Degraded",
      detail: `No ingestion collector (gdelt/gnews/rss/acled) has reported healthy (${signalDetail})`,
    };
  }

  const ageMs = now - new Date(latestOkHealthRow.created_at).getTime();
  const healthy = ageMs <= freshnessCutoffMs(intervalMinutes);
  return {
    name: "Intelligence Feed",
    status: healthy ? "Operational" : "Degraded",
    detail: `${latestOkHealthRow.service} collector last reported healthy ${formatMinutesAgo(ageMs)} (${signalDetail})`,
  };
}

/**
 * Pure decision logic for the Classifier check, split out so it's unit testable.
 * `rows` is every `signals` row created in the lookback window (classification_method
 * only); `null` means the query itself failed/timed out (→ Unknown), as distinct from
 * an empty array, which means no signals were created (→ Operational, nothing to flag).
 * `budgetClosed` is today's `pipeline:last_run.budgetClosed` flag. When true the
 * check stays Operational and uses the same count line as a healthy open cap
 * (2026-10-16). A closed cap does not create a signal from a keyword guess.
 */
export function evaluateClassifierHealth(
  rows: Array<{ classification_method: string | null }> | null,
  budgetClosed = false,
): SystemCheck {
  const name = "Classifier";
  const unknownDetail =
    "At least one signal classified via Claude in the last 6 h (keyword fallback only when no research-model client is configured; collection pauses when the classifier cannot run)";

  const counted = rows ?? [];
  const claudeCount = counted.filter((r) => r.classification_method === "claude").length;
  const heuristicCount = counted.filter((r) => r.classification_method === "heuristic").length;
  const detail = `last 6 h: ${claudeCount} Claude, ${heuristicCount} keyword fallback (only with no research-model client)`;

  if (budgetClosed) return { name, status: "Operational", detail };
  if (rows === null) return { name, status: "Unknown", detail: unknownDetail };

  if (rows.length === 0 || claudeCount > 0) return { name, status: "Operational", detail };
  return { name, status: "Degraded", detail };
}

/**
 * Pure decision logic for the Data Pipeline check, split out so it's unit testable.
 * `usedFallback` means Redis's pipeline:last_run was unavailable and lastFetchedAt
 * was inferred from the newest raw_events row instead — per-collector health is
 * unknowable in that case, so it's never reported as a clean "Operational".
 * `budgetClosed` is the same flag checkClassifier receives from getPipelineRunStatus().
 * When true, the check stays Operational with the healthy open-cap detail (2026-10-16).
 */
export function evaluateDataPipelineFreshness(
  lastFetchedAt: string | null,
  intervalMinutes: number,
  usedFallback: boolean,
  now: number = Date.now(),
  budgetClosed = false,
): SystemCheck {
  const name = "Data Pipeline";
  const detail = `Most recent ingested event, across all collectors combined, is less than ${intervalMinutes * 2} minutes old`;
  if (budgetClosed) return { name, status: "Operational", detail };

  if (!lastFetchedAt) return { name, status: "Unknown", detail };

  const ageMs = now - new Date(lastFetchedAt).getTime();
  const fresh = ageMs <= freshnessCutoffMs(intervalMinutes);
  if (usedFallback) {
    return { name, status: "Degraded", detail: `${detail} — health feed unavailable, freshness inferred from raw_events only` };
  }
  return { name, status: fresh ? "Operational" : "Degraded", detail };
}

// Thresholds below are checks of "data exists and is fresh" for the price-history
// read path (commodity_prices), not a research claim about market behavior.
const PRICE_HISTORY_MIN_ROWS_30D = 100;
const PRICE_HISTORY_MAX_AGE_MINUTES = 45;

/**
 * Pure decision logic for the Price History check, split out so it's unit
 * testable. `rowCount30d` is the count of USOIL rows in commodity_prices over
 * the last 30 days; `newestAgeMinutes` is how old the newest row is, or null
 * when the freshness query itself couldn't run (distinct from "ran and found
 * nothing stale" below the threshold).
 */
export function evaluatePriceHistoryHealth(
  rowCount30d: number,
  newestAgeMinutes: number | null,
): SystemCheck {
  const name = "Price History";
  if (newestAgeMinutes === null) {
    return {
      name,
      status: "Unknown",
      detail: "Could not read commodity_prices to check row count or freshness",
    };
  }

  const detail = `USOIL: ${rowCount30d} rows in last 30d, newest ${Math.round(newestAgeMinutes)} min ago`;
  const healthy =
    rowCount30d >= PRICE_HISTORY_MIN_ROWS_30D && newestAgeMinutes <= PRICE_HISTORY_MAX_AGE_MINUTES;
  return { name, status: healthy ? "Operational" : "Degraded", detail };
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("status check timed out")), ms)),
  ]);
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Accept either key name — see lib/supabase-server.ts for why.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function getUpstashRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

async function checkIntelligenceFeed(intervalMinutes: number, budgetClosed = false): Promise<SystemCheck> {
  const unknownDetail = "At least one ingestion collector (gdelt/gnews/rss/acled) reported healthy recently";
  const unknown = (): SystemCheck => ({ name: "Intelligence Feed", status: "Unknown", detail: unknownDetail });
  return runStatusCheckWithRetry(async () => {
    const supabase = getAdminSupabase();
    if (!supabase) return unknown();

    const [healthResult, signalResult] = await Promise.all([
      withTimeout(
        supabase
          .from("service_health_events")
          .select("service, created_at")
          .in("service", INGESTION_COLLECTOR_SERVICES)
          .eq("status", "ok")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        CHECK_TIMEOUT_MS,
      ),
      withTimeout(
        supabase.from("signals").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        CHECK_TIMEOUT_MS,
      ),
    ]);

    if (healthResult.error) throw new Error("status check query failed");

    return evaluateIntelligenceFeedHealth(
      healthResult.data as { service: string; created_at: string } | null,
      (signalResult.data?.created_at as string | undefined) ?? null,
      intervalMinutes,
      Date.now(),
      budgetClosed,
    );
  }, unknown());
}

async function checkAlertDelivery(): Promise<SystemCheck> {
  const detail = "At least one user has a Telegram or Slack channel connected (config presence, not a live send)";
  const unknown = (): SystemCheck => ({ name: "Alert Delivery", status: "Unknown", detail });
  return runStatusCheckWithRetry(async () => {
    const supabase = getAdminSupabase();
    if (!supabase) return unknown();

    // Config-presence check, not a live send: at least one user has a delivery
    // channel actually connected (telegram_chat_id only lands here via the live
    // Telegram bot webhook completing a /connect flow, which can't happen unless
    // the bot token + webhook path are genuinely configured and reachable).
    const { data, error } = await withTimeout(
      supabase.from("user_channels").select("telegram_chat_id, slack_webhook_url").limit(20),
      CHECK_TIMEOUT_MS,
    );
    if (error) throw new Error("status check query failed");

    const hasConnectedChannel = (data ?? []).some((r) => r.telegram_chat_id || r.slack_webhook_url);
    return { name: "Alert Delivery", status: hasConnectedChannel ? "Operational" : "Degraded", detail };
  }, unknown());
}

async function checkGlobalMap(): Promise<SystemCheck> {
  const detail = "Basemap tile server responds";
  try {
    const tileUrl = BASEMAP_TILE_URLS[0].replace("{z}", "0").replace("{x}", "0").replace("{y}", "0");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    try {
      const res = await fetch(tileUrl, { signal: controller.signal, cache: "no-store" });
      return { name: "Global Map", status: res.ok ? "Operational" : "Degraded", detail };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return { name: "Global Map", status: "Unknown", detail };
  }
}

/**
 * Reads pipeline:last_run once for both its lastFetchedAt (Data Pipeline freshness)
 * and its self-reported intervalMinutes (shared cutoff basis for Data Pipeline and
 * Intelligence Feed) — a single Redis read instead of two concurrent ones racing
 * for the same key.
 */
async function getPipelineRunStatus(): Promise<{
  lastFetchedAt: string | null;
  intervalMinutes: number;
  usedFallback: boolean;
  budgetClosed: boolean;
}> {
  let lastFetchedAt: string | null = null;
  let intervalMinutes = FALLBACK_INTERVAL_MINUTES;
  let usedFallback = false;
  // GAP: not yet written by the backend (W8-BUDGET-DEFER) — stays false until
  // pipeline-status.ts's PipelineRunStatus gains a budgetClosed field. Reading it
  // here now means the UI picks it up with no further web-side change once it does.
  let budgetClosed = false;

  const redis = getUpstashRedis();
  if (redis) {
    try {
      const raw = await readWithRetry(() => withTimeout(redis.get<string>("pipeline:last_run"), CHECK_TIMEOUT_MS));
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        lastFetchedAt = parsed?.lastFetchedAt ?? null;
        if (typeof parsed?.intervalMinutes === "number") intervalMinutes = parsed.intervalMinutes;
        budgetClosed = parsed?.budgetClosed === true;
      }
    } catch {
      // fall through to DB fallback below
    }
  }

  // Reuses the same tracking /api/ingestion/status already relies on (Redis
  // `pipeline:last_run`, falling back to the newest `raw_events` row) instead of
  // adding a second instrumentation path.
  if (!lastFetchedAt) {
    usedFallback = true;
    const supabase = getAdminSupabase();
    if (supabase) {
      try {
        const { data } = await readWithRetry(() =>
          withTimeout(
            supabase.from("raw_events").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
            CHECK_TIMEOUT_MS,
          ),
        );
        lastFetchedAt = (data?.created_at as string | undefined) ?? null;
      } catch {
        // leave null — falls through to Unknown below
      }
    }
  }

  return { lastFetchedAt, intervalMinutes, usedFallback, budgetClosed };
}

async function checkClassifier(budgetClosed: boolean): Promise<SystemCheck> {
  const giveUp = () => evaluateClassifierHealth(null, budgetClosed);
  return runStatusCheckWithRetry(async () => {
    const supabase = getAdminSupabase();
    if (!supabase) return giveUp();

    // 6-hour lookback is a GAP-grade display choice (keeps the detail text's
    // sample size readable) — not a sourced health boundary.
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data, error } = await withTimeout(
      supabase.from("signals").select("classification_method").gte("created_at", sixHoursAgo),
      CHECK_TIMEOUT_MS,
    );
    if (error) throw new Error("status check query failed");
    return evaluateClassifierHealth(data as Array<{ classification_method: string | null }>, budgetClosed);
  }, giveUp());
}

async function checkPriceHistory(): Promise<SystemCheck> {
  const giveUp = () => evaluatePriceHistoryHealth(0, null);
  return runStatusCheckWithRetry(async () => {
    const supabase = getAdminSupabase();
    if (!supabase) return giveUp();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [countResult, newestResult] = await Promise.all([
      withTimeout(
        supabase
          .from("commodity_prices")
          .select("id", { count: "exact", head: true })
          .eq("symbol", "USOIL")
          .gte("fetched_at", thirtyDaysAgo),
        CHECK_TIMEOUT_MS,
      ),
      withTimeout(
        supabase
          .from("commodity_prices")
          .select("fetched_at")
          .eq("symbol", "USOIL")
          .order("fetched_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        CHECK_TIMEOUT_MS,
      ),
    ]);

    if (countResult.error || newestResult.error) throw new Error("status check query failed");

    const newestFetchedAt = newestResult.data?.fetched_at as string | undefined;
    if (!newestFetchedAt) return evaluatePriceHistoryHealth(0, null);

    const newestAgeMinutes = (Date.now() - new Date(newestFetchedAt).getTime()) / 60000;
    return evaluatePriceHistoryHealth(countResult.count ?? 0, newestAgeMinutes);
  }, giveUp());
}

export async function getSystemChecks(): Promise<SystemCheck[]> {
  // getPipelineRunStatus is awaited once and fanned out to both Intelligence Feed
  // and Data Pipeline, which share its intervalMinutes cutoff basis — keeps this
  // concurrent with the other checks rather than blocking them on it.
  const pipelineRun = getPipelineRunStatus();
  const [
    { lastFetchedAt, intervalMinutes, usedFallback, budgetClosed },
    intelligenceFeed,
    alertDelivery,
    globalMap,
    classifier,
    priceHistory,
  ] = await Promise.all([
    pipelineRun,
    pipelineRun.then(({ intervalMinutes, budgetClosed }) => checkIntelligenceFeed(intervalMinutes, budgetClosed)),
    checkAlertDelivery(),
    checkGlobalMap(),
    pipelineRun.then(({ budgetClosed }) => checkClassifier(budgetClosed)),
    checkPriceHistory(),
  ]);

  const dataPipeline = evaluateDataPipelineFreshness(lastFetchedAt, intervalMinutes, usedFallback, Date.now(), budgetClosed);
  return [intelligenceFeed, alertDelivery, globalMap, dataPipeline, classifier, priceHistory];
}
