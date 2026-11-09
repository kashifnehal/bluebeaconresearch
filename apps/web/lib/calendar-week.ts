// Pure "current week" math for the economic calendar, extracted out of
// calendar/page.tsx (2026-11-09, TASK W-CALENDAR Part 1) so it has direct
// unit test coverage instead of only being exercised indirectly through a
// full page render.
//
// Definition (explicit, not left to inference): the current week is the
// Monday 00:00 UTC through the following Monday 00:00 UTC (exclusive) span
// that contains `now`. A Sunday belongs to the week that is ending that day,
// not the week about to start — i.e. Sunday is the 7th day of a Mon-Sun
// week, not the 1st day of the next one.

/** Monday 00:00 UTC through the following Monday 00:00 UTC containing `now`. */
export function getWeekRangeUTC(now: Date): { start: Date; end: Date } {
  const day = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + mondayOffset));
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Whether `dateTime` falls inside the Mon-Sun UTC week that contains `now`. */
export function isInCurrentWeekUTC(dateTime: Date, now: Date): boolean {
  const { start, end } = getWeekRangeUTC(now);
  return dateTime.getTime() >= start.getTime() && dateTime.getTime() < end.getTime();
}
