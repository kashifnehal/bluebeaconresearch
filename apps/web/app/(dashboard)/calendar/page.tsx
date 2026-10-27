"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import calendarData from "@/data/economic-calendar.json";
import { SELECT_CLASSES } from "@/lib/utils";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import {
  CATEGORY_ASSET_MAP,
  EMPTY_CALENDAR_FILTERS,
  eventMatchesCalendarFilters,
  eventMatchesSymbols,
  scheduleEndNotice,
  visibleValueColumns,
  type CalendarFilterValue,
  type CalendarImpact,
} from "@/lib/calendar-filters";
import { useMyPreferences } from "@/hooks/useMyPreferences";
import { logUsageEvent } from "@/lib/funnel-events";
import {
  MARKET_IMPACT_CHECKPOINT_HOURS,
  type MarketImpactMagnitude,
  type TimeHorizonLabel,
} from "@/lib/market-impact-assessment";
import type { WindowMoveBaseline } from "@/lib/price-baseline";
import { weeklyRhythm, type WeeklyRhythmEntry } from "@/lib/calendar-rhythm";
import {
  formatOfficialFigures,
  type FormattedOfficialFigure,
  type OfficialFigureRow,
} from "@/lib/calendar-values";

type Impact = CalendarImpact;

type CalendarEvent = {
  id: string;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM UTC, or null if not pre-announced
  timeApprox: boolean;
  timeNote?: string;
  country: string;
  countryCode: string;
  event: string;
  category: string;
  impact: Impact;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  sourceUrl: string;
  sourceLabel: string;
  // Optional, not set on any existing row today — "tentative" shows a small
  // badge next to the event name when a date isn't yet confirmed by its source.
  status?: "confirmed" | "tentative";
  // Visible attribution shown under the event name — only set on EIA rows
  // today (the task's explicit ask), not a general-purpose field for every
  // source.
  creditLine?: string;
};

type TimeZoneMode = "utc" | "local";

type CalendarMarketImpactEntry = {
  magnitude: MarketImpactMagnitude | null;
  timeHorizonLabel: TimeHorizonLabel | null;
  baselines?: WindowMoveBaseline[];
};

const MAGNITUDE_ASSETS = [...new Set(Object.values(CATEGORY_ASSET_MAP).flat())];

function magnitudeLinesForEvent(
  category: string,
  marketImpact: Record<string, CalendarMarketImpactEntry> | null,
): string[] {
  const assets = CATEGORY_ASSET_MAP[category];
  if (!assets || !marketImpact) return [];
  const lines: string[] = [];
  for (const asset of assets) {
    const entry = marketImpact[asset];
    if (entry?.magnitude) {
      lines.push(
        `Across ${entry.magnitude.sampleSize} tracked BBR signals that listed ${asset}, the price ${MARKET_IMPACT_CHECKPOINT_HOURS} hours after the event time differed from the price at the event time by a median of ~${entry.magnitude.medianMovePct.toFixed(2)}% (up or down).`,
      );
      const baseline = entry.baselines?.find(
        (b) => b.windowHours === MARKET_IMPACT_CHECKPOINT_HOURS,
      );
      if (baseline) {
        lines.push(
          `For comparison, across ${baseline.windowCount} ${asset} price windows from the last ${baseline.spanDays} days (all windows, including ones that had tracked signals; start hours weighted like the tracked signals), the price ${MARKET_IMPACT_CHECKPOINT_HOURS} hours later differed by a median of ~${baseline.medianMovePct.toFixed(2)}% (up or down).`,
        );
      }
    }
  }
  return lines;
}

function MagnitudeLines({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <>
      {lines.map((line) => (
        <p
          key={line}
          data-testid="calendar-magnitude-line"
          className="text-[12px] md:text-[11px] leading-relaxed text-on-surface/60 italic"
        >
          {line}
        </p>
      ))}
    </>
  );
}

const OPTIONS_IV_NOTE =
  "Implied volatility on options usually falls after a scheduled release (Ederington and Lee, 1996, Journal of Financial and Quantitative Analysis; Fernandez-Perez and Lopez, 2023, Journal of Futures Markets, for crude oil, gold and silver).";

export function ScheduleEndNotice({ events, today }: { events: CalendarEvent[]; today: Date }) {
  const notice = scheduleEndNotice(events, today);
  if (!notice) return null;
  return (
    <p data-testid="calendar-schedule-end-notice" className="text-on-surface/50 mt-1 text-sm">
      {notice}
    </p>
  );
}

export function OptionsIvNote() {
  return (
    <p
      data-testid="calendar-iv-note"
      className="mt-4 pt-4 border-t border-outline-variant/10 text-[12px] md:text-[11px] leading-relaxed text-on-surface/50"
    >
      {OPTIONS_IV_NOTE}
    </p>
  );
}

const EVENTS = (calendarData.events as CalendarEvent[]).slice().sort((a, b) => {
  const ak = `${a.date}T${a.time ?? "00:00"}`;
  const bk = `${b.date}T${b.time ?? "00:00"}`;
  return ak < bk ? -1 : ak > bk ? 1 : 0;
});

const COUNTRIES = Array.from(new Set(EVENTS.map((e) => e.country))).sort();
const CATEGORIES = Array.from(new Set(EVENTS.map((e) => e.category))).sort();

// impact rating hidden: no documented method
// (_meta in economic-calendar.json has no written method for how `impact` is
// assigned, so the bars/filter that would present it as a rated fact are
// hidden. The field stays on CalendarEvent/the JSON for when one exists.)
const VISIBLE_VALUE_COLUMNS = visibleValueColumns(EVENTS);

const WEEKLY_RHYTHM = weeklyRhythm();

const sourcedAtFormatted = new Date(`${calendarData._meta.sourcedAt}T00:00:00Z`).toLocaleDateString("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Event date+time as a real UTC Date, for sorting/countdown/week-filtering. Events with no
 * announced time (e.g. the OPEC report) sort/compare as start-of-day UTC. */
function eventDateTime(e: CalendarEvent): Date {
  return new Date(`${e.date}T${e.time ?? "00:00"}:00Z`);
}

function formatEventTime(e: CalendarEvent, timeZone: TimeZoneMode): string {
  if (!e.time) return "—";
  const approx = e.timeApprox ? " (approx.)" : "";
  if (timeZone === "utc") return `${e.time} UTC${approx}`;
  const local = eventDateTime(e).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${local} local${approx}`;
}

function formatEventDate(e: CalendarEvent, timeZone: TimeZoneMode): string {
  if (timeZone === "utc" || !e.time) {
    const d = new Date(`${e.date}T00:00:00Z`);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }
  return eventDateTime(e).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function icsDateTimeUTC(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** One-time .ics export of whatever events are passed in — not a live sync, since
 * there's no feed to keep it updated against. Caller is responsible for passing
 * only the currently filtered/visible set. */
function eventsToIcs(events: CalendarEvent[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Blue Beacon Research//Economic Calendar//EN",
    "CALSCALE:GREGORIAN",
  ];
  const dtstamp = icsDateTimeUTC(new Date());
  for (const e of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.id}@bluebeaconresearch.com`);
    lines.push(`DTSTAMP:${dtstamp}`);
    if (e.time) {
      lines.push(`DTSTART:${icsDateTimeUTC(eventDateTime(e))}`);
      lines.push("DURATION:PT30M");
    } else {
      const start = new Date(`${e.date}T00:00:00Z`);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      lines.push(`DTSTART;VALUE=DATE:${icsDateOnly(start)}`);
      lines.push(`DTEND;VALUE=DATE:${icsDateOnly(end)}`);
    }
    lines.push(`SUMMARY:${icsEscape(`${e.event} (${e.country})`)}`);
    const descriptionParts = [
      e.forecast != null ? `Forecast: ${e.forecast}` : null,
      e.previous != null ? `Previous: ${e.previous}` : null,
      e.actual != null ? `Actual: ${e.actual}` : null,
      `Source: ${e.sourceLabel}`,
    ].filter((p): p is string => p != null);
    lines.push(`DESCRIPTION:${icsEscape(descriptionParts.join("\n"))}`);
    if (e.sourceUrl) lines.push(`URL:${e.sourceUrl}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function downloadEventsAsIcs(events: CalendarEvent[]) {
  const blob = new Blob([eventsToIcs(events)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "blue-beacon-economic-calendar.ics";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Monday 00:00 UTC through the following Monday 00:00 UTC containing `now`. */
function getWeekRangeUTC(now: Date): { start: Date; end: Date } {
  const day = now.getUTCDay(); // 0 = Sunday
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + mondayOffset));
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Local time + zone abbreviation for the Next chip, or the date alone when
 * the event has no announced time (e.g. the OPEC report). */
function nextEventChipTimeText(e: CalendarEvent): string {
  if (!e.time) {
    const d = new Date(`${e.date}T00:00:00Z`);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }
  const formatted = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(eventDateTime(e));
  return e.timeApprox ? `${formatted} (approx.)` : formatted;
}

export function NextEventChip({ event }: { event: CalendarEvent | null }) {
  if (!event) {
    return (
      <p data-testid="calendar-next-chip" className="text-sm text-on-surface/50 italic">
        No upcoming events in this calendar's window.
      </p>
    );
  }
  return (
    <div
      data-testid="calendar-next-chip"
      className="inline-flex items-center gap-2 px-3 py-2 text-[12px] md:text-[11px] bg-surface-container rounded-md border border-primary/30"
    >
      <span className="label text-outline font-bold uppercase tracking-widest text-[10px]">Next:</span>
      <span className="font-bold text-on-surface">
        {event.event}, {nextEventChipTimeText(event)}
      </span>
    </div>
  );
}

function CategoryTag({ category }: { category: string }) {
  return (
    <span
      data-testid="calendar-category-tag"
      className="inline-flex items-center px-2 py-0.5 text-[12px] md:text-[9px] label font-bold uppercase tracking-widest rounded-sm border border-outline-variant/30 text-on-surface/60"
    >
      {category}
    </span>
  );
}

function TentativeTag() {
  return (
    <span
      data-testid="calendar-tentative-tag"
      className="inline-flex items-center px-1.5 py-0.5 text-[10px] md:text-[9px] label font-bold uppercase tracking-widest rounded-sm border border-[#ffb340]/50 text-[#ffb340]"
    >
      Tentative
    </span>
  );
}

function AllMarketsTag() {
  return (
    <span
      data-testid="calendar-all-markets-tag"
      className="inline-flex items-center px-1.5 py-0.5 text-[10px] md:text-[9px] label font-bold uppercase tracking-widest rounded-sm border border-outline-variant/20 text-on-surface/40"
    >
      All markets
    </span>
  );
}

export function MyCommoditiesToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      data-testid="calendar-my-commodities-toggle"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className="px-3 py-1.5 text-[12px] md:text-[11px] font-bold tracking-widest border transition-colors cursor-pointer inline-flex items-center min-h-[44px] md:min-h-0"
      style={{
        fontFamily: "'Space Grotesk', sans-serif",
        backgroundColor: checked ? "var(--accent)" : "var(--bg-container)",
        color: checked ? "#005f40" : "var(--text-secondary)",
        borderColor: checked ? "var(--accent)" : "var(--border)",
      }}
    >
      My commodities
    </button>
  );
}

export function EventTable({
  events,
  timeZone,
  marketImpact,
  visibleColumns = VISIBLE_VALUE_COLUMNS,
  highlightAllMarkets = false,
}: {
  events: CalendarEvent[];
  timeZone: TimeZoneMode;
  marketImpact: Record<string, CalendarMarketImpactEntry> | null;
  visibleColumns?: { forecast: boolean; previous: boolean; actual: boolean };
  // Only meaningful while the "My commodities" filter is on — see
  // eventMatchesSymbols/CATEGORY_ASSET_MAP: an unmapped-category event always
  // stays visible under that filter, labelled "All markets" so it's clear why.
  highlightAllMarkets?: boolean;
}) {
  if (events.length === 0) {
    return <p className="text-xs text-on-surface/50 px-2 py-6 italic text-center">No events in this range.</p>;
  }
  const timeHeader = timeZone === "utc" ? "Time (UTC)" : "Time (local)";
  const headers = [
    "Date",
    timeHeader,
    "Country",
    "Event",
    "Category",
    ...(visibleColumns.forecast ? ["Forecast"] : []),
    ...(visibleColumns.previous ? ["Previous"] : []),
    ...(visibleColumns.actual ? ["Actual"] : []),
  ];
  return (
    <>
      {/* Mobile: stacked cards — a table's column order can't put "Event" (the thing that matters)
          ahead of Country without pushing Date/Time off, so mobile gets its own layout: event name
          as the heading, everything else as supporting rows. Desktop keeps the unchanged table below. */}
      <div className="md:hidden divide-y divide-outline-variant/10">
        {events.map((e) => {
          const magnitudeLines = magnitudeLinesForEvent(e.category, marketImpact);
          return (
          <div key={e.id} data-testid="calendar-event-card" className="py-3 px-1">
            <a
              href={e.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => logUsageEvent("calendar_source_clicked", { id: e.id }, "entity")}
              className="hover:text-primary transition-colors inline-flex items-start gap-1.5 text-sm font-bold text-on-surface"
              title={`Source: ${e.sourceLabel}`}
            >
              {e.event}
              <span className="material-symbols-outlined text-[13px] text-on-surface/30 mt-0.5 shrink-0">open_in_new</span>
            </a>
            {e.status === "tentative" && <TentativeTag />}
            {e.creditLine && (
              <p data-testid="calendar-credit-line" className="text-[11px] text-on-surface/40 mt-0.5">
                {e.creditLine}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-[12px] text-on-surface/70">{e.country}</span>
              <CategoryTag category={e.category} />
              {highlightAllMarkets && !CATEGORY_ASSET_MAP[e.category] && <AllMarketsTag />}
              <span className="mono text-[12px] text-on-surface/70">{formatEventDate(e, timeZone)}</span>
              <span className="mono text-[12px] text-on-surface/70" title={e.timeNote}>{formatEventTime(e, timeZone)}</span>
            </div>
            {(visibleColumns.forecast || visibleColumns.previous || visibleColumns.actual) && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {visibleColumns.forecast && (
                  <div>
                    <div className="label text-[9px] tracking-widest text-outline font-bold uppercase">Forecast</div>
                    <div className="mono text-[12px] text-on-surface/40">{e.forecast ?? "—"}</div>
                  </div>
                )}
                {visibleColumns.previous && (
                  <div>
                    <div className="label text-[9px] tracking-widest text-outline font-bold uppercase">Previous</div>
                    <div className="mono text-[12px] text-on-surface/40">{e.previous ?? "—"}</div>
                  </div>
                )}
                {visibleColumns.actual && (
                  <div>
                    <div className="label text-[9px] tracking-widest text-outline font-bold uppercase">Actual</div>
                    <div className="mono text-[12px] text-on-surface/40">{e.actual ?? "—"}</div>
                  </div>
                )}
              </div>
            )}
            {magnitudeLines.length > 0 && (
              <div className="mt-2 space-y-1">
                <MagnitudeLines lines={magnitudeLines} />
              </div>
            )}
          </div>
          );
        })}
      </div>

      {/* Desktop: unchanged table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-outline-variant/20">
              {headers.map((h) => (
                <th
                  key={h}
                  className="label text-[12px] md:text-[9px] tracking-widest text-outline font-bold uppercase py-2.5 px-3 whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {events.map((e) => {
              const magnitudeLines = magnitudeLinesForEvent(e.category, marketImpact);
              return (
              <Fragment key={e.id}>
                <tr
                  data-testid="calendar-event-row"
                  className="hover:bg-surface-bright/10 transition-colors"
                >
                  <td className="py-3 px-3 mono text-[12px] md:text-[11px] text-on-surface/70 whitespace-nowrap">
                    {formatEventDate(e, timeZone)}
                  </td>
                  <td className="py-3 px-3 mono text-[12px] md:text-[11px] text-on-surface/70 whitespace-nowrap" title={e.timeNote}>
                    {formatEventTime(e, timeZone)}
                  </td>
                  <td className="py-3 px-3 text-[12px] md:text-[11px] text-on-surface/70 whitespace-nowrap">{e.country}</td>
                  <td className="py-3 px-3 text-sm font-bold text-on-surface">
                    <a
                      href={e.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => logUsageEvent("calendar_source_clicked", { id: e.id }, "entity")}
                      className="hover:text-primary transition-colors inline-flex items-center gap-1.5"
                      title={`Source: ${e.sourceLabel}`}
                    >
                      {e.event}
                      <span className="material-symbols-outlined text-[13px] text-on-surface/30">open_in_new</span>
                    </a>
                    {e.status === "tentative" && <TentativeTag />}
                    {e.creditLine && (
                      <p data-testid="calendar-credit-line" className="text-[11px] font-normal text-on-surface/40 mt-0.5">
                        {e.creditLine}
                      </p>
                    )}
                  </td>
                  <td className="py-3 px-3 flex items-center gap-1.5">
                    <CategoryTag category={e.category} />
                    {highlightAllMarkets && !CATEGORY_ASSET_MAP[e.category] && <AllMarketsTag />}
                  </td>
                  {visibleColumns.forecast && (
                    <td className="py-3 px-3 mono text-[12px] md:text-[11px] text-on-surface/40">{e.forecast ?? "—"}</td>
                  )}
                  {visibleColumns.previous && (
                    <td className="py-3 px-3 mono text-[12px] md:text-[11px] text-on-surface/40">{e.previous ?? "—"}</td>
                  )}
                  {visibleColumns.actual && (
                    <td className="py-3 px-3 mono text-[12px] md:text-[11px] text-on-surface/40">{e.actual ?? "—"}</td>
                  )}
                </tr>
                {magnitudeLines.length > 0 && (
                  <tr className="bg-surface-bright/5">
                    <td colSpan={headers.length} className="px-3 pb-3 -mt-1 space-y-1">
                      <MagnitudeLines lines={magnitudeLines} />
                    </td>
                  </tr>
                )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CalendarFilters({
  filters,
  onChange,
  timeZone,
  onTimeZoneChange,
  onlyMine,
  onOnlyMineChange,
}: {
  filters: CalendarFilterValue;
  onChange: (next: CalendarFilterValue) => void;
  timeZone: TimeZoneMode;
  onTimeZoneChange: (next: TimeZoneMode) => void;
  onlyMine: boolean;
  onOnlyMineChange: (next: boolean) => void;
}) {
  const fieldClass = "flex items-center gap-2";
  const labelClass = "text-[12px] md:text-[10px] uppercase tracking-wider shrink-0";
  const labelStyle = { color: "var(--text-muted)", fontFamily: "'Space Grotesk', sans-serif" } as const;
  const patch = (partial: Partial<CalendarFilterValue>) => onChange({ ...filters, ...partial });

  return (
    <div
      data-testid="calendar-filter-bar"
      className="flex flex-wrap gap-3 items-center mb-8"
    >
      <div className={fieldClass}>
        <label htmlFor="calendar-filter-country" className={labelClass} style={labelStyle}>
          Country
        </label>
        <select
          id="calendar-filter-country"
          data-testid="calendar-filter-country"
          value={filters.country}
          onChange={(e) => patch({ country: e.target.value })}
          className={SELECT_CLASSES}
        >
          <option value="">All</option>
          {COUNTRIES.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </select>
      </div>

      <div className={fieldClass}>
        <label htmlFor="calendar-filter-category" className={labelClass} style={labelStyle}>
          Category
        </label>
        <select
          id="calendar-filter-category"
          data-testid="calendar-filter-category"
          value={filters.category}
          onChange={(e) => patch({ category: e.target.value })}
          className={SELECT_CLASSES}
        >
          <option value="">All</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      <div className={fieldClass}>
        <span className={labelClass} style={labelStyle}>
          Timezone
        </span>
        <div className="flex gap-1" role="group" aria-label="Timezone">
          {([
            { id: "utc" as const, label: "UTC" },
            { id: "local" as const, label: "Local" },
          ]).map((opt) => {
            const selected = timeZone === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                data-testid={`calendar-timezone-${opt.id}`}
                aria-pressed={selected}
                onClick={() => onTimeZoneChange(opt.id)}
                className="px-3 py-1.5 text-[12px] md:text-[11px] font-bold tracking-widest border transition-colors cursor-pointer inline-flex items-center min-h-[44px] md:min-h-0"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  backgroundColor: selected ? "var(--accent)" : "var(--bg-container)",
                  color: selected ? "#005f40" : "var(--text-secondary)",
                  borderColor: selected ? "var(--accent)" : "var(--border)",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <MyCommoditiesToggle checked={onlyMine} onChange={onOnlyMineChange} />
    </div>
  );
}

export function OfficialFiguresPanel({ figures }: { figures: FormattedOfficialFigure[] }) {
  if (figures.length === 0) return null;
  return (
    <section
      data-testid="calendar-official-figures"
      className="bg-surface-container rounded-lg overflow-hidden border border-outline-variant/10 shadow-xl mb-6"
    >
      <div className="p-4 border-b border-outline-variant/10 bg-surface-container-high/30">
        <span className="label text-[12px] md:text-[10px] tracking-widest text-outline font-bold uppercase">
          Latest official figures
        </span>
      </div>
      <div className="p-4 grid gap-6 md:grid-cols-2">
        {figures.map((f) => (
          <div key={f.seriesId} data-testid="calendar-official-figure">
            <div className="text-sm font-bold text-on-surface">{f.label}</div>
            <div className="text-[12px] text-on-surface/50 mt-0.5">{f.period}</div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="mono text-2xl font-bold text-on-surface">{f.latestValueText}</span>
              {f.previousValueText != null && (
                <span className="mono text-[12px] text-on-surface/50">
                  prev {f.previousValueText}
                  {f.changeText != null ? ` (${f.changeText})` : ""}
                </span>
              )}
            </div>
            <a
              href={f.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-2 text-[11px] text-on-surface/40 hover:text-primary transition-colors"
            >
              Source: U.S. Energy Information Administration ({f.fetchedMonthYear})
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

export function WeeklyRhythmRow({ rhythm }: { rhythm: WeeklyRhythmEntry[] }) {
  return (
    <div data-testid="calendar-weekly-rhythm" className="flex flex-wrap items-center gap-2 mb-4">
      <span className="text-[12px] md:text-[10px] uppercase tracking-wider text-on-surface/40 shrink-0">
        Every week
      </span>
      {rhythm.map((entry) => (
        <span
          key={`${entry.day}-${entry.event}`}
          data-testid="calendar-weekly-rhythm-entry"
          className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] text-on-surface/60 border border-outline-variant/20 rounded-sm"
        >
          <span className="font-bold text-on-surface/80">{entry.day}</span>
          {entry.sourceUrl ? (
            <a
              href={entry.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
            >
              {entry.event}
            </a>
          ) : (
            entry.event
          )}
        </span>
      ))}
    </div>
  );
}

function DayStrip({
  days,
  selectedDay,
  onSelectDay,
}: {
  days: { date: string; weekday: string; dayNum: string; count: number }[];
  selectedDay: string | null;
  onSelectDay: (date: string | null) => void;
}) {
  return (
    <div data-testid="calendar-day-strip" className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
      {days.map((d) => {
        const selected = d.date === selectedDay;
        return (
          <button
            key={d.date}
            type="button"
            data-testid="calendar-day-strip-button"
            data-date={d.date}
            aria-pressed={selected}
            onClick={() => onSelectDay(selected ? null : d.date)}
            className="flex flex-col items-center justify-center gap-0.5 px-3 py-2 min-w-[56px] shrink-0 border rounded-md transition-colors cursor-pointer min-h-[44px]"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              backgroundColor: selected ? "var(--accent)" : "var(--bg-container)",
              color: selected ? "#005f40" : "var(--text-secondary)",
              borderColor: selected ? "var(--accent)" : "var(--border)",
            }}
          >
            <span className="text-[10px] font-bold uppercase tracking-widest">{d.weekday}</span>
            <span className="text-sm font-bold">{d.dayNum}</span>
            <span className="text-[9px] opacity-70">{d.count > 0 ? d.count : "—"}</span>
          </button>
        );
      })}
      {selectedDay && (
        <button
          type="button"
          data-testid="calendar-day-strip-show-all"
          onClick={() => onSelectDay(null)}
          className="ml-1 px-3 py-2 text-[12px] font-bold uppercase tracking-widest border rounded-md shrink-0 min-h-[44px] cursor-pointer transition-colors"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            backgroundColor: "var(--bg-container)",
            color: "var(--text-secondary)",
            borderColor: "var(--border)",
          }}
        >
          Show all
        </button>
      )}
    </div>
  );
}

export default function CalendarPage() {
  const [mounted, setMounted] = useState(false);
  const [filters, setFilters] = useState<CalendarFilterValue>(EMPTY_CALENDAR_FILTERS);
  const [timeZone, setTimeZone] = useState<TimeZoneMode>("utc");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [marketImpact, setMarketImpact] = useState<Record<string, CalendarMarketImpactEntry> | null>(null);
  const [officialFigureRows, setOfficialFigureRows] = useState<OfficialFigureRow[]>([]);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    logUsageEvent("calendar_viewed");
  }, []);

  const { data: myPreferences } = useMyPreferences();
  const mySymbols = useMemo(
    () => Array.from(new Set([...(myPreferences?.commodities ?? []), ...(myPreferences?.watchlistSymbols ?? [])])),
    [myPreferences],
  );
  const [onlyMine, setOnlyMine] = useState(false);
  const onlyMineDefaulted = useRef(false);
  useEffect(() => {
    // Default on only the first time mySymbols resolves non-empty — once the
    // viewer has touched the toggle themselves, this effect leaves it alone.
    if (!onlyMineDefaulted.current && mySymbols.length > 0) {
      setOnlyMine(true);
      onlyMineDefaulted.current = true;
    }
  }, [mySymbols]);
  function handleOnlyMineChange(next: boolean) {
    setOnlyMine(next);
    onlyMineDefaulted.current = true;
    logUsageEvent("calendar_my_commodities_toggled", { on: next }, false);
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/market-impact?assets=${MAGNITUDE_ASSETS.join(",")}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.magnitudes) setMarketImpact(data.magnitudes);
      })
      .catch(() => {
        // No magnitude line is a reasonable degrade — the rest of the calendar
        // (dates, filters, export) works fine without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/calendar/values")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.values)) setOfficialFigureRows(data.values);
      })
      .catch(() => {
        // No panel is a reasonable degrade — the table may not exist yet.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const officialFigures = useMemo(() => formatOfficialFigures(officialFigureRows), [officialFigureRows]);
  useEffect(() => {
    if (officialFigures.length > 0) logUsageEvent("calendar_values_shown");
  }, [officialFigures.length]);

  // `now` used for the this-week split; recomputed on mount only (not every
  // second — only the countdown itself needs second-level ticking).
  const now = mounted ? new Date() : null;

  const { thisWeek, upcoming, nextEvent, weekDays, selectedDayEvents } = useMemo(() => {
    if (!now) {
      return {
        thisWeek: [] as CalendarEvent[],
        upcoming: [] as CalendarEvent[],
        nextEvent: null as CalendarEvent | null,
        weekDays: [] as { date: string; weekday: string; dayNum: string; count: number }[],
        selectedDayEvents: [] as CalendarEvent[],
      };
    }
    const { start, end } = getWeekRangeUTC(now);
    const thisWeek: CalendarEvent[] = [];
    const upcoming: CalendarEvent[] = [];
    const filteredEvents: CalendarEvent[] = [];
    for (const e of EVENTS) {
      if (!eventMatchesCalendarFilters(e, filters)) continue;
      if (onlyMine && !eventMatchesSymbols(e, mySymbols)) continue;
      filteredEvents.push(e);
      const dt = eventDateTime(e);
      if (dt >= start && dt < end) thisWeek.push(e);
      else if (dt >= end) upcoming.push(e);
    }
    const nextEvent = EVENTS.find((e) => eventDateTime(e).getTime() > now.getTime()) ?? null;

    // Same Mon-Sun span as getWeekRangeUTC, so the day strip can never
    // disagree with what "This Week" considers the current week.
    const weekDays: { date: string; weekday: string; dayNum: string; count: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const date = d.toISOString().slice(0, 10);
      const weekday = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
      const dayNum = String(d.getUTCDate());
      const count = filteredEvents.filter((e) => e.date === date).length;
      weekDays.push({ date, weekday, dayNum, count });
    }

    const selectedDayEvents = selectedDay ? filteredEvents.filter((e) => e.date === selectedDay) : [];

    return { thisWeek, upcoming, nextEvent, weekDays, selectedDayEvents };
  }, [now, filters, selectedDay, onlyMine, mySymbols]);

  // Whatever the page is currently showing below — the day-strip drill-down when
  // active, otherwise This Week + Upcoming — so the export always matches what's
  // on screen, not the full unfiltered dataset.
  const exportableEvents = selectedDay ? selectedDayEvents : [...thisWeek, ...upcoming];

  return (
    <div className="mt-16 p-4 md:p-8 min-h-screen bg-surface-container-lowest text-on-surface">
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Week Ahead" }]}
        className="mb-4"
      />
      <section className="flex justify-between items-end mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tighter font-headline text-white">Week Ahead</h1>
          <p className="text-on-surface/60 mt-2 font-body font-medium">
            The scheduled releases that move the commodities Blue Beacon tracks: central bank decisions, official
            energy and farm reports, and policy meetings.
          </p>
          {now && <ScheduleEndNotice events={EVENTS} today={now} />}
        </div>
        <button
          type="button"
          data-testid="calendar-export-ics"
          disabled={exportableEvents.length === 0}
          onClick={() => downloadEventsAsIcs(exportableEvents)}
          title="Downloads the events currently shown below as a one-time .ics file — it won't stay in sync with future updates."
          className="shrink-0 px-4 py-2.5 text-[12px] md:text-[11px] font-bold uppercase tracking-widest border rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px] inline-flex items-center gap-2"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            backgroundColor: "var(--bg-container)",
            color: "var(--accent)",
            borderColor: "var(--border)",
          }}
        >
          <span className="material-symbols-outlined text-[16px]">download</span>
          Export to Calendar ({exportableEvents.length})
        </button>
      </section>

      <CalendarFilters
        filters={filters}
        onChange={setFilters}
        timeZone={timeZone}
        onTimeZoneChange={setTimeZone}
        onlyMine={onlyMine}
        onOnlyMineChange={handleOnlyMineChange}
      />

      {mounted && (
        <section className="mb-8">
          <NextEventChip event={nextEvent} />
          {nextEvent && <OptionsIvNote />}
        </section>
      )}

      <WeeklyRhythmRow rhythm={WEEKLY_RHYTHM} />

      <OfficialFiguresPanel figures={officialFigures} />

      {mounted && (
        <DayStrip days={weekDays} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
      )}

      {selectedDay ? (
        <section
          data-testid="calendar-selected-day"
          data-event-count={selectedDayEvents.length}
          className="bg-surface-container rounded-lg overflow-hidden border border-outline-variant/10 shadow-xl mb-6"
        >
          <div className="p-4 border-b border-outline-variant/10 bg-surface-container-high/30 flex items-center justify-between gap-3">
            <span className="label text-[12px] md:text-[10px] tracking-widest text-outline font-bold uppercase">
              {new Date(`${selectedDay}T00:00:00Z`).toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              })}{" "}
              ({selectedDayEvents.length})
            </span>
            <button
              type="button"
              data-testid="calendar-selected-day-show-all"
              onClick={() => setSelectedDay(null)}
              className="text-[11px] font-bold uppercase tracking-widest text-primary hover:underline cursor-pointer shrink-0"
            >
              Show all
            </button>
          </div>
          <div className="p-2">
            <EventTable events={selectedDayEvents} timeZone={timeZone} marketImpact={marketImpact} highlightAllMarkets={onlyMine} />
          </div>
        </section>
      ) : (
        <>
          {/* This week */}
          <section
            data-testid="calendar-this-week"
            data-event-count={thisWeek.length}
            className="bg-surface-container rounded-lg overflow-hidden border border-outline-variant/10 shadow-xl mb-6"
          >
            <div className="p-4 border-b border-outline-variant/10 bg-surface-container-high/30">
              <span className="label text-[12px] md:text-[10px] tracking-widest text-outline font-bold uppercase">This Week</span>
            </div>
            <div className="p-2">
              <EventTable events={thisWeek} timeZone={timeZone} marketImpact={marketImpact} highlightAllMarkets={onlyMine} />
            </div>
          </section>

          {/* Upcoming (rest of the calendar's window) */}
          <section
            data-testid="calendar-upcoming"
            data-event-count={upcoming.length}
            className="bg-surface-container rounded-lg overflow-hidden border border-outline-variant/10 shadow-xl mb-6"
          >
            <div className="p-4 border-b border-outline-variant/10 bg-surface-container-high/30">
              <span className="label text-[12px] md:text-[10px] tracking-widest text-outline font-bold uppercase">
                Upcoming ({upcoming.length})
              </span>
            </div>
            <div className="p-2">
              <EventTable events={upcoming} timeZone={timeZone} marketImpact={marketImpact} highlightAllMarkets={onlyMine} />
            </div>
          </section>
        </>
      )}

      <p className="text-[12px] md:text-[10px] text-on-surface/35 leading-relaxed max-w-3xl">
        Dates come from each institution's own published schedule, linked on each row, last checked on{" "}
        {sourcedAtFormatted}. Official figures are shown only where an official source supplies them. Blue Beacon
        never fills in placeholder numbers.
      </p>
    </div>
  );
}
