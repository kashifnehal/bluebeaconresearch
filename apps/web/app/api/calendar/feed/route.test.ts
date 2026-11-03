import assert from "node:assert/strict";
import { GET } from "./route";
import calendarData from "@/data/economic-calendar.json";

function runTest(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`✔ ${name}`);
    })
    .catch((err) => {
      console.error(`✖ ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

void runTest("GET /api/calendar/feed returns 200 with the expected headers", async () => {
  const res = GET();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/calendar; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "public, max-age=3600, s-maxage=3600");
  assert.equal(res.headers.get("content-disposition"), 'inline; filename="blue-beacon-week-ahead.ics"');
});

void runTest("body starts with BEGIN:VCALENDAR and ends with END:VCALENDAR + CRLF", async () => {
  const body = await GET().text();
  assert.ok(body.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(body.endsWith("END:VCALENDAR\r\n"));
});

void runTest("VEVENT count equals the number of events in the JSON", async () => {
  const body = await GET().text();
  const veventCount = (body.match(/BEGIN:VEVENT/g) ?? []).length;
  assert.equal(veventCount, calendarData.events.length);
});

void runTest("calling it twice gives the same body", async () => {
  const body1 = await GET().text();
  const body2 = await GET().text();
  assert.equal(body1, body2);
});
