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
  // TASK NQW3-FILTER1 Part 8 (2026-11-24) — the raw collector name
  // (raw_events.source: "rss" | "gdelt" | "newsapi" | "acled"), carried
  // through only to detect a GDELT-origin row for the required credit line
  // below. Not rendered anywhere on its own. Optional so every existing
  // hand-built EventSource fixture (tests) stays valid without edits.
  collectorSource?: string | null;
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

// raw_data.source isn't a consistent shape across collectors: RSS/GDELT write
// a plain string label, while NewsAPI/GNews write their own source object
// ({ id, url, name, country }). Rendering that object directly as a JSX
// child throws React error #31 (see the Sources/Hero outlet-name renders in
// EventHero.tsx and EventDetailClient.tsx, which both trust this field to
// already be a display string).
export function sourceLabelFrom(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) return name;
  }
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
      sourceLabel: sourceLabelFrom(re.raw_data?.source),
      domain: re.raw_data?.domain ?? sourceHostname(re.raw_data?.url) ?? null,
      publishedAt: re.event_date ?? seendateToIso(re.raw_data?.seendate) ?? re.created_at ?? null,
      collectorSource: typeof re.source === "string" ? re.source : null,
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

// ── TASK NQW3-FILTER1 Part 8 (2026-11-24) — required credit lines ─────────
// Publisher pages read 2026-11-24: the Federal Reserve asks to cite the
// Board; EIA asks for "Source: U.S. Energy Information Administration" with
// a date; the ECB asks to cite the ECB as source and to state changes; the
// Bank of Japan asks for explicit credit; GDELT asks for a citation with a
// link. This maps each RSS feed label this pipeline actually stores
// (rss-collector.ts's RSS_FEEDS, stored verbatim into raw_data.source) onto
// the publisher's own full name — Bank of England is not in the task's
// required-credit list (not asked for by the BoE's own pages) and is
// deliberately absent here.
const OFFICIAL_SOURCE_FULL_NAMES: Record<string, string> = {
  "Federal Reserve": "Board of Governors of the Federal Reserve System",
  "EIA Press Releases": "U.S. Energy Information Administration",
  "EIA Today in Energy": "U.S. Energy Information Administration",
  ECB: "European Central Bank",
  "Bank of Japan": "Bank of Japan",
  "Bank of England": "Bank of England",
};

/** en-US "Mon D, YYYY" in UTC — matches the convention already used elsewhere (e.g. calendar-values.ts). */
export function formatPublishDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * Null unless this source's label is one of the six required-credit
 * publishers. Null `publishedAt` omits the parenthetical date rather than
 * printing an empty one.
 */
export function officialSourceCreditLine(source: Pick<EventSource, "sourceLabel" | "publishedAt">): string | null {
  const label = source.sourceLabel;
  if (!label || !(label in OFFICIAL_SOURCE_FULL_NAMES)) return null;
  const fullName = OFFICIAL_SOURCE_FULL_NAMES[label];
  const date = formatPublishDate(source.publishedAt);
  return date
    ? `Source: ${fullName} (${date}). Summary written by BBR.`
    : `Source: ${fullName}. Summary written by BBR.`;
}

export const GDELT_CREDIT_TEXT = "Event data: The GDELT Project";
export const GDELT_PROJECT_URL = "https://www.gdeltproject.org";

export function isGdeltSource(source: Pick<EventSource, "collectorSource">): boolean {
  return source.collectorSource === "gdelt";
}
