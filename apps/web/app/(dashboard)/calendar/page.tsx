"use client";

import { useEffect, useMemo, useState } from "react";
import calendarData from "@/data/economic-calendar.json";
import { SELECT_CLASSES } from "@/lib/utils";
import {
  EMPTY_CALENDAR_FILTERS,
  eventMatchesCalendarFilters,
  type CalendarFilterValue,
  type CalendarImpact,
} from "@/lib/calendar-filters";

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
};

type TimeZoneMode = "utc" | "local";

const EVENTS = (calendarData.events as CalendarEvent[]).slice().sort((a, b) => {
  const ak = `${a.date}T${a.time ?? "00:00"}`;
  const bk = `${b.date}T${b.time ?? "00:00"}`;
  return ak < bk ? -1 : ak > bk ? 1 : 0;
});

const COUNTRIES = Array.from(new Set(EVENTS.map((e) => e.country))).sort();
const CATEGORIES = Array.from(new Set(EVENTS.map((e) => e.category))).sort();
const IMPACT_LEVELS: Impact[] = ["high", "medium", "low"];

const IMPACT_META: Record<Impact, { emoji: string; label: string; className: string }> = {
  high: { emoji: "🔴", label: "High", className: "bg-error-container/20 border-error/50 text-error" },
  medium: { emoji: "🟡", label: "Medium", className: "bg-[#ffb340]/10 border-[#ffb340]/50 text-[#ffb340]" },
  low: { emoji: "🟢", label: "Low", className: "bg-primary/10 border-primary/50 text-primary" },
};

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

/** Monday 00:00 UTC through the following Monday 00:00 UTC containing `now`. */
function getWeekRangeUTC(now: Date): { start: Date; end: Date } {
  const day = now.getUTCDay(); // 0 = Sunday
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + mondayOffset));
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

function Countdown({ target }: { target: Date }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) {
    // Avoids an SSR/client hydration mismatch — the countdown is inherently
    // client-clock-dependent, so it renders only after mount.
    return <span className="mono text-2xl font-bold text-on-surface/40">—:—:—:—</span>;
  }

  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) {
    return <span className="mono text-lg font-bold text-primary">Happening now / just passed</span>;
  }
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return (
    <span className="mono text-2xl font-bold text-primary tabular-nums">
      {days}d {String(hours).padStart(2, "0")}h {String(minutes).padStart(2, "0")}m{" "}
      {String(seconds).padStart(2, "0")}s
    </span>
  );
}

function ImpactBadge({ impact }: { impact: Impact }) {
  const meta = IMPACT_META[impact];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[12px] md:text-[9px] label font-bold uppercase tracking-widest rounded-sm border ${meta.className}`}
      aria-label={`${meta.label} impact`}
    >
      <span aria-hidden="true">{meta.emoji}</span>
      {meta.label}
    </span>
  );
}

function EventTable({
  events,
  timeZone,
}: {
  events: CalendarEvent[];
  timeZone: TimeZoneMode;
}) {
  if (events.length === 0) {
    return <p className="text-xs text-on-surface/50 px-2 py-6 italic text-center">No events in this range.</p>;
  }
  const timeHeader = timeZone === "utc" ? "Time (UTC)" : "Time (local)";
  return (
    <>
      {/* Mobile: stacked cards — a table's column order can't put "Event" (the thing that matters)
          ahead of Country without pushing Date/Time off, so mobile gets its own layout: event name
          as the heading, everything else as supporting rows. Desktop keeps the unchanged table below. */}
      <div className="md:hidden divide-y divide-outline-variant/10">
        {events.map((e) => (
          <div key={e.id} data-testid="calendar-event-card" className="py-3 px-1">
            <a
              href={e.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors inline-flex items-start gap-1.5 text-sm font-bold text-on-surface"
              title={`Source: ${e.sourceLabel}`}
            >
              {e.event}
              <span className="material-symbols-outlined text-[13px] text-on-surface/30 mt-0.5 shrink-0">open_in_new</span>
            </a>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-[12px] text-on-surface/70">{e.country}</span>
              <ImpactBadge impact={e.impact} />
              <span className="mono text-[12px] text-on-surface/70">{formatEventDate(e, timeZone)}</span>
              <span className="mono text-[12px] text-on-surface/70" title={e.timeNote}>{formatEventTime(e, timeZone)}</span>
            </div>
            {(e.forecast != null || e.previous != null || e.actual != null) && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <div className="label text-[9px] tracking-widest text-outline font-bold uppercase">Forecast</div>
                  <div className="mono text-[12px] text-on-surface/40">{e.forecast ?? "—"}</div>
                </div>
                <div>
                  <div className="label text-[9px] tracking-widest text-outline font-bold uppercase">Previous</div>
                  <div className="mono text-[12px] text-on-surface/40">{e.previous ?? "—"}</div>
                </div>
                <div>
                  <div className="label text-[9px] tracking-widest text-outline font-bold uppercase">Actual</div>
                  <div className="mono text-[12px] text-on-surface/40">{e.actual ?? "—"}</div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: unchanged table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-outline-variant/20">
              {["Date", timeHeader, "Country", "Event", "Impact", "Forecast", "Previous", "Actual"].map((h) => (
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
            {events.map((e) => (
              <tr
                key={e.id}
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
                    className="hover:text-primary transition-colors inline-flex items-center gap-1.5"
                    title={`Source: ${e.sourceLabel}`}
                  >
                    {e.event}
                    <span className="material-symbols-outlined text-[13px] text-on-surface/30">open_in_new</span>
                  </a>
                </td>
                <td className="py-3 px-3">
                  <ImpactBadge impact={e.impact} />
                </td>
                <td className="py-3 px-3 mono text-[12px] md:text-[11px] text-on-surface/40">{e.forecast ?? "—"}</td>
                <td className="py-3 px-3 mono text-[12px] md:text-[11px] text-on-surface/40">{e.previous ?? "—"}</td>
                <td className="py-3 px-3 mono text-[12px] md:text-[11px] text-on-surface/40">{e.actual ?? "—"}</td>
              </tr>
            ))}
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
}: {
  filters: CalendarFilterValue;
  onChange: (next: CalendarFilterValue) => void;
  timeZone: TimeZoneMode;
  onTimeZoneChange: (next: TimeZoneMode) => void;
}) {
  const fieldClass = "flex items-center gap-2";
  const labelClass = "text-[12px] md:text-[10px] uppercase tracking-wider shrink-0";
  const labelStyle = { color: "#86948a", fontFamily: "'Space Grotesk', sans-serif" } as const;
  const patch = (partial: Partial<CalendarFilterValue>) => onChange({ ...filters, ...partial });

  return (
    <div
      data-testid="calendar-filter-bar"
      className="flex flex-wrap gap-3 items-center mb-8"
    >
      <div className={fieldClass}>
        <label htmlFor="calendar-filter-importance" className={labelClass} style={labelStyle}>
          Importance
        </label>
        <select
          id="calendar-filter-importance"
          data-testid="calendar-filter-importance"
          value={filters.importance}
          onChange={(e) => patch({ importance: e.target.value as CalendarImpact | "" })}
          className={SELECT_CLASSES}
        >
          <option value="">All</option>
          {IMPACT_LEVELS.map((level) => (
            <option key={level} value={level}>
              {IMPACT_META[level].label}
            </option>
          ))}
        </select>
      </div>

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
                  backgroundColor: selected ? "#4edea3" : "#201f1f",
                  color: selected ? "#005f40" : "#bbcac0",
                  borderColor: selected ? "#4edea3" : "#3c4a42",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
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
              backgroundColor: selected ? "#4edea3" : "#201f1f",
              color: selected ? "#005f40" : "#bbcac0",
              borderColor: selected ? "#4edea3" : "#3c4a42",
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
            backgroundColor: "#201f1f",
            color: "#bbcac0",
            borderColor: "#3c4a42",
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
  useEffect(() => setMounted(true), []);

  // `now` used for the this-week split; recomputed on mount only (not every
  // second — only the countdown itself needs second-level ticking).
  const now = mounted ? new Date() : null;

  const { thisWeek, upcoming, nextHighImpact, weekDays, selectedDayEvents } = useMemo(() => {
    if (!now) {
      return {
        thisWeek: [] as CalendarEvent[],
        upcoming: [] as CalendarEvent[],
        nextHighImpact: null as CalendarEvent | null,
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
      filteredEvents.push(e);
      const dt = eventDateTime(e);
      if (dt >= start && dt < end) thisWeek.push(e);
      else if (dt >= end) upcoming.push(e);
    }
    const nextHighImpact = EVENTS.find((e) => e.impact === "high" && eventDateTime(e).getTime() > now.getTime()) ?? null;

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

    return { thisWeek, upcoming, nextHighImpact, weekDays, selectedDayEvents };
  }, [now, filters, selectedDay]);

  return (
    <div className="mt-16 p-4 md:p-8 min-h-screen bg-surface-container-lowest text-on-surface">
      <section className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tighter font-headline text-white">Economic Calendar</h1>
          <p className="text-on-surface/60 mt-2 font-body font-medium">
            Fed, ECB, BOJ, and major US data releases — the scheduled events that move the instruments Blue Beacon
            tracks.
          </p>
        </div>
      </section>

      <CalendarFilters
        filters={filters}
        onChange={setFilters}
        timeZone={timeZone}
        onTimeZoneChange={setTimeZone}
      />

      {/* Countdown to next high-impact event — prominent, persistent */}
      <section className="bg-surface-container rounded-lg border border-primary/30 shadow-xl p-6 mb-8 flex items-center justify-between flex-wrap gap-4">
        <div>
          <span className="label text-[12px] md:text-[9px] tracking-widest text-outline font-bold uppercase block mb-1">
            Next High-Impact Event
          </span>
          {nextHighImpact ? (
            <>
              <p className="text-lg font-bold text-on-surface">{nextHighImpact.event}</p>
              <p className="text-xs text-on-surface/50 mt-0.5">
                {nextHighImpact.country} · {formatEventDate(nextHighImpact, timeZone)} at {formatEventTime(nextHighImpact, timeZone)}
              </p>
            </>
          ) : (
            <p className="text-sm text-on-surface/50 italic">No upcoming high-impact events in this calendar's window.</p>
          )}
        </div>
        {nextHighImpact && (
          <div className="text-right">
            <span className="label text-[12px] md:text-[9px] tracking-widest text-outline font-bold uppercase block mb-1">
              Countdown
            </span>
            <Countdown target={eventDateTime(nextHighImpact)} />
          </div>
        )}
      </section>

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
            <EventTable events={selectedDayEvents} timeZone={timeZone} />
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
              <EventTable events={thisWeek} timeZone={timeZone} />
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
              <EventTable events={upcoming} timeZone={timeZone} />
            </div>
          </section>
        </>
      )}

      <p className="text-[12px] md:text-[10px] text-on-surface/35 leading-relaxed max-w-3xl">
        Dates are sourced directly from each institution's own published schedule (linked per event) as of{" "}
        {calendarData._meta.sourcedAt}, not a paid calendar API — this is a deliberate v1 choice, not a gap. Forecast
        / Previous / Actual show — because there is no live data feed behind them yet; Blue Beacon never fabricates
        placeholder numbers.
      </p>
    </div>
  );
}
