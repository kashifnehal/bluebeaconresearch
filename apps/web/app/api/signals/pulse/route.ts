import { NextResponse, type NextRequest } from "next/server";
import { COMMODITIES, FOREX_PAIRS, NEWS_ONLY_COMMODITIES } from "@blue-beacon-research/shared";
import { getRouteSupabaseClients, type RouteSupabaseClients } from "@/lib/supabase-server";
import { rateLimitOrPass } from "@/lib/ratelimit";
import { computePulse, type PulseSignalRow } from "@/lib/pulse";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 1000;
const WINDOW_MS = 48 * 60 * 60 * 1000;

type ImpactColumn = "commodity_impacts" | "currency_pair_impacts";

async function fetchImpactRows(
  supabase: RouteSupabaseClients["supabase"],
  column: ImpactColumn,
  symbol: string,
  fromIso: string,
): Promise<{ rows: PulseDbRow[]; error: string | null }> {
  const rows: PulseDbRow[] = [];
  const contains = JSON.stringify([{ asset: symbol }]);
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("signals")
      .select("id, created_at, commodity_impacts, currency_pair_impacts")
      .gte("created_at", fromIso)
      .filter(column, "cs", contains)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(`[signals/pulse] DB error (${column}):`, error.message);
      return { rows, error: error.message };
    }
    const page = (data ?? []) as PulseDbRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return { rows, error: null };
}

type PulseDbRow = PulseSignalRow & { id: string };

function mergeById(rowSets: PulseDbRow[][]): PulseSignalRow[] {
  const byId = new Map<string, PulseDbRow>();
  for (const rows of rowSets) {
    for (const row of rows) {
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
  }
  return Array.from(byId.values());
}

export async function GET(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    try {
      const rl = await rateLimitOrPass(`signals-pulse:${ip}`);
      if (!rl.success) {
        return NextResponse.json({ error: "rate_limited" }, { status: 200 });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[signals/pulse] rate limit check failed, continuing:", message);
    }

    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol")?.trim().toUpperCase();
    if (!symbol || !/^[A-Z0-9_]+$/.test(symbol)) {
      return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    }

    const isForex = FOREX_PAIRS.some((pair) => pair.symbol === symbol);
    const isCommodity =
      COMMODITIES.some((commodity) => commodity.symbol === symbol) ||
      NEWS_ONLY_COMMODITIES.some((commodity) => commodity.symbol === symbol);
    if (!isForex && !isCommodity) {
      return NextResponse.json({ error: "unknown symbol" }, { status: 400 });
    }

    const clients = await getRouteSupabaseClients({ verify: "claims" });
    if (!clients) return NextResponse.json({ error: "unavailable" }, { status: 200 });
    const { supabase, user } = clients;
    if (!user && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "unauthenticated" }, { status: 200 });
    }

    const now = new Date();
    const fromIso = new Date(now.getTime() - WINDOW_MS).toISOString();

    // Forex pairs are tagged in both impact columns (same split as
    // driver-breakdown). Commodity and news-only symbols stay on
    // commodity_impacts.
    let rows: PulseSignalRow[];
    if (isForex) {
      const [currencyResult, commodityResult] = await Promise.all([
        fetchImpactRows(supabase, "currency_pair_impacts", symbol, fromIso),
        fetchImpactRows(supabase, "commodity_impacts", symbol, fromIso),
      ]);
      if (currencyResult.error || commodityResult.error) {
        return NextResponse.json({ error: "db_error" }, { status: 200 });
      }
      rows = mergeById([currencyResult.rows, commodityResult.rows]);
    } else {
      const result = await fetchImpactRows(supabase, "commodity_impacts", symbol, fromIso);
      if (result.error) {
        return NextResponse.json({ error: "db_error" }, { status: 200 });
      }
      rows = result.rows;
    }

    return NextResponse.json(computePulse(rows, symbol, now));
  } catch (err) {
    const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error("[signals/pulse] unexpected handler error:", stack);
    return NextResponse.json({ error: "db_error" }, { status: 200 });
  }
}
