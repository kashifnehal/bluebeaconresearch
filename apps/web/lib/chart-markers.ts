import type { Direction, Signal } from "@blue-beacon-research/shared";

// Event markers on the asset price chart. Pure helpers only: the page decides
// what to fetch and draw, this file decides which markers exist and how they
// group. Descriptive only — nothing here says an event moved a price.

/** More markers than this inside the visible range triggers merging. */
export const MARKER_MERGE_THRESHOLD = 12;
/** Markers closer than this share of the visible range merge into one. */
export const MARKER_MERGE_FRACTION = 0.02;

export type SeverityBand = "critical" | "high" | "elevated" | "base";

/** Same cut-offs as SeverityBadge: 9+ / 8 / 7 / below 7. */
export function severityBand(score: number): SeverityBand {
  if (score >= 9) return "critical";
  if (score >= 8) return "high";
  if (score >= 7) return "elevated";
  return "base";
}

export type MarkerSignal = {
  id: string;
  title: string;
  /** When the event was reported (event date, else ingest time), ms. */
  eventMs: number;
  severity: number;
  /** Direction recorded for this asset, or null when the signal has none. */
  direction: Direction | null;
  /** Number of reports behind the signal (signals.sources_count). */
  sourcesCount: number;
};

/** A signal plus the x position (ms) it is drawn at on the chart. */
export type MarkerInput = MarkerSignal & { t: number };

export type ChartMarker = {
  key: string;
  /** x position on the chart, ms. */
  t: number;
  /** Members sorted by severity (high first), then time. */
  members: MarkerSignal[];
  count: number;
  /** Highest severity among members. */
  severity: number;
  /** "up" or "down" only when every member agrees; otherwise null. */
  direction: "up" | "down" | null;
};

export function signalsToMarkerSignals(
  signals: Signal[],
  symbol: string,
  isForex: boolean,
): MarkerSignal[] {
  const out: MarkerSignal[] = [];
  for (const s of signals) {
    const eventMs = new Date(s.eventDate ?? s.createdAt).getTime();
    if (!Number.isFinite(eventMs)) continue;
    const impact = isForex
      ? (s.currencyPairImpacts?.find((c) => c.asset === symbol) ??
        s.commodityImpacts?.find((c) => c.asset === symbol))
      : s.commodityImpacts?.find((c) => c.asset === symbol);
    out.push({
      id: s.id,
      title: s.title,
      eventMs,
      severity: s.severity,
      direction: impact?.direction ?? null,
      sourcesCount: s.sourcesCount,
    });
  }
  return out;
}

function groupDirection(members: MarkerSignal[]): "up" | "down" | null {
  const first = members[0]?.direction;
  if (first !== "up" && first !== "down") return null;
  return members.every((m) => m.direction === first) ? first : null;
}

function toMarker(group: MarkerInput[]): ChartMarker {
  const members: MarkerInput[] = [...group].sort(
    (a, b) => b.severity - a.severity || a.eventMs - b.eventMs || a.id.localeCompare(b.id),
  );
  // Drawn where its highest-severity member sits, so the marker is always at a
  // real position rather than an average of several.
  const anchor = members[0];
  return {
    key: `${anchor.id}:${members.length}`,
    t: anchor.t,
    members,
    count: members.length,
    severity: anchor.severity,
    direction: groupDirection(members),
  };
}

/**
 * Markers visible in `domain`. Up to MARKER_MERGE_THRESHOLD markers are drawn
 * one each, except markers at the exact same x (they would be drawn on top of
 * each other). Above the threshold, markers whose x is less than
 * MARKER_MERGE_FRACTION of the range from the first marker of a group join
 * that group and are drawn as one marker with a count.
 */
export function buildMarkers(
  inputs: MarkerInput[],
  domain: [number, number],
): ChartMarker[] {
  const [lo, hi] = domain;
  const visible = inputs
    .filter((m) => Number.isFinite(m.t) && m.t >= lo && m.t <= hi)
    .sort((a, b) => a.t - b.t || b.severity - a.severity || a.id.localeCompare(b.id));
  if (visible.length === 0) return [];

  const merge = visible.length > MARKER_MERGE_THRESHOLD;
  const gap = (hi - lo) * MARKER_MERGE_FRACTION;
  const groups: MarkerInput[][] = [];
  for (const m of visible) {
    const current = groups[groups.length - 1];
    const startT = current?.[0].t;
    const joins =
      current !== undefined &&
      startT !== undefined &&
      (m.t === startT || (merge && m.t - startT < gap));
    if (joins) current.push(m);
    else groups.push([m]);
  }
  return groups.map(toMarker);
}

export function directionLabel(direction: Direction | null): string {
  switch (direction) {
    case "up":
      return "Up";
    case "down":
      return "Down";
    case "volatile":
      return "Volatile";
    case "neutral":
      return "Neutral";
    default:
      return "Not stated";
  }
}

export function markerAriaLabel(marker: ChartMarker): string {
  const when = new Date(marker.members[0].eventMs).toISOString().slice(0, 10);
  if (marker.count > 1) {
    return `${marker.count} signals reported near ${when}, highest severity ${marker.severity}. Press Enter for news around this time.`;
  }
  const m = marker.members[0];
  const dir = m.direction ? `, direction ${directionLabel(m.direction)}` : "";
  return `Signal reported ${when}, severity ${m.severity}${dir}: ${m.title}. Press Enter for news around this time.`;
}
