"use client";

import { useEffect, useMemo, useState } from "react";
import calendarData from "@/data/economic-calendar.json";

type Impact = "high" | "medium" | "low";

type CalendarEvent = {
  id: string;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM UTC, or null if not pre-announced
  timeApprox: boolean;
  timeNote?: string;
  country: string;
  countryCode: string;
  event: string;
  impact: Impact;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  sourceUrl: string;
  sourceLabel: string;
};

const EVENTS = (calendarData.events as CalendarEvent[]).slice().sort((a, b) => {
  const ak = `${a.date}T${a.time ?? "00:00"}`;
  const bk = `${b.date}T${b.time ?? "00:00"}`;
  return ak < bk ? -1 : ak > bk ? 1 : 0;
});

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

function formatEventTime(e: CalendarEvent): string {
  if (!e.time) return "—";
  return `${e.time} UTC${e.timeApprox ? " (approx.)" : ""}`;
}

function formatEventDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
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
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[9px] label font-bold uppercase tracking-widest rounded-sm border ${meta.className}`}
      aria-label={`${meta.label} impact`}
    >
      <span aria-hidden="true">{meta.emoji}</span>
      {meta.label}
    </span>
  );
}

function EventTable({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) {
    return <p className="text-xs text-on-surface/50 px-2 py-6 italic text-center">No events in this range.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-outline-variant/20">
            {["Date", "Time (UTC)", "Country", "Event", "Impact", "Forecast", "Previous", "Actual"].map((h) => (
              <th
                key={h}
                className="label text-[9px] tracking-widest text-outline font-bold uppercase py-2.5 px-3 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {events.map((e) => (
            <tr key={e.id} className="hover:bg-surface-bright/10 transition-colors">
              <td className="py-3 px-3 mono text-[11px] text-on-surface/70 whitespace-nowrap">
                {formatEventDate(e.date)}
              </td>
              <td className="py-3 px-3 mono text-[11px] text-on-surface/70 whitespace-nowrap" title={e.timeNote}>
                {formatEventTime(e)}
              </td>
              <td className="py-3 px-3 text-[11px] text-on-surface/70 whitespace-nowrap">{e.country}</td>
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
              <td className="py-3 px-3 mono text-[11px] text-on-surface/40">{e.forecast ?? "—"}</td>
              <td className="py-3 px-3 mono text-[11px] text-on-surface/40">{e.previous ?? "—"}</td>
              <td className="py-3 px-3 mono text-[11px] text-on-surface/40">{e.actual ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CalendarPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // `now` used for the this-week split; recomputed on mount only (not every
  // second — only the countdown itself needs second-level ticking).
  const now = mounted ? new Date() : null;

  const { thisWeek, upcoming, nextHighImpact } = useMemo(() => {
    if (!now) return { thisWeek: [] as CalendarEvent[], upcoming: [] as CalendarEvent[], nextHighImpact: null as CalendarEvent | null };
    const { start, end } = getWeekRangeUTC(now);
    const thisWeek: CalendarEvent[] = [];
    const upcoming: CalendarEvent[] = [];
    for (const e of EVENTS) {
      const dt = eventDateTime(e);
      if (dt >= start && dt < end) thisWeek.push(e);
      else if (dt >= end) upcoming.push(e);
    }
    const nextHighImpact = EVENTS.find((e) => e.impact === "high" && eventDateTime(e).getTime() > now.getTime()) ?? null;
    return { thisWeek, upcoming, nextHighImpact };
  }, [now]);

  return (
    <div className="ml-[256px] mr-[260px] mt-16 p-8 min-h-screen bg-surface-container-lowest text-on-surface">
      <section className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tighter font-headline text-white">Economic Calendar</h1>
          <p className="text-on-surface/60 mt-2 font-body font-medium">
            Fed, ECB, BOJ, and major US data releases — the scheduled events that move the instruments Blue Beacon
            tracks.
          </p>
        </div>
      </section>

      {/* Countdown to next high-impact event — prominent, persistent */}
      <section className="bg-surface-container rounded-lg border border-primary/30 shadow-xl p-6 mb-8 flex items-center justify-between flex-wrap gap-4">
        <div>
          <span className="label text-[9px] tracking-widest text-outline font-bold uppercase block mb-1">
            Next High-Impact Event
          </span>
          {nextHighImpact ? (
            <>
              <p className="text-lg font-bold text-on-surface">{nextHighImpact.event}</p>
              <p className="text-xs text-on-surface/50 mt-0.5">
                {nextHighImpact.country} · {formatEventDate(nextHighImpact.date)} at {formatEventTime(nextHighImpact)}
              </p>
            </>
          ) : (
            <p className="text-sm text-on-surface/50 italic">No upcoming high-impact events in this calendar's window.</p>
          )}
        </div>
        {nextHighImpact && (
          <div className="text-right">
            <span className="label text-[9px] tracking-widest text-outline font-bold uppercase block mb-1">
              Countdown
            </span>
            <Countdown target={eventDateTime(nextHighImpact)} />
          </div>
        )}
      </section>

      {/* This week */}
      <section className="bg-surface-container rounded-lg overflow-hidden border border-outline-variant/10 shadow-xl mb-6">
        <div className="p-4 border-b border-outline-variant/10 bg-surface-container-high/30">
          <span className="label text-[10px] tracking-widest text-outline font-bold uppercase">This Week</span>
        </div>
        <div className="p-2">
          <EventTable events={thisWeek} />
        </div>
      </section>

      {/* Upcoming (rest of the calendar's window) */}
      {upcoming.length > 0 && (
        <section className="bg-surface-container rounded-lg overflow-hidden border border-outline-variant/10 shadow-xl mb-6">
          <div className="p-4 border-b border-outline-variant/10 bg-surface-container-high/30">
            <span className="label text-[10px] tracking-widest text-outline font-bold uppercase">
              Upcoming ({upcoming.length})
            </span>
          </div>
          <div className="p-2">
            <EventTable events={upcoming} />
          </div>
        </section>
      )}

      <p className="text-[10px] text-on-surface/35 leading-relaxed max-w-3xl">
        Dates are sourced directly from each institution's own published schedule (linked per event) as of{" "}
        {calendarData._meta.sourcedAt}, not a paid calendar API — this is a deliberate v1 choice, not a gap. Forecast
        / Previous / Actual show — because there is no live data feed behind them yet; Blue Beacon never fabricates
        placeholder numbers.
      </p>
    </div>
  );
}
