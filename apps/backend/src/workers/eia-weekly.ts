import { getSupabaseAdmin } from "../clients/supabase.js";

export const EIA_BASE_URL = "https://api.eia.gov/v2";
export const EIA_TIMEOUT_MS = 15_000;
// DESIGN CHOICE: EIA publishes its own rate limits elsewhere and they were not
// read for this task. These numbers are a conservative, unresearched own-limit:
// at least 1s between requests, at most 6 requests in a single run (facet check
// + data call, each with one retry, for up to 2 series = 6 in the worst case).
export const EIA_MAX_REQUESTS_PER_RUN = 6;
export const EIA_REQUEST_GAP_MS = 1_000;

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

export type EiaSeriesConfig = {
  seriesId: string;
  route: string;
  unit: string;
  sourceUrl: string;
};

export const EIA_PETROLEUM_SERIES: EiaSeriesConfig = {
  seriesId: "WCESTUS1",
  route: "petroleum/stoc/wstk",
  unit: "thousand barrels",
  sourceUrl: "https://www.eia.gov/dnav/pet/pet_stoc_wstk_dcu_nus_w.htm",
};

// UNVERIFIED series id — confirmed against the natural-gas facet list at
// runtime (resolveGasSeriesId) before it is ever used in a data request.
export const EIA_GAS_SERIES: EiaSeriesConfig = {
  seriesId: "NW2_EPG0_SWO_R48_BCF",
  route: "natural-gas/stor/wkly",
  unit: "Bcf",
  sourceUrl: "https://www.eia.gov/dnav/ng/ng_stor_wkly_s1_w.htm",
};

export type EiaValueRow = {
  series_id: string;
  period: string;
  value: number;
  unit: string;
  source_url: string;
  released_at: null;
};

export type EiaCollectorResult = {
  ok: true;
  fetched: number;
  upserted: number;
  dropped: number;
  skipped?: "disabled" | "no_key" | "missing_table";
  gasSeriesId?: string | null;
};

export interface EiaCollectorDeps {
  fetchEia?: (url: string) => Promise<unknown>;
  supabase?: SupabaseAdmin;
  enabled?: boolean;
  apiKey?: string;
  sleep?: (ms: number) => Promise<void>;
}

let loggedMissingTable = false;
let loggedGasFallback = false;
let loggedGasIdMismatch = false;

/** Test-only: allow the one-time log lines to fire again. */
export function resetEiaLogsForTests() {
  loggedMissingTable = false;
  loggedGasFallback = false;
  loggedGasIdMismatch = false;
}

export function isEiaCollectorEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.ENABLE_EIA_COLLECTOR || "true").toLowerCase() !== "false";
}

export function isMissingEiaTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (MISSING_TABLE_CODES.has(code)) return true;
  const message = (error.message ?? "").toUpperCase();
  return message.includes("42P01") || message.includes("PGRST205");
}

/** Replaces the api_key query-param value so it never reaches logs, errors, Sentry, or a return value. */
export function redactUrl(text: string): string {
  return text.replace(/([?&]api_key=)[^&\s]*/gi, "$1REDACTED");
}

export function parseEiaValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function parseEiaPeriod(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function asDataRows(payload: unknown): Record<string, unknown>[] {
  const data = (payload as { response?: { data?: unknown } } | null | undefined)?.response?.data;
  return Array.isArray(data) ? data.filter((r): r is Record<string, unknown> => !!r && typeof r === "object") : [];
}

type FacetEntry = { id: string; name: string };

function asFacetRows(payload: unknown): FacetEntry[] {
  const facets = (payload as { response?: { facets?: unknown } } | null | undefined)?.response?.facets;
  if (!Array.isArray(facets)) return [];
  return facets
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object" && typeof f.id === "string")
    .map((f) => ({ id: f.id as string, name: typeof f.name === "string" ? f.name : "" }));
}

function errorStatus(e: unknown): number | undefined {
  return typeof e === "object" && e !== null && "status" in e && typeof (e as { status?: unknown }).status === "number"
    ? (e as { status: number }).status
    : undefined;
}

function safeErrorMessage(e: unknown): string {
  return redactUrl(e instanceof Error ? e.message : String(e));
}

async function defaultFetchEia(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EIA_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const err = new Error(`EIA request failed: ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function buildDataUrl(route: string, seriesId: string, apiKey: string): string {
  return (
    `${EIA_BASE_URL}/${route}/data/?api_key=${encodeURIComponent(apiKey)}` +
    `&frequency=weekly&data[0]=value&facets[series][]=${encodeURIComponent(seriesId)}` +
    `&sort[0][column]=period&sort[0][direction]=desc&length=8`
  );
}

function buildFacetUrl(route: string, apiKey: string): string {
  return `${EIA_BASE_URL}/${route}/facet/series?api_key=${encodeURIComponent(apiKey)}`;
}

type RequestFn = (url: string, opts?: { retryOn5xx?: boolean }) => Promise<unknown>;

/** Enforces the own-limit budget: >=1s between requests, at most EIA_MAX_REQUESTS_PER_RUN per run. */
function createRequestBudget(fetchEia: (url: string) => Promise<unknown>, sleep: (ms: number) => Promise<void>): RequestFn {
  let count = 0;
  let lastAt = 0;

  const doFetch = async (url: string): Promise<unknown> => {
    if (count >= EIA_MAX_REQUESTS_PER_RUN) {
      throw new Error("eia request budget exhausted for this run");
    }
    if (lastAt) {
      const wait = EIA_REQUEST_GAP_MS - (Date.now() - lastAt);
      if (wait > 0) await sleep(wait);
    }
    count += 1;
    lastAt = Date.now();
    return fetchEia(url);
  };

  return async (url: string, opts: { retryOn5xx?: boolean } = {}): Promise<unknown> => {
    try {
      return await doFetch(url);
    } catch (e) {
      const status = errorStatus(e);
      if (opts.retryOn5xx && typeof status === "number" && status >= 500 && count < EIA_MAX_REQUESTS_PER_RUN) {
        try {
          return await doFetch(url);
        } catch (retryErr) {
          throw new Error(safeErrorMessage(retryErr));
        }
      }
      throw new Error(safeErrorMessage(e));
    }
  };
}

/**
 * The gas series id is unverified against EIA's own facet list. Confirms the
 * configured id exists; otherwise looks for exactly one facet whose name
 * contains both "Lower 48" and "Working Gas" and falls back to its id. Never
 * guesses: zero or multiple matches both mean "skip gas this run". A
 * fallback-resolved id is also skipped (see runEiaWeeklyOnce) — apps/web
 * reads only the configured id, so rows stored under another id would never
 * be shown.
 */
export async function resolveGasSeriesId(apiKey: string, request: RequestFn): Promise<string | null> {
  const url = buildFacetUrl(EIA_GAS_SERIES.route, apiKey);
  let payload: unknown;
  try {
    payload = await request(url, { retryOn5xx: true });
  } catch (e) {
    console.warn("[EIA] gas facet lookup failed:", safeErrorMessage(e));
    return null;
  }

  const facets = asFacetRows(payload);
  if (facets.some((f) => f.id === EIA_GAS_SERIES.seriesId)) {
    return EIA_GAS_SERIES.seriesId;
  }

  const matches = facets.filter((f) => /lower 48/i.test(f.name) && /working gas/i.test(f.name));
  if (matches.length === 1) {
    if (!loggedGasFallback) {
      console.log(`[EIA] gas series id resolved via fallback: ${matches[0].id}`);
      loggedGasFallback = true;
    }
    return matches[0].id;
  }

  console.warn("eia gas series not found");
  return null;
}

/**
 * Weekly EIA petroleum stocks + natural-gas storage collector. Mirrors
 * cot-collector.ts's shape: enabled flag, injectable deps, missing-table
 * returns without throwing. Plain fetch (not axios) per task spec.
 */
export async function runEiaWeeklyOnce(deps: EiaCollectorDeps = {}): Promise<EiaCollectorResult> {
  const enabled = deps.enabled ?? isEiaCollectorEnabled();
  if (!enabled) {
    return { ok: true, fetched: 0, upserted: 0, dropped: 0, skipped: "disabled" };
  }

  const apiKey = deps.apiKey ?? process.env.EIA_API_KEY;
  if (!apiKey) {
    return { ok: true, fetched: 0, upserted: 0, dropped: 0, skipped: "no_key" };
  }

  const fetchEia = deps.fetchEia ?? defaultFetchEia;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const supabase = deps.supabase ?? getSupabaseAdmin();
  const request = createRequestBudget(fetchEia, sleep);

  let gasSeriesId: string | null = null;
  try {
    gasSeriesId = await resolveGasSeriesId(apiKey, request);
  } catch (e) {
    console.warn("[EIA] gas series resolution failed:", safeErrorMessage(e));
  }

  const seriesToFetch: EiaSeriesConfig[] = [EIA_PETROLEUM_SERIES];
  if (gasSeriesId === EIA_GAS_SERIES.seriesId) {
    seriesToFetch.push(EIA_GAS_SERIES);
  } else if (gasSeriesId) {
    // Resolved via the name-match fallback, not the configured id. apps/web
    // only reads EIA_GAS_SERIES.seriesId, so rows stored under another id
    // would never be shown — skip storing them rather than fetch and store
    // data nothing displays.
    if (!loggedGasIdMismatch) {
      console.log("eia gas series id differs from configured; skipped");
      loggedGasIdMismatch = true;
    }
  }

  let fetched = 0;
  let dropped = 0;
  const rows: EiaValueRow[] = [];

  for (const series of seriesToFetch) {
    const url = buildDataUrl(series.route, series.seriesId, apiKey);
    let payload: unknown;
    try {
      payload = await request(url, { retryOn5xx: true });
    } catch (e) {
      console.error(`[EIA] ${series.seriesId} data fetch failed:`, safeErrorMessage(e));
      continue;
    }

    const dataRows = asDataRows(payload);
    fetched += dataRows.length;
    for (const raw of dataRows) {
      const period = parseEiaPeriod(raw.period);
      const value = parseEiaValue(raw.value);
      if (period === null || value === null) {
        dropped += 1;
        continue;
      }
      rows.push({
        series_id: series.seriesId,
        period,
        value,
        unit: series.unit,
        source_url: series.sourceUrl,
        released_at: null,
      });
    }
  }

  if (rows.length === 0) {
    return { ok: true, fetched, upserted: 0, dropped, gasSeriesId };
  }

  const { error } = await supabase.from("economic_event_values").upsert(rows, {
    onConflict: "series_id,period",
  });

  if (isMissingEiaTableError(error)) {
    if (!loggedMissingTable) {
      console.warn("[EIA] economic_event_values table is missing; skipping until the migration is applied");
      loggedMissingTable = true;
    }
    return { ok: true, fetched, upserted: 0, dropped, skipped: "missing_table", gasSeriesId };
  }
  if (error) throw new Error(redactUrl(error.message ?? "economic_event_values upsert failed"));

  return { ok: true, fetched, upserted: rows.length, dropped, gasSeriesId };
}
