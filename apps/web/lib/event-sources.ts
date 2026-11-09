import { sourceHostname } from "@/lib/source-host";

// Factored out of app/api/signals/[id]/route.ts (2026-11-09) so the event
// detail page's server-rendered hero (title/summary/severity/times/sources)
// can compute the exact same "first reported at" + sources timeline the API
// route always has, without duplicating the logic in two places and risking
// drift between them.

export type FirstReportKind = "publisher" | "gdelt_seen";

export type EventSource = {
  title: string;
  url: string | null;
  sourceLabel: string | null;
  domain: string | null;
  publishedAt: string | null;
};

export type RawEventStampRow = {
  event_date?: unknown;
  created_at?: unknown;
  source?: unknown;
};

export function validIso(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? value : null;
}

export function earliestRawStamp(
  rows: RawEventStampRow[],
  field: "event_date" | "created_at",
): { at: string; source: string | null } | null {
  let best: { at: string; t: number; source: string | null } | null = null;
  for (const row of rows) {
    const at = validIso(row[field]);
    if (!at) continue;
    const t = new Date(at).getTime();
    if (!best || t < best.t) {
      best = {
        at,
        t,
        source: typeof row.source === "string" ? row.source : null,
      };
    }
  }
  return best ? { at: best.at, source: best.source } : null;
}

export function kindForRawSource(source: string | null): FirstReportKind | null {
  if (source === "rss" || source === "newsapi") return "publisher";
  if (source === "gdelt") return "gdelt_seen";
  return null;
}

// GDELT's raw_data.seendate is "20260905T160000Z" (no separators), not ISO-8601.
export function seendateToIso(seendate: unknown): string | null {
  if (typeof seendate !== "string" || seendate.length < 15) return null;
  const iso = `${seendate.slice(0, 4)}-${seendate.slice(4, 6)}-${seendate.slice(6, 8)}T${seendate.slice(9, 11)}:${seendate.slice(11, 13)}:${seendate.slice(13, 15)}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : iso;
}

export type RawEventRow = {
  title?: unknown;
  event_date?: unknown;
  created_at?: unknown;
  source?: unknown;
  raw_data?: { url?: unknown; source?: unknown; domain?: unknown; seendate?: unknown } | null;
};

/**
 * Oldest-first timeline; entries with no resolvable date sort last. Kept
 * byte-for-byte equivalent to the inline version this replaced in
 * app/api/signals/[id]/route.ts — `publishedAt` intentionally uses the raw
 * `event_date`/`created_at` values as-is (already timestamptz from the DB),
 * not re-validated through validIso(), to match that prior behavior exactly.
 */
export function buildEventSources(rawEvents: RawEventRow[]): EventSource[] {
  return rawEvents
    .map((re: any) => ({
      title: re.title ?? "Untitled source",
      url: re.raw_data?.url ?? null,
      sourceLabel: re.raw_data?.source ?? null,
      domain: re.raw_data?.domain ?? sourceHostname(re.raw_data?.url) ?? null,
      publishedAt: re.event_date ?? seendateToIso(re.raw_data?.seendate) ?? re.created_at ?? null,
    }))
    .sort((a: EventSource, b: EventSource) => {
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : Infinity;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : Infinity;
      return ta - tb;
    });
}

export type FirstReportInfo = {
  firstReportAt: string | null;
  firstReportKind: FirstReportKind | null;
  firstFetchedAt: string | null;
};

export function computeFirstReportInfo(
  rawRows: RawEventStampRow[],
  fallbackEventDate: unknown,
): FirstReportInfo {
  const earliestReport = earliestRawStamp(rawRows, "event_date");
  return {
    firstReportAt: earliestReport?.at ?? validIso(fallbackEventDate),
    firstReportKind: earliestReport ? kindForRawSource(earliestReport.source) : null,
    firstFetchedAt: earliestRawStamp(rawRows, "created_at")?.at ?? null,
  };
}
