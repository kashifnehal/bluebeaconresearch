// W8-INTAKE-GUARDS — ADR 007 says the feed shows a 24-hour event_date window,
// so an article older than that can never appear in it. Classifying one anyway
// (GDELT/GNews both fetch the same backlog every cycle) wastes a Claude call
// and can leave a stale event_date on display. Default max age: 24h (ADR 007).
export const DEFAULT_INTAKE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function isWithinIntakeWindow(
  publishedAt: Date,
  now: Date,
  maxAgeMs: number = DEFAULT_INTAKE_MAX_AGE_MS,
): boolean {
  return now.getTime() - publishedAt.getTime() <= maxAgeMs;
}
