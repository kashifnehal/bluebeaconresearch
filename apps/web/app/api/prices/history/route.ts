import { NextResponse, type NextRequest } from "next/server";
import { rateLimitOrPass } from "@/lib/ratelimit";
import { apiError } from "@/lib/api-response";
import { getRouteSupabaseClients, type RouteSupabaseClients } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const HISTORY_POINTS = 12;
const MAX_DAYS = 90;
const RANGE_PAGE_SIZE = 1000;
const MAX_RANGE_PAGES = 20;

// Injectable deps — same pattern as lib/events-post-handler.ts — so route
// tests can supply fakes for the Supabase client and rate limiter without a
// module-mocking framework.
export type PricesHistoryDeps = {
  rateLimitOrPass: (key: string) => Promise<{ success: boolean }>;
  getRouteSupabaseClients: () => Promise<RouteSupabaseClients | null>;
};

const defaultDeps: PricesHistoryDeps = { rateLimitOrPass, getRouteSupabaseClients };

export async function handleHistoryGet(req: NextRequest, deps: PricesHistoryDeps = defaultDeps) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol");
  if (!symbol) {
    return apiError(400, "missing_symbol");
  }
  // `days` opts into a date-range window (used by the watchlist drill-down chart);
  // omitting it preserves the original "last N snapshots" behavior the sparkline relies on.
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
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    // PostgREST silently caps any single response at its configured max-rows,
    // so a single .limit() here would truncate to the OLDEST rows in the
    // ascending window instead of the requested count — same bug class fixed
    // in lib/signal-outcomes-server.ts (fetchSignalOutcomeRows). Page instead.
    const rows: { price: number; fetched_at: string }[] = [];
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

    const points = rows.map((r) => ({ price: r.price, fetchedAt: r.fetched_at }));
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
