import type { Direction, Signal } from "@blue-beacon-research/shared";

// Event markers on the asset price chart. Pure helpers only: the page decides
// what to fetch and draw, this file decides which markers exist and how they
// group. Descriptive only — nothing here says an event moved a price.

/**
 * Markers rendered closer than this many pixels merge into one marker that
 * shows the total count. DESIGN CHOICE, not measured — chosen as roughly the
 * on-screen footprint of one marker triangle plus its count/arrow labels, so
 * two markers close enough to visually overlap always merge.
 */
export const MARKER_MERGE_PX = 24;

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

/** Median spacing between consecutive points, ms (0 when fewer than 2 points). */
export function medianGapMs(sortedTs: number[]): number {
  if (sortedTs.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < sortedTs.length; i++) gaps.push(sortedTs[i] - sortedTs[i - 1]);
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
}

/**
 * Weekly ranges have one point a week, so a signal is drawn on the nearest
 * point. A signal further from the nearest point than one typical point
 * spacing (it falls outside the series) is left out rather than drawn at the
 * edge. Returns inputs positioned at the snapped point; eventMs is unchanged.
 */
export function snapToSeries(
  signals: MarkerSignal[],
  pointTs: number[],
): MarkerInput[] {
  const ts = pointTs.filter(Number.isFinite).sort((a, b) => a - b);
  if (ts.length === 0) return [];
  const maxDistance = medianGapMs(ts);
  const out: MarkerInput[] = [];
  for (const s of signals) {
    let best = ts[0];
    let bestDist = Math.abs(s.eventMs - best);
    for (const t of ts) {
      const d = Math.abs(s.eventMs - t);
      if (d < bestDist) {
        best = t;
        bestDist = d;
      }
    }
    if (bestDist <= maxDistance) out.push({ ...s, t: best });
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
 * Markers visible in `domain`, positioned on a `boxWidthPx`-wide chart.
 * Markers at the exact same x always share one marker (they would be drawn
 * on top of each other). Otherwise, a marker joins the group to its left
 * once its on-screen distance from that group's first (anchor) marker is
 * less than MARKER_MERGE_PX. Pure function: positions in, clusters out —
 * `boxWidthPx` is the only thing that turns a time distance into a pixel one.
 *
 * `boxWidthPx <= 0` (chart not yet measured) disables distance-based
 * merging so markers never flash together before the real width is known;
 * same-x markers still merge.
 */
export function buildMarkers(
  inputs: MarkerInput[],
  domain: [number, number],
  boxWidthPx: number,
): ChartMarker[] {
  const [lo, hi] = domain;
  const visible = inputs
    .filter((m) => Number.isFinite(m.t) && m.t >= lo && m.t <= hi)
    .sort((a, b) => a.t - b.t || b.severity - a.severity || a.id.localeCompare(b.id));
  if (visible.length === 0) return [];

  const span = hi - lo;
  const pxPerMs = span > 0 && boxWidthPx > 0 ? boxWidthPx / span : 0;
  const groups: MarkerInput[][] = [];
  for (const m of visible) {
    const current = groups[groups.length - 1];
    const startT = current?.[0].t;
    const samePoint = startT !== undefined && m.t === startT;
    const pxGap = startT !== undefined && pxPerMs > 0 ? (m.t - startT) * pxPerMs : Infinity;
    const joins = current !== undefined && (samePoint || pxGap < MARKER_MERGE_PX);
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
