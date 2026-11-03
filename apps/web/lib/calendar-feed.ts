export type FeedEvent = {
  id: string;
  date: string;
  time: string | null;
  timeApprox: boolean;
  timeNote?: string;
  country: string;
  event: string;
  sourceUrl: string | null;
  sourceLabel: string;
};

function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function icsDateTimeUTC(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function utf8ByteLength(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

// RFC 5545 §3.1 line folding: any line whose UTF-8 byte length exceeds 75
// octets is split with CRLF + a single leading space, and the split must
// never land inside a multi-byte UTF-8 character.
function foldLine(line: string): string {
  const LIMIT = 75;
  if (utf8ByteLength(line) <= LIMIT) return line;

  const chars = Array.from(line);
  const segments: string[] = [];
  let current = "";
  let currentBytes = 0;
  // Continuation lines start with one space, which itself costs one octet
  // of the 75-octet budget for every segment after the first.
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const chBytes = utf8ByteLength(ch);
    const budget = segments.length === 0 ? LIMIT : LIMIT - 1;
    if (currentBytes + chBytes > budget) {
      segments.push(current);
      current = ch;
      currentBytes = chBytes;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current.length > 0) segments.push(current);

  return segments.map((seg, i) => (i === 0 ? seg : ` ${seg}`)).join("\r\n");
}

function pushFolded(lines: string[], line: string): void {
  lines.push(foldLine(line));
}

function eventDateTimeUTC(date: string, time: string): Date {
  return new Date(`${date}T${time}:00Z`);
}

function compareEvents(a: FeedEvent, b: FeedEvent): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.time === null && b.time === null) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  if (a.time === null) return 1;
  if (b.time === null) return -1;
  if (a.time !== b.time) return a.time < b.time ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** RFC 5545 VCALENDAR text for the Week Ahead feed. Deterministic: same
 * `events` and `stampIso` always produce byte-identical output. */
export function buildCalendarFeed(events: FeedEvent[], stampIso: string): string {
  const dtstamp = icsDateTimeUTC(new Date(stampIso));
  const lines: string[] = [];

  pushFolded(lines, "BEGIN:VCALENDAR");
  pushFolded(lines, "VERSION:2.0");
  pushFolded(lines, "PRODID:-//Blue Beacon Research//Week Ahead//EN");
  pushFolded(lines, "CALSCALE:GREGORIAN");
  pushFolded(lines, "METHOD:PUBLISH");
  pushFolded(lines, "X-WR-CALNAME:Blue Beacon Research Week Ahead");
  // Refresh hints only. Each calendar app decides its own refresh rate.
  pushFolded(lines, "REFRESH-INTERVAL;VALUE=DURATION:PT12H");
  pushFolded(lines, "X-PUBLISHED-TTL:PT12H");

  const sorted = [...events].sort(compareEvents);

  for (const e of sorted) {
    pushFolded(lines, "BEGIN:VEVENT");
    pushFolded(lines, `UID:${e.id}@bluebeaconresearch.com`);
    pushFolded(lines, `DTSTAMP:${dtstamp}`);
    if (e.time && !e.timeApprox) {
      pushFolded(lines, `DTSTART:${icsDateTimeUTC(eventDateTimeUTC(e.date, e.time))}`);
      pushFolded(lines, "DURATION:PT30M");
    } else {
      const start = new Date(`${e.date}T00:00:00Z`);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      pushFolded(lines, `DTSTART;VALUE=DATE:${icsDateOnly(start)}`);
      pushFolded(lines, `DTEND;VALUE=DATE:${icsDateOnly(end)}`);
    }
    pushFolded(lines, `SUMMARY:${icsEscape(`${e.event} (${e.country})`)}`);

    const descriptionParts = [`Source: ${e.sourceLabel}`];
    if (e.sourceUrl) descriptionParts.push(e.sourceUrl);
    if (e.timeNote) descriptionParts.push(e.timeNote);
    pushFolded(lines, `DESCRIPTION:${icsEscape(descriptionParts.join("\n"))}`);

    if (e.sourceUrl) pushFolded(lines, `URL:${e.sourceUrl}`);
    pushFolded(lines, "END:VEVENT");
  }

  pushFolded(lines, "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
