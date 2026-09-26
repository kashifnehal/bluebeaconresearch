import { NextResponse, type NextRequest } from "next/server";
import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { rateLimitOrPass } from "@/lib/ratelimit";
import type { CommodityImpact, Direction, Region } from "@blue-beacon-research/shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const WINDOW_DAYS = 7;
const CANDIDATE_LIMIT = 100;
// Up to 10 dated candidates, not "the" explanation — copy never implies any one
// item is more likely the cause, so the qualifying floor below is a relevance
// filter, not a "best guess" cutoff.
const RESULT_LIMIT = 10;

// Scoring weights (unchanged from the original #207/#228 build): direct asset
// match (3), direction match (2), recency within the 7-day window (linear
// decay, 2), severity (1). Used only to rank/order candidates now — the
// qualifying floor is "same asset OR same region" (see assetRegions below),
// not a minimum score.
type SignalRow = {
  id: string;
  title: string;
  severity: number;
  event_date: string | null;
  created_at: string;
  region: Region | null;
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

    // Candidate widening: a real asset match, OR a categorized (broadly
    // market-relevant) signal even without a direct asset tag — the latter only
    // qualifies below if it also falls in a region this asset is actually tied
    // to in this window (see assetRegions), so it doesn't silently pull in
    // unrelated noise just because event_category is set.
    const { data, error } = await supabase
      .from("signals")
      .select("id, title, severity, event_date, created_at, region, commodity_impacts, currency_pair_impacts")
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

    // An asset like USOIL has no stored "region" of its own — it isn't tied to
    // one place. So "same region as the clicked instrument" is inferred from
    // this window: the region(s) where a signal actually carried a direct
    // impact on this asset. A same-region candidate without a direct asset tag
    // is then real relevant background, not an arbitrary broadening.
    const assetRegions = new Set(
      rows
        .filter((row) => findImpact(row, asset))
        .map((row) => row.region)
        .filter((r): r is Region => Boolean(r)),
    );

    const scored = rows
      .map((row) => {
        const eventDateIso = row.event_date ?? row.created_at;
        const eventMs = new Date(eventDateIso).getTime();
        const hoursBefore = (timestampMs - eventMs) / 3_600_000;
        if (hoursBefore < 0 || hoursBefore > WINDOW_DAYS * 24) return null;

        const impact = findImpact(row, asset);
        const assetMatch = Boolean(impact);
        const regionMatch = Boolean(row.region) && assetRegions.has(row.region as Region);
        // Relevance floor: same asset OR same region, within the window already
        // enforced above — no minimum score gate, so a real dated event doesn't
        // get silently hidden for scoring low on direction/recency/severity.
        if (!assetMatch && !regionMatch) return null;

        const assetScore = assetMatch ? 3 : 0;
        const directionScore = impact && impact.direction === direction ? 2 : 0;
        const recencyScore = 2 * (1 - hoursBefore / (WINDOW_DAYS * 24));
        const severityScore = (row.severity / 10) * 1;
        const score = assetScore + directionScore + recencyScore + severityScore;

        return {
          id: row.id,
          title: row.title,
          eventDate: eventDateIso,
          hoursBefore: Math.round(hoursBefore),
          severity: row.severity,
          score,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, RESULT_LIMIT)
      .map(({ id, title, eventDate, hoursBefore, severity }) => ({ id, title, eventDate, hoursBefore, severity }));

    return NextResponse.json({ results: scored });
  } catch (err) {
    const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error("[signals/attribution] unexpected handler error:", stack);
    return NextResponse.json({ results: [] });
  }
}
