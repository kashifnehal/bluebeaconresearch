import { MARKET_IMPACT_MIN_SAMPLE_SIZE } from "@/lib/market-impact-assessment";

export type BaselineWindow = { startMs: number; movePct: number };

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function hourStartMs(ms: number): number {
  return Math.floor(ms / MS_PER_HOUR) * MS_PER_HOUR;
}

/**
 * Keeps the first stored row in each UTC clock hour (hourly snapshot), then
 * pairs each snapshot hour H with the snapshot at H + windowHours (when one
 * exists) to form a window. Equal prices and a non-positive earlier price are
 * left out rather than producing a 0% or divide-by-zero window.
 */
export function buildHourlyWindows(
  points: { price: number; fetchedAt: string }[],
  windowHours: number,
): BaselineWindow[] {
  const sorted = [...points].sort(
    (a, b) => new Date(a.fetchedAt).getTime() - new Date(b.fetchedAt).getTime(),
  );

  const hourly = new Map<number, number>();
  for (const point of sorted) {
    const ms = new Date(point.fetchedAt).getTime();
    if (!Number.isFinite(ms)) continue;
    const hour = hourStartMs(ms);
    if (!hourly.has(hour)) hourly.set(hour, point.price);
  }

  const windowMs = windowHours * MS_PER_HOUR;
  const windows: BaselineWindow[] = [];
  for (const [hour, earlier] of hourly) {
    const later = hourly.get(hour + windowMs);
    if (later === undefined) continue;
    if (!(earlier > 0)) continue;
    if (later === earlier) continue;
    windows.push({
      startMs: hour,
      movePct: Math.abs(((later - earlier) / earlier) * 100),
    });
  }
  return windows;
}

/** UTC hour-of-day (0-23), plus 100 when the UTC day is Saturday or Sunday. */
export function startCell(ms: number): number {
  const date = new Date(ms);
  const hour = date.getUTCHours();
  const day = date.getUTCDay();
  const isWeekend = day === 0 || day === 6;
  return isWeekend ? hour + 100 : hour;
}

export type WindowMoveBaseline = {
  windowHours: number;
  medianMovePct: number;
  windowCount: number;
  eventRowsMatched: number;
  spanDays: number;
};

// Hourly snapshot = first stored row in each UTC hour. Weighting windows to
// the start hours (24 hours x weekday/weekend, UTC) of the tracked signals is
// a BBR design choice with no published source. Comparing with a reference
// return follows the event-study idea (MacKinlay 1997). The reference windows
// include windows that had tracked signals; with signals this frequent an
// event-free set does not exist at 24 hours (measured 2026-10-10: 39 of 1,204
// USOIL 24-hour windows had no tracked signal within 24 hours). No
// significance test is applied; windows overlap and come from one short
// period.
export function computeMatchedWindowBaseline(
  windows: BaselineWindow[],
  eventStartMs: number[],
  windowHours: number,
  minSampleSize: number = MARKET_IMPACT_MIN_SAMPLE_SIZE,
): WindowMoveBaseline | null {
  const eventCountByCell = new Map<number, number>();
  for (const ms of eventStartMs) {
    const cell = startCell(ms);
    eventCountByCell.set(cell, (eventCountByCell.get(cell) ?? 0) + 1);
  }

  const windowsByCell = new Map<number, BaselineWindow[]>();
  for (const window of windows) {
    const cell = startCell(window.startMs);
    const list = windowsByCell.get(cell);
    if (list) list.push(window);
    else windowsByCell.set(cell, [window]);
  }

  const usedWindows: { movePct: number; weight: number; startMs: number }[] = [];
  let eventRowsMatched = 0;
  for (const [cell, eventCount] of eventCountByCell) {
    const cellWindows = windowsByCell.get(cell);
    if (!cellWindows || cellWindows.length === 0) continue;
    eventRowsMatched += eventCount;
    const weight = eventCount / cellWindows.length;
    for (const window of cellWindows) {
      usedWindows.push({ movePct: window.movePct, weight, startMs: window.startMs });
    }
  }

  if (eventRowsMatched < minSampleSize || usedWindows.length < minSampleSize) {
    return null;
  }

  const sorted = [...usedWindows].sort((a, b) => a.movePct - b.movePct);
  const totalWeight = sorted.reduce((sum, w) => sum + w.weight, 0);
  let cumulative = 0;
  let medianMovePct = sorted[sorted.length - 1].movePct;
  for (const window of sorted) {
    cumulative += window.weight;
    if (cumulative >= totalWeight / 2) {
      medianMovePct = window.movePct;
      break;
    }
  }

  const startTimes = usedWindows.map((w) => w.startMs);
  const spanDays = Math.floor(
    (Math.max(...startTimes) - Math.min(...startTimes)) / MS_PER_DAY,
  );

  return {
    windowHours,
    medianMovePct,
    windowCount: usedWindows.length,
    eventRowsMatched,
    spanDays,
  };
}
