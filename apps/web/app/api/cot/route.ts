import { NextResponse, type NextRequest } from "next/server";
import { COMMODITIES, FOREX_PAIRS, NEWS_ONLY_COMMODITIES } from "@blue-beacon-research/shared";
import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { rateLimitOrPass } from "@/lib/ratelimit";
import { COT_WEEKS, cotResponseFromQuery, isSchemaMismatchError } from "@/lib/cot";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/cot?symbol=XXXX — last 52 weeks of CFTC managed-money positions
 * from public.cot_positions. Public weekly data, so it is edge-cached and not
 * gated on a session. Returns { available: false } with 200 while the table
 * does not exist yet.
 */
export async function GET(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    try {
      const rl = await rateLimitOrPass(`cot:${ip}`);
      if (!rl.success) {
        return NextResponse.json({ available: false, error: "rate_limited" }, { status: 200, headers: NO_STORE });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[cot] rate limit check failed, continuing:", message);
    }

    const symbol = new URL(req.url).searchParams.get("symbol")?.trim().toUpperCase();
    if (!symbol || !/^[A-Z0-9_]+$/.test(symbol)) {
      return NextResponse.json({ error: "symbol is required" }, { status: 400, headers: NO_STORE });
    }
    const known =
      FOREX_PAIRS.some((p) => p.symbol === symbol) ||
      COMMODITIES.some((c) => c.symbol === symbol) ||
      NEWS_ONLY_COMMODITIES.some((c) => c.symbol === symbol);
    if (!known) {
      return NextResponse.json({ error: "unknown symbol" }, { status: 400, headers: NO_STORE });
    }

    const clients = await getRouteSupabaseClients({ verify: "claims" });
    if (!clients) {
      return NextResponse.json({ available: false, error: "unavailable" }, { status: 200, headers: NO_STORE });
    }

    const { data, error } = await clients.supabase
      .from("cot_positions")
      .select("*")
      .eq("symbol", symbol)
      .order("report_date", { ascending: false })
      .limit(COT_WEEKS);

    if (error && isSchemaMismatchError(error)) {
      console.warn("[cot] cot_positions has no report_date column:", error.message);
    }
    const out = cotResponseFromQuery(symbol, { data: data as unknown[] | null, error });
    if (out.status === 500) console.error("[cot] DB error:", error?.message);
    return NextResponse.json(out.body, {
      status: out.status,
      headers: { "Cache-Control": out.cacheControl },
    });
  } catch (err) {
    const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error("[cot] unexpected handler error:", stack);
    return NextResponse.json({ error: "db_error" }, { status: 500, headers: NO_STORE });
  }
}
