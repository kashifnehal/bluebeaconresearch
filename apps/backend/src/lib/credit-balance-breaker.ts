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

let pauseMs = 30 * 60 * 1000; // 30 minutes — arbitrary choice, not researched.
let breakerOpenUntil: number | null = null;

export function setCreditBalanceBreakerPauseMsForTests(ms: number): void {
  pauseMs = ms;
}

export function resetCreditBalanceBreakerForTests(): void {
  breakerOpenUntil = null;
  pauseMs = 30 * 60 * 1000;
}

export function isCreditBalanceBreakerOpen(now: number = Date.now()): boolean {
  return breakerOpenUntil !== null && now < breakerOpenUntil;
}

/**
 * Opens the breaker for the pause window starting at `now`. Returns true
 * only when the breaker was not already open, so the caller logs exactly
 * one health event for the pause start rather than one per failed call.
 */
export function openCreditBalanceBreaker(now: number = Date.now()): boolean {
  const alreadyOpen = isCreditBalanceBreakerOpen(now);
  breakerOpenUntil = now + pauseMs;
  return !alreadyOpen;
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
