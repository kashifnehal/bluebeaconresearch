import type { Chokepoint } from "@blue-beacon-research/shared";
import type { CommodityImpact, Direction, Signal } from "@blue-beacon-research/shared";
import { haversineDistanceKm } from "./geo-coords";

export type ChokepointSignal = Signal & { lat: number; lng: number };

/**
 * Grouped count of CURRENT signals whose commodity impacts overlap a
 * chokepoint's commodities AND whose resolved location falls within
 * radiusKm of it. Same rule as the map's chokepoint popup (map/page.tsx).
 */
export function signalsNearChokepoint(
  signals: ChokepointSignal[],
  chokepoint: Chokepoint,
  radiusKm: number,
): ChokepointSignal[] {
  return signals.filter((s) => {
    const assets = new Set((s.commodityImpacts ?? []).map((c) => c.asset));
    if (!chokepoint.commodities.some((c) => assets.has(c))) return false;
    return haversineDistanceKm(chokepoint.lat, chokepoint.lng, s.lat, s.lng) <= radiusKm;
  });
}

export type DirectionTally = Record<Direction, number>;

/**
 * Tallies one direction per matched signal — its highest-confidence
 * commodityImpact among those overlapping the chokepoint's commodities,
 * same sort/pick used by MapSignalPopup.tsx's impact chips.
 */
export function chokepointDirectionTally(
  matchedSignals: ChokepointSignal[],
  chokepoint: Chokepoint,
): DirectionTally {
  const commoditySet = new Set<string>(chokepoint.commodities);
  const tally: DirectionTally = { up: 0, down: 0, volatile: 0, neutral: 0 };
  for (const s of matchedSignals) {
    const relevant: CommodityImpact[] = [...(s.commodityImpacts ?? [])]
      .filter((c) => commoditySet.has(c.asset))
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    const top = relevant[0];
    if (top) tally[top.direction] += 1;
  }
  return tally;
}
