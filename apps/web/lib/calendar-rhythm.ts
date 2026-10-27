import calendarData from "@/data/economic-calendar.json";

export type WeeklyRhythmDay = "Tuesday" | "Wednesday" | "Thursday" | "Friday";

export type WeeklyRhythmEntry = {
  day: WeeklyRhythmDay;
  event: string;
  commodities: string[];
  sourceUrl: string | null;
};

const EXISTING_SOURCE_URLS = new Set<string>(
  (calendarData.events as { sourceUrl: string }[]).map((e) => e.sourceUrl),
);

// Only point to a URL this calendar already cites elsewhere — a new URL
// invented just for this row would be an unverified source. Rows below that
// instead hardcode a sourceUrl do so because that exact URL was opened and
// confirmed to load directly in the task that added it (see the comment on
// that row) — not invented.
function knownSourceUrl(url: string): string | null {
  return EXISTING_SOURCE_URLS.has(url) ? url : null;
}

/**
 * Recurring weekly releases that aren't individually dated rows in
 * economic-calendar.json — a standing "every week" reminder, separate
 * from the specific dated EIA/USDA rows already in the calendar.
 */
export function weeklyRhythm(): WeeklyRhythmEntry[] {
  return [
    {
      day: "Tuesday",
      event: "API weekly oil inventory report",
      commodities: ["USOIL", "UKOIL"],
      sourceUrl: null,
    },
    {
      day: "Wednesday",
      event: "EIA Weekly Petroleum Status Report",
      commodities: ["USOIL", "UKOIL"],
      sourceUrl: knownSourceUrl("https://www.eia.gov/petroleum/supply/weekly/schedule.php"),
    },
    {
      day: "Thursday",
      event: "EIA Weekly Natural Gas Storage Report",
      commodities: ["NGAS"],
      // https://www.eia.gov/dnav/ng/ng_stor_wkly_s1_w.htm confirmed to load on 2026-10-27.
      sourceUrl: "https://www.eia.gov/dnav/ng/ng_stor_wkly_s1_w.htm",
    },
    {
      day: "Friday",
      event: "CFTC Commitments of Traders",
      commodities: ["USOIL", "UKOIL", "NGAS", "WHEAT", "CORN", "COPPER", "XAUUSD", "XAGUSD"],
      // https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm confirmed to load on 2026-10-27.
      sourceUrl: "https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm",
    },
    {
      day: "Friday",
      event: "Baker Hughes rig count",
      commodities: ["USOIL", "UKOIL"],
      sourceUrl: null,
    },
  ];
}
