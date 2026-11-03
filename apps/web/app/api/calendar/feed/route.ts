import calendarData from "@/data/economic-calendar.json";
import { buildCalendarFeed, type FeedEvent } from "@/lib/calendar-feed";

export const dynamic = "force-static";

export function GET() {
  const events: FeedEvent[] = calendarData.events.map((e) => ({
    id: e.id,
    date: e.date,
    time: e.time,
    timeApprox: e.timeApprox,
    timeNote: e.timeNote,
    country: e.country,
    event: e.event,
    sourceUrl: e.sourceUrl,
    sourceLabel: e.sourceLabel,
  }));

  // Fixed to the data's own sourcedAt date, not Date.now(), so DTSTAMP does
  // not change between fetches of the same underlying data.
  const stampIso = `${calendarData._meta.sourcedAt}T00:00:00Z`;
  const body = buildCalendarFeed(events, stampIso);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Content-Disposition": 'inline; filename="blue-beacon-week-ahead.ics"',
    },
  });
}
