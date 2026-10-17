// Descriptive price context for an event marker. Uses only points that exist
// in the series: no interpolation, no estimates. A value is null when the
// series has no usable point for it.

export type SeriesPoint = { t: number; price: number };

export type MoveSinceEvent = {
  /** First point at or after the event time. */
  atEvent: SeriesPoint | null;
  /** Last point in the series (only when it is a later point than atEvent). */
  latest: SeriesPoint | null;
  /** Percent difference from atEvent.price to latest.price. */
  sincePct: number | null;
  /** Percent difference from atEvent.price to the point about 1 hour after the event. */
  after1hPct: number | null;
  after4hPct: number | null;
  after24hPct: number | null;
};

const HOUR_MS = 3_600_000;

/**
 * How far past the target time (event + N hours) the first available point may
 * be and still count as "the point there". A point further out is a different
 * moment, so the horizon is reported as null instead.
 */
export const HORIZON_TOLERANCE_MS = 30 * 60 * 1000;

function pctDiff(from: number, to: number): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return ((to - from) / from) * 100;
}

export function moveSinceEvent(
  eventMs: number,
  series: SeriesPoint[],
  toleranceMs: number = HORIZON_TOLERANCE_MS,
): MoveSinceEvent {
  const empty: MoveSinceEvent = {
    atEvent: null,
    latest: null,
    sincePct: null,
    after1hPct: null,
    after4hPct: null,
    after24hPct: null,
  };
  if (!Number.isFinite(eventMs)) return empty;

  const points = series
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.price))
    .sort((a, b) => a.t - b.t);
  if (points.length === 0) return empty;

  const atIndex = points.findIndex((p) => p.t >= eventMs);
  if (atIndex < 0) return empty;
  const atEvent = points[atIndex];

  const last = points[points.length - 1];
  const hasLater = points.length - 1 > atIndex;
  const latest = hasLater ? last : null;

  function horizon(hours: number): number | null {
    const target = eventMs + hours * HOUR_MS;
    // Must be a later point than atEvent, otherwise the diff would be 0 for
    // a point that is the event point itself.
    const idx = points.findIndex((p, i) => i > atIndex && p.t >= target);
    if (idx < 0) return null;
    const p = points[idx];
    if (p.t - target > toleranceMs) return null;
    return pctDiff(atEvent.price, p.price);
  }

  return {
    atEvent,
    latest,
    sincePct: latest ? pctDiff(atEvent.price, latest.price) : null,
    after1hPct: horizon(1),
    after4hPct: horizon(4),
    after24hPct: horizon(24),
  };
}
