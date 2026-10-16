import { NextResponse, type NextRequest } from "next/server";
import { rateLimitOrPass } from "@/lib/ratelimit";
import { apiError } from "@/lib/api-response";
import { getRouteSupabaseClients, type RouteSupabaseClients } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const HISTORY_POINTS = 12;
const MAX_DAYS = 90;
const MIN_BUCKET_POINTS = 2;
const MAX_BUCKET_POINTS = 60;
const RANGE_PAGE_SIZE = 1000;
const MAX_RANGE_PAGES = 20;

export type PriceHistoryRow = { price: number; fetched_at: string };

// Split [cutoffMs, nowMs] into `n` equal buckets and keep the latest row in
// each non-empty bucket. Fewer rows than buckets is returned as-is — there is
// nothing to collapse. Rows are matched by fetched_at, so input order does not
// matter; a tie keeps the later row.
export function bucketLastPrice(
  rows: PriceHistoryRow[],
  cutoffMs: number,
  nowMs: number,
  n: number,
): PriceHistoryRow[] {
  if (rows.length <= n) return rows;
  const span = nowMs - cutoffMs;
  if (!(span > 0) || !(n > 0)) return rows;
  const width = span / n;
  const chosen: (PriceHistoryRow | undefined)[] = new Array(n);
  for (const row of rows) {
    const t = Date.parse(row.fetched_at);
    if (!Number.isFinite(t)) continue;
    let idx = Math.floor((t - cutoffMs) / width);
    if (idx < 0) idx = 0;
    else if (idx >= n) idx = n - 1;
    const prev = chosen[idx];
    if (!prev || t >= Date.parse(prev.fetched_at)) chosen[idx] = row;
  }
  const out: PriceHistoryRow[] = [];
  for (const row of chosen) {
    if (row) out.push(row);
  }
  return out;
}

function clampBucketPoints(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_BUCKET_POINTS, Math.max(MIN_BUCKET_POINTS, Math.trunc(n)));
}

// Injectable deps — same pattern as lib/events-post-handler.ts — so route
// tests can supply fakes for the Supabase client and rate limiter without a
// module-mocking framework.
export type PricesHistoryDeps = {
  rateLimitOrPass: (key: string) => Promise<{ success: boolean }>;
  getRouteSupabaseClients: () => Promise<RouteSupabaseClients | null>;
};

const defaultDeps: PricesHistoryDeps = {
  rateLimitOrPass,
  getRouteSupabaseClients: () => getRouteSupabaseClients({ verify: "claims" }),
};

export async function handleHistoryGet(req: NextRequest, deps: PricesHistoryDeps = defaultDeps) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol");
  if (!symbol) {
    return apiError(400, "missing_symbol");
  }
  // `days` opts into a date-range window (drill-down chart, and the sparkline
  // when `points` is also set). Omitting it preserves the last-N-snapshots default.
  const daysParam = url.searchParams.get("days");
  const days = daysParam ? Math.min(MAX_DAYS, Math.max(1, Number(daysParam) || 0)) : null;

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  try {
    const rl = await deps.rateLimitOrPass(`prices-history:${ip}`);
    if (!rl.success) {
      // Same hybrid shape as /api/prices' 429 — keeps `points: []` so existing
      // consumers (`json.points ?? []`) keep working, while adding the standard
      // `error` object so a rate-limited response is no longer indistinguishable
      // from a symbol that genuinely has no price history. See lib/api-response.ts.
      return NextResponse.json(
        { points: [], error: { code: "rate_limited", message: "rate_limited" } },
        { status: 429 },
      );
    }
  } catch (err) {
    console.warn("⚠️ [API Prices History] Rate limit check failed, continuing:", err);
  }

  const clients = await deps.getRouteSupabaseClients();
  if (!clients) {
    return NextResponse.json(
      { points: [], error: { code: "unavailable", message: "unavailable" } },
      { status: 503 },
    );
  }
  const { supabase, user } = clients;
  // Auth decision comes from `user` (resolved via the auth-proxy client inside
  // getRouteSupabaseClients), never from whether a cookie client happens to exist —
  // see docs/claude_project/10_DECISIONS.md D46.
  if (!user && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { points: [], error: { code: "unauthenticated", message: "unauthenticated" } },
      { status: 401 },
    );
  }

  if (days) {
    const nowMs = Date.now();
    const cutoffMs = nowMs - days * 24 * 60 * 60 * 1000;
    const cutoff = new Date(cutoffMs).toISOString();
    // PostgREST silently caps any single response at its configured max-rows,
    // so a single .limit() here would truncate to the OLDEST rows in the
    // ascending window instead of the requested count — same bug class fixed
    // in lib/signal-outcomes-server.ts (fetchSignalOutcomeRows). Page instead.
    const rows: PriceHistoryRow[] = [];
    for (let page = 0; page < MAX_RANGE_PAGES; page++) {
      const from = page * RANGE_PAGE_SIZE;
      const { data, error } = await supabase
        .from("commodity_prices")
        .select("price, fetched_at")
        .eq("symbol", symbol)
        .gte("fetched_at", cutoff)
        .order("fetched_at", { ascending: true })
        .range(from, from + RANGE_PAGE_SIZE - 1);

      if (error || !data) {
        console.error("[API Prices History] db_error (range):", error?.message);
        return NextResponse.json(
          { points: [], error: { code: "db_error", message: "db_error" } },
          { status: 502 },
        );
      }
      rows.push(...data);
      if (data.length < RANGE_PAGE_SIZE) break;
    }

    // `points` is honoured only together with `days`. Absent, non-numeric, or
    // blank leaves the paged window unchanged. Out-of-range integers clamp to 2..60.
    const bucketN = clampBucketPoints(url.searchParams.get("points"));
    const sampled = bucketN == null ? rows : bucketLastPrice(rows, cutoffMs, nowMs, bucketN);
    const points = sampled.map((r) => ({ price: r.price, fetchedAt: r.fetched_at }));
    return NextResponse.json({ points });
  }

  const { data, error } = await supabase
    .from("commodity_prices")
    .select("price, fetched_at")
    .eq("symbol", symbol)
    .order("fetched_at", { ascending: false })
    .limit(HISTORY_POINTS);

  if (error || !data) {
    console.error("[API Prices History] db_error:", error?.message);
    return NextResponse.json(
      { points: [], error: { code: "db_error", message: "db_error" } },
      { status: 502 },
    );
  }

  const points = [...data].reverse().map((r) => ({ price: r.price, fetchedAt: r.fetched_at as string }));
  return NextResponse.json({ points });
}

export async function GET(req: NextRequest) {
  return handleHistoryGet(req);
}
