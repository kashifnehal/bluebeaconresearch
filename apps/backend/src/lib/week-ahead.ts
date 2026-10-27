import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CALENDAR_PATH = resolve(__dirname, "../data/economic-calendar.json");

export type CalendarEvent = {
  id: string;
  date: string;
  time: string | null;
  country: string;
  event: string;
  category: string;
  sourceUrl: string;
  sourceLabel: string;
};

type CalendarFile = { events: CalendarEvent[] };

let cachedEvents: CalendarEvent[] | null = null;

function loadCalendarEvents(): CalendarEvent[] {
  if (cachedEvents) return cachedEvents;
  const raw = readFileSync(CALENDAR_PATH, "utf8");
  const parsed = JSON.parse(raw) as CalendarFile;
  cachedEvents = Array.isArray(parsed.events) ? parsed.events : [];
  return cachedEvents;
}

/** Test-only: forces the next call to re-read the calendar file from disk. */
export function __resetWeekAheadCacheForTests(): void {
  cachedEvents = null;
}

// Same category -> asset mapping as apps/web/lib/calendar-filters.ts's
// CATEGORY_ASSET_MAP. Kept in parity by week-ahead.test.ts, which parses that
// file's source text directly rather than importing it (apps/backend must not
// import apps/web at runtime).
export const CATEGORY_ASSET_MAP: Record<string, string[]> = {
  Energy: ["USOIL", "UKOIL"],
  Agriculture: ["WHEAT", "CORN"],
};

export type WeekAheadEvent = {
  date: string;
  time: string | null;
  event: string;
  sourceUrl: string;
  assets: string[] | "all";
};

/**
 * Fixed weekly release rhythm, not sourced from the calendar JSON — these
 * recur every week rather than on dated one-off entries.
 */
export function weeklyRhythmLines(): string[] {
  return [
    "Tue: API oil inventory report",
    "Wed: EIA Weekly Petroleum Status Report",
    "Thu: EIA Weekly Natural Gas Storage Report",
    "Fri: CFTC Commitments of Traders",
    "Fri: Baker Hughes rig count",
  ];
}

/**
 * Dated calendar events from `now` through the next 7 days (UTC, inclusive of
 * `now`'s own calendar day) whose mapped assets overlap `commodities`, plus
 * every unmapped (macro) event — labelled "All markets" rather than hidden.
 * DESIGN CHOICE: including unmapped/macro events unconditionally mirrors
 * apps/web/lib/calendar-filters.ts's eventMatchesSymbols, applied here for the
 * email digest rather than the calendar page UI — a commodity-only filter
 * would make FOMC/CPI/NFP-style releases disappear even though they move
 * every market. DESIGN CHOICE: the window starts at `now`'s own UTC calendar
 * day (not the exact timestamp) so an event scheduled earlier today isn't
 * dropped just because the digest runs later in the day.
 */
export function weekAheadFor(commodities: string[], now: Date): WeekAheadEvent[] {
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = startOfToday + 7 * 24 * 60 * 60 * 1000;
  const events = loadCalendarEvents();

  const matched: WeekAheadEvent[] = [];
  for (const ev of events) {
    const ms = Date.parse(`${ev.date}T00:00:00Z`);
    if (!Number.isFinite(ms) || ms < startOfToday || ms > end) continue;

    const assets = CATEGORY_ASSET_MAP[ev.category];
    if (assets && !assets.some((asset) => commodities.includes(asset))) continue;

    matched.push({
      date: ev.date,
      time: ev.time ?? null,
      event: ev.event,
      sourceUrl: ev.sourceUrl,
      assets: assets ?? "all",
    });
  }

  return matched.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return (a.time ?? "").localeCompare(b.time ?? "");
  });
}
