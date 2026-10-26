export type CalendarImpact = "high" | "medium" | "low";

// The "importance" (high/medium/low) filter and its UI control were removed
// 2026-10-26: _meta in economic-calendar.json has no documented method for
// how the impact field is assigned, so filtering/displaying by it would
// present an unsubstantiated rating as fact. The `impact` field itself stays
// on CalendarEvent and in the JSON for when a documented method exists.
export type CalendarFilterValue = {
  country: string;
  category: string;
};

export const EMPTY_CALENDAR_FILTERS: CalendarFilterValue = {
  country: "",
  category: "",
};

export function eventMatchesCalendarFilters(
  event: { country: string; category: string },
  filters: CalendarFilterValue,
): boolean {
  if (filters.country && event.country !== filters.country) return false;
  if (filters.category && event.category !== filters.category) return false;
  return true;
}

/**
 * Which of the forecast/previous/actual columns have at least one non-null
 * value across the loaded event list. A column with no values anywhere is
 * dropped (header and cells) rather than shown as a wall of em dashes.
 */
export function visibleValueColumns(
  events: { forecast: unknown; previous: unknown; actual: unknown }[],
): { forecast: boolean; previous: boolean; actual: boolean } {
  return {
    forecast: events.some((e) => e.forecast != null),
    previous: events.some((e) => e.previous != null),
    actual: events.some((e) => e.actual != null),
  };
}

// DESIGN CHOICE (2026-10-26): 14 days is an arbitrary "give enough runway to
// notice" threshold, not a sourced figure.
const SCHEDULE_END_WARNING_DAYS = 14;

/**
 * A plain-language line when the loaded schedule runs out soon, so the page
 * doesn't silently look complete when it's actually just unextended. Returns
 * null when the last event is far enough out, or when there are no events.
 */
export function scheduleEndNotice(events: { date: string }[], today: Date): string | null {
  if (events.length === 0) return null;
  const lastDate = events.map((e) => e.date).sort().at(-1)!;
  const last = new Date(`${lastDate}T00:00:00Z`);
  const diffDays = (last.getTime() - today.getTime()) / (24 * 60 * 60 * 1000);
  if (diffDays >= SCHEDULE_END_WARNING_DAYS) return null;
  const formatted = last.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `The schedule below ends on ${formatted}. More dates are added regularly.`;
}

