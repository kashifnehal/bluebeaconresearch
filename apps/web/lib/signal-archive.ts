/**
 * Archive/search lookup helpers for GET /api/signals?mode=archive.
 *
 * The Intelligence Feed has a severity floor and a recency window; archive
 * does not. Pagination is a keyset on (event_date, id) — same mechanism as
 * the feed's beyond-page-1 cursor, but a smaller payload (no relevance
 * snapshot / Just-In ids) because archive is sorted by event_date DESC.
 */

export type ArchiveCursor = {
  /** event_date of the last row on the previous page. */
  d: string;
  /** that row's id — tiebreaker for same-timestamp rows. */
  id: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Inclusive start (`T00:00:00.000Z`) or end (`T23:59:59.999Z`) of a YYYY-MM-DD. */
export function parseArchiveDayBound(
  raw: string | null | undefined,
  endOfDay: boolean,
): string | null {
  if (!raw || !DAY_RE.test(raw)) return null;
  const iso = endOfDay ? `${raw}T23:59:59.999Z` : `${raw}T00:00:00.000Z`;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export function encodeArchiveCursor(c: ArchiveCursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

export function decodeArchiveCursor(
  raw: string | null | undefined,
): ArchiveCursor | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      p &&
      typeof p.d === "string" &&
      Number.isFinite(new Date(p.d).getTime()) &&
      typeof p.id === "string" &&
      UUID_RE.test(p.id)
    ) {
      return { d: p.d, id: p.id };
    }
    return null;
  } catch {
    return null;
  }
}
