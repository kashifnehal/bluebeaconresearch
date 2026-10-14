/**
 * In-memory count of pair-only keeps for the current UTC date.
 * It also resets when the process restarts, so the real daily limit can be
 * higher after a restart; it is a safety brake, not an exact budget.
 */

let slotDay = "";
let slotsUsed = 0;

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Unset or blank is 20. A non-integer or negative value is also 20 so a bad setting cannot open the brake. */
function dailyMax(): number {
  const raw = process.env.T2_PAIR_DAILY_MAX;
  if (raw === undefined || raw.trim() === "") return 20;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return 20;
  return n;
}

function syncDay(now: Date): void {
  const day = utcDay(now);
  if (day !== slotDay) {
    slotDay = day;
    slotsUsed = 0;
  }
}

export function t2SlotsLeft(now: Date): number {
  syncDay(now);
  return Math.max(0, dailyMax() - slotsUsed);
}

export function consumeT2Slot(now: Date): void {
  syncDay(now);
  slotsUsed += 1;
}
