import { NextResponse, type NextRequest } from "next/server";
import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { rateLimitOrPass } from "@/lib/ratelimit";
import { isMissingTableError, isSchemaMismatchError } from "@/lib/cot";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
/** Weekly official data: cache an hour at the edge, serve stale for a day. */
const VALUES_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";
/** Short cache for "no values" so a table created later shows up soon. */
const VALUES_UNAVAILABLE_CACHE_CONTROL = "public, s-maxage=300";

const SERIES_IDS = ["WCESTUS1", "NW2_EPG0_SWO_R48_BCF"];
/** Two periods per series is all the panel needs (latest + previous for the change line). */
const ROWS_PER_SERIES = 2;

/**
 * GET /api/calendar/values — latest official-figure rows for the calendar's
 * "Latest official figures" panel, read from public.economic_event_values.
 * Public weekly data, so it is edge-cached and not gated on a session, same
 * as GET /api/cot. The table is created by a separate backend change — this
 * route returns {"values":[]} with 200 if it does not exist yet, if the
 * query errors, or if there are no rows, so the panel can ship ahead of it.
 */
export async function GET(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    try {
      const rl = await rateLimitOrPass(`calendar-values:${ip}`);
      if (!rl.success) {
        return NextResponse.json({ values: [] }, { status: 200, headers: NO_STORE });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[calendar-values] rate limit check failed, continuing:", message);
    }

    const clients = await getRouteSupabaseClients({ verify: "claims" });
    if (!clients) {
      return NextResponse.json({ values: [] }, { status: 200, headers: NO_STORE });
    }

    const { data, error } = await clients.supabase
      .from("economic_event_values")
      .select("series_id, period, value, unit, source_url, released_at, fetched_at")
      .in("series_id", SERIES_IDS)
      .order("period", { ascending: false });

    if (error) {
      if (isMissingTableError(error) || isSchemaMismatchError(error)) {
        console.warn("[calendar-values] economic_event_values unavailable:", error.message);
        return NextResponse.json({ values: [] }, { status: 200, headers: { "Cache-Control": VALUES_UNAVAILABLE_CACHE_CONTROL } });
      }
      console.error("[calendar-values] DB error:", error.message);
      return NextResponse.json({ values: [] }, { status: 200, headers: NO_STORE });
    }

    const rows = (data as Record<string, unknown>[] | null) ?? [];
    const bySeries = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
      const seriesId = row.series_id as string;
      if (!SERIES_IDS.includes(seriesId)) continue;
      const list = bySeries.get(seriesId) ?? [];
      if (list.length < ROWS_PER_SERIES) {
        list.push(row);
        bySeries.set(seriesId, list);
      }
    }
    const values = SERIES_IDS.flatMap((id) => bySeries.get(id) ?? []);

    return NextResponse.json(
      { values },
      { status: 200, headers: { "Cache-Control": values.length > 0 ? VALUES_CACHE_CONTROL : VALUES_UNAVAILABLE_CACHE_CONTROL } },
    );
  } catch (err) {
    const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error("[calendar-values] unexpected handler error:", stack);
    return NextResponse.json({ values: [] }, { status: 200, headers: NO_STORE });
  }
}
