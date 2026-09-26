import { NextResponse, type NextRequest } from "next/server";
import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { rateLimitOrPass } from "@/lib/ratelimit";
import type { CommodityImpact, Direction } from "@blue-beacon-research/shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const WINDOW_DAYS = 7;
const CANDIDATE_LIMIT = 100;
const RESULT_LIMIT = 3;

// Weights per backlog #207/#228 spec: direct asset match (3), direction match (2),
// recency within the 7-day window (linear decay, 2), severity (1). Max possible
// score is 8. Requiring MIN_SCORE strictly greater than the asset-match weight
// alone (3) means an asset match by itself never qualifies — there must be at
// least some contribution from direction, recency, or severity too. Direction
// and recency are both scored relative to the matched asset's own impact entry,
// so neither can contribute without a real asset match already having been found.
const MIN_SCORE = 3;

type SignalRow = {
  id: string;
  title: string;
  severity: number;
  event_date: string | null;
  created_at: string;
  commodity_impacts: CommodityImpact[] | null;
  currency_pair_impacts: CommodityImpact[] | null;
};

function findImpact(row: SignalRow, asset: string): CommodityImpact | null {
  const commodityMatch = (row.commodity_impacts ?? []).find((i) => i.asset === asset);
  if (commodityMatch) return commodityMatch;
  return (row.currency_pair_impacts ?? []).find((i) => i.asset === asset) ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    try {
      const rl = await rateLimitOrPass(`signals-attribution:${ip}`);
      if (!rl.success) {
        return NextResponse.json({ results: [] }, { status: 200 });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[signals/attribution] rate limit check failed, continuing:", message);
    }

    const url = new URL(req.url);
    const asset = url.searchParams.get("asset")?.trim();
    const timestampRaw = url.searchParams.get("timestamp")?.trim();
    const direction = url.searchParams.get("direction")?.trim() as Direction | null;

    if (!asset || !/^[A-Z0-9]+$/.test(asset)) {
      return NextResponse.json({ error: "asset is required" }, { status: 400 });
    }
    const timestampMs = timestampRaw ? new Date(timestampRaw).getTime() : NaN;
    if (!Number.isFinite(timestampMs)) {
      return NextResponse.json({ error: "timestamp is required" }, { status: 400 });
    }
    if (direction !== "up" && direction !== "down" && direction !== "volatile") {
      return NextResponse.json({ error: "direction must be up, down, or volatile" }, { status: 400 });
    }

    const clients = await getRouteSupabaseClients();
    if (!clients) return NextResponse.json({ results: [] });
    const { supabase, user } = clients;
    if (!user && process.env.NODE_ENV === "production") {
      return NextResponse.json({ results: [] });
    }

    const windowStartIso = new Date(timestampMs - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const timestampIso = new Date(timestampMs).toISOString();

    // Candidate widening per spec: a real asset match, OR a categorized (broadly
    // market-relevant) signal even without a direct asset tag — the latter can
    // never clear MIN_SCORE on its own (see note above) but keeps the candidate
    // set from silently excluding signals whose impacts array is incomplete.
    const { data, error } = await supabase
      .from("signals")
      .select("id, title, severity, event_date, created_at, commodity_impacts, currency_pair_impacts")
      .lte("event_date", timestampIso)
      .gte("event_date", windowStartIso)
      .or(
        `commodity_impacts.cs.[{"asset":"${asset}"}],currency_pair_impacts.cs.[{"asset":"${asset}"}],event_category.not.is.null`,
      )
      .order("event_date", { ascending: false })
      .limit(CANDIDATE_LIMIT);

    if (error) {
      console.error("[signals/attribution] DB error:", error.message);
      return NextResponse.json({ results: [] });
    }

    const rows = (data ?? []) as SignalRow[];

    const scored = rows
      .map((row) => {
        const eventDateIso = row.event_date ?? row.created_at;
        const eventMs = new Date(eventDateIso).getTime();
        const hoursBefore = (timestampMs - eventMs) / 3_600_000;
        if (hoursBefore < 0 || hoursBefore > WINDOW_DAYS * 24) return null;

        const impact = findImpact(row, asset);
        const assetScore = impact ? 3 : 0;
        const directionScore = impact && impact.direction === direction ? 2 : 0;
        const recencyScore = 2 * (1 - hoursBefore / (WINDOW_DAYS * 24));
        const severityScore = (row.severity / 10) * 1;
        const score = assetScore + directionScore + recencyScore + severityScore;

        return {
          id: row.id,
          title: row.title,
          eventDate: eventDateIso,
          hoursBefore: Math.round(hoursBefore),
          score,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null && r.score > MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, RESULT_LIMIT)
      .map(({ id, title, eventDate, hoursBefore }) => ({ id, title, eventDate, hoursBefore }));

    return NextResponse.json({ results: scored });
  } catch (err) {
    const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error("[signals/attribution] unexpected handler error:", stack);
    return NextResponse.json({ results: [] });
  }
}
