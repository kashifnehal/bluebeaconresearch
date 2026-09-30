import { NextResponse, type NextRequest } from "next/server";
import { getRouteSupabaseClients, type RouteSupabaseClients } from "@/lib/supabase-server";
import { rateLimitOrPass } from "@/lib/ratelimit";
import { COMMODITIES, FOREX_PAIRS, type EventCategory } from "@blue-beacon-research/shared";
import { parseEventCategory } from "@/lib/market-impact-assessment";
import { mergeSignalRows, type DriverSignalRow } from "@/lib/driver-breakdown";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 1000;
// Guardrail against an unbounded window, not a real product ceiling — the
// widest chart range (5Y) is ~1825 days, well under this.
const MAX_WINDOW_DAYS = 365 * 6;

// event_category is null on every pre-#141 signal and on some post-gate rows
// whose classification never set it (see docs/brain/08_CURRENT_STATUS.md).
// That's real missing data, not a 10th taxonomy value, so it gets its own
// honest bucket instead of being folded into "other_market_relevant" (a real
// category Claude does assign) or silently dropped from the totals.
export const UNCATEGORIZED_KEY = "uncategorized" as const;
export type DriverBucketKey = EventCategory | typeof UNCATEGORIZED_KEY;

function utcDay(iso: string): string {
  return iso.slice(0, 10);
}

type ImpactColumn = "commodity_impacts" | "currency_pair_impacts";

// Page with .range() — USOIL alone carries well over PostgREST's 1,000-row
// cap in some ranges, so a single unranged .select() would silently
// undercount (see apps/web/lib/signal-outcomes-server.ts for the same
// pattern already proven against this exact failure mode).
async function fetchImpactRows(
  supabase: RouteSupabaseClients["supabase"],
  column: ImpactColumn,
  symbol: string,
  fromIso: string,
  toIso: string,
): Promise<{ rows: DriverSignalRow[]; error: string | null }> {
  const rows: DriverSignalRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("signals")
      .select("id, event_date, created_at, event_category")
      .lte("event_date", toIso)
      .gte("event_date", fromIso)
      .filter(column, "cs", `[{"asset":"${symbol}"}]`)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(`[signals/driver-breakdown] DB error (${column}):`, error.message);
      return { rows, error: error.message };
    }
    const page = (data ?? []) as DriverSignalRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return { rows, error: null };
}

export async function GET(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    try {
      const rl = await rateLimitOrPass(`signals-driver-breakdown:${ip}`);
      if (!rl.success) {
        return NextResponse.json({ rows: [], error: "rate_limited" }, { status: 200 });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[signals/driver-breakdown] rate limit check failed, continuing:", message);
    }

    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol")?.trim().toUpperCase();
    const fromRaw = url.searchParams.get("from")?.trim();
    const toRaw = url.searchParams.get("to")?.trim();

    if (!symbol || !/^[A-Z0-9]+$/.test(symbol)) {
      return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    }
    const fromMs = fromRaw ? new Date(fromRaw).getTime() : NaN;
    const toMs = toRaw ? new Date(toRaw).getTime() : NaN;
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) {
      return NextResponse.json({ error: "from/to must be valid ISO timestamps with from <= to" }, { status: 400 });
    }
    if ((toMs - fromMs) / (24 * 60 * 60 * 1000) > MAX_WINDOW_DAYS) {
      return NextResponse.json({ error: "window too wide" }, { status: 400 });
    }

    // Commodity symbols match commodity_impacts, FX symbols match
    // currency_pair_impacts — same taxonomy split as the watchlist page and
    // /api/signals/attribution.
    const isForex = FOREX_PAIRS.some((f) => f.symbol === symbol);
    const isCommodity = COMMODITIES.some((c) => c.symbol === symbol);
    if (!isForex && !isCommodity) {
      return NextResponse.json({ error: "unknown symbol" }, { status: 400 });
    }

    const clients = await getRouteSupabaseClients();
    if (!clients) return NextResponse.json({ rows: [] });
    const { supabase, user } = clients;
    if (!user && process.env.NODE_ENV === "production") {
      return NextResponse.json({ rows: [] });
    }

    const fromIso = new Date(fromMs).toISOString();
    const toIso = new Date(toMs).toISOString();

    // Forex pairs are tagged in BOTH commodity_impacts and currency_pair_impacts
    // (verified 2026-10-01: EURUSD had 248 rows in the former vs 39 in the
    // latter), so a forex symbol reads both columns and de-dupes by signal id —
    // a single-column query undercounts. Commodity symbols only ever land in
    // commodity_impacts, so they keep the single query.
    let rows: DriverSignalRow[];
    if (isForex) {
      const [currencyResult, commodityResult] = await Promise.all([
        fetchImpactRows(supabase, "currency_pair_impacts", symbol, fromIso, toIso),
        fetchImpactRows(supabase, "commodity_impacts", symbol, fromIso, toIso),
      ]);
      if (currencyResult.error || commodityResult.error) {
        return NextResponse.json({ rows: [], error: "db_error" }, { status: 200 });
      }
      rows = mergeSignalRows(currencyResult.rows, commodityResult.rows);
    } else {
      const result = await fetchImpactRows(supabase, "commodity_impacts", symbol, fromIso, toIso);
      if (result.error) {
        return NextResponse.json({ rows: [], error: "db_error" }, { status: 200 });
      }
      rows = result.rows;
    }

    // Group by UTC day + event_category. Map key "day|category" -> count.
    const counts = new Map<string, number>();
    for (const row of rows) {
      const dateIso = row.event_date ?? row.created_at;
      const day = utcDay(dateIso);
      const category: DriverBucketKey = parseEventCategory(row.event_category) ?? UNCATEGORIZED_KEY;
      const key = `${day}|${category}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const result = Array.from(counts.entries()).map(([key, count]) => {
      const [date, category] = key.split("|") as [string, DriverBucketKey];
      return { date, category, count };
    });

    return NextResponse.json({ rows: result, total: rows.length });
  } catch (err) {
    const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error("[signals/driver-breakdown] unexpected handler error:", stack);
    return NextResponse.json({ rows: [], error: "db_error" }, { status: 200 });
  }
}
