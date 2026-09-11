/**
 * Distinct-outlet helper for the feed coverage line (#126).
 *
 * `signals` has no `source` / `outlet` column. Real values live on the linked
 * `raw_events` row:
 *   - RSS: `raw_data.source` string (feed label, e.g. "DW World")
 *   - GNews: `raw_data.source.name` (GNews article object)
 *   - GDELT: `raw_data.domain`
 * Collector enums (`newsapi` / `gdelt` / `gnews` / `acled`) are not counted as
 * outlets — those are ingest paths, not publications.
 */
export function outletFromRawEvent(row: {
  source?: string | null;
  raw_data?: unknown;
}): string | null {
  const raw = row.raw_data;
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const src = data.source;
  if (typeof src === "string") {
    const trimmed = src.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (src && typeof src === "object") {
    const name = (src as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  if (typeof data.domain === "string" && data.domain.trim()) {
    return data.domain.trim();
  }
  return null;
}
