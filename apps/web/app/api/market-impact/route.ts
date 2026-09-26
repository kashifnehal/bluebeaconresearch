import { NextResponse, type NextRequest } from "next/server";
import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { apiError, apiErrorLogged } from "@/lib/api-response";
import { fetchSignalOutcomeRows } from "@/lib/signal-outcomes-server";
import {
  computeMarketImpactCheckpoints,
  computeMarketImpactMagnitude,
  deriveTimeHorizonLabel,
  type MarketImpactCheckpointPoint,
  type MarketImpactMagnitude,
  type TimeHorizonLabel,
} from "@/lib/market-impact-assessment";

const MARKET_IMPACT_CHECKPOINT_HOURS = 24;

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type MarketImpactAssessmentEntry = {
  magnitude: MarketImpactMagnitude | null;
  timeHorizonLabel: TimeHorizonLabel | null;
  checkpoints: MarketImpactCheckpointPoint[];
};

/**
 * Asset-level counterpart to /api/signals/[id]'s per-signal magnitude block —
 * for surfaces like the Economic Calendar (#227 calendar integration) that
 * want "how has [asset] historically moved" without a specific signal in
 * hand. Reuses the exact same computeMarketImpactMagnitude /
 * deriveTimeHorizonLabel / computeMarketImpactCheckpoints functions and the
 * shared fetchSignalOutcomeRows paging query — no separate query logic.
 */
export async function GET(req: NextRequest) {
  const clients = await getRouteSupabaseClients();
  if (!clients) {
    return apiError(500, "config_error");
  }
  const { supabase, user } = clients;

  if (!user && process.env.NODE_ENV === "production") {
    return apiError(401, "unauthorized");
  }

  const assetsParam = req.nextUrl.searchParams.get("assets") ?? "";
  const assets = [
    ...new Set(
      assetsParam
        .split(",")
        .map((a) => a.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];

  if (assets.length === 0) {
    return apiError(400, "missing_assets");
  }

  let rows;
  try {
    rows = await fetchSignalOutcomeRows(supabase, assets);
  } catch (error) {
    return apiErrorLogged(500, "db_error", error);
  }

  const magnitudes: Record<string, MarketImpactAssessmentEntry> = Object.fromEntries(
    assets.map((asset) => [
      asset,
      {
        magnitude: computeMarketImpactMagnitude(rows, asset, MARKET_IMPACT_CHECKPOINT_HOURS),
        timeHorizonLabel: deriveTimeHorizonLabel(rows, asset),
        checkpoints: computeMarketImpactCheckpoints(rows, asset),
      } satisfies MarketImpactAssessmentEntry,
    ]),
  );

  return NextResponse.json({ magnitudes });
}
