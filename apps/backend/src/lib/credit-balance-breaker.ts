// TASK W3 Part 1 circuit breaker. Evidence 2026-11-11: 3,847 failed
// classifyEvent() calls in 39 hours, all "Your credit balance is too low"
// (HTTP 400, invalid_request_error) — a 400 on this specific error was being
// treated the same as any other request-specific 400 (shouldStopBatch lets
// the batch continue past it), so every remaining event in every batch kept
// hitting the live Anthropic API and failing again, each one writing a
// service_health_events row and feeding one email burst per day. This module
// is an in-process breaker: once the error fires, classifyEvent() skips the
// live API call entirely for a fixed pause instead of retrying on every
// subsequent event.
//
// TASK W4 Part 3, 2026-11-15 — evidence: Anthropic returned "You have reached
// your specified API usage limits. You will regain access on 2026-12-01 at
// 00:00 UTC." against the fixed 30-minute pause, that meant hitting the live
// API roughly every 30 minutes for 17 days straight for a condition that
// cannot clear early. When the error text names a "regain access on <date> at
// <time> UTC" moment, the breaker now opens for that long instead — capped at
// a re-check window so a limit raised ahead of its stated date is still
// noticed, rather than waiting out the full remaining duration blind.

let pauseMs = 30 * 60 * 1000; // fallback when no "regain access" date is found — arbitrary choice, not researched.
let recheckMs = 6 * 60 * 60 * 1000; // cap on a dated pause before one live call is let through again — arbitrary choice, not researched.
let breakerOpenUntil: number | null = null;

export function setCreditBalanceBreakerPauseMsForTests(ms: number): void {
  pauseMs = ms;
}

export function setCreditBalanceBreakerRecheckMsForTests(ms: number): void {
  recheckMs = ms;
}

export function resetCreditBalanceBreakerForTests(): void {
  breakerOpenUntil = null;
  pauseMs = 30 * 60 * 1000;
  recheckMs = 6 * 60 * 60 * 1000;
}

export function isCreditBalanceBreakerOpen(now: number = Date.now()): boolean {
  return breakerOpenUntil !== null && now < breakerOpenUntil;
}

/**
 * Returns the epoch ms Anthropic's own error text names as the moment access
 * resumes ("... You will regain access on 2026-12-01 at 00:00 UTC."), or null
 * when the message has no such date, the date can't be parsed, or it's
 * already in the past. Literal field extraction for this one exact wording,
 * not a general-purpose date parser.
 */
export function parseRegainAccessTime(
  message: string | null | undefined,
  now: number = Date.now(),
): number | null {
  const match = String(message ?? "").match(
    /regain access on (\d{4})-(\d{2})-(\d{2}) at (\d{2}):(\d{2}) UTC/i,
  );
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const resumeAt = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  if (!Number.isFinite(resumeAt) || resumeAt <= now) return null;
  return resumeAt;
}

/**
 * Opens the breaker starting at `now`. When `message` names a "regain access
 * on ..." date, the pause is the time remaining until it, capped at
 * `recheckMs` so a dated pause still lets one live call through every
 * `recheckMs` to notice an early-raised limit. Falls back to the fixed
 * `pauseMs` when no date is found. Returns true only when the breaker was not
 * already open, so the caller logs exactly one health event for the pause
 * start rather than one per failed call.
 */
export function openCreditBalanceBreaker(
  message?: string | null,
  now: number = Date.now(),
): boolean {
  const alreadyOpen = isCreditBalanceBreakerOpen(now);
  const resumeAt = parseRegainAccessTime(message, now);
  const windowMs = resumeAt !== null ? Math.min(resumeAt - now, recheckMs) : pauseMs;
  breakerOpenUntil = now + windowMs;
  return !alreadyOpen;
}

/** The time the current pause window ends, for logging — not the parsed regain-access date itself when that's past the re-check cap. */
export function getCreditBalanceBreakerResumeAt(): number | null {
  return breakerOpenUntil;
}

/**
 * Clears the breaker once its pause window has elapsed. Returns true only
 * the first time this observes the expiry (i.e. the breaker just closed),
 * so the caller logs exactly one health event for the resume rather than
 * one per skipped call while already closed.
 */
export function closeCreditBalanceBreakerIfExpired(now: number = Date.now()): boolean {
  if (breakerOpenUntil === null) return false;
  if (now < breakerOpenUntil) return false;
  breakerOpenUntil = null;
  return true;
}
