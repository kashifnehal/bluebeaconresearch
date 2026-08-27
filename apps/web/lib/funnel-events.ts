import { track as trackVercelAnalytics } from "@vercel/analytics";

// Minimal funnel tracking (2026-08-27) — CTO-directed, additive alongside the
// existing PostHog wiring in lib/analytics.ts (NOT a replacement; PostHog is
// intentionally left untouched). Two destinations:
//   1. Vercel Analytics (`@vercel/analytics`, <Analytics/> in app/layout.tsx) —
//      pageview/event tracking, short retention.
//   2. The `events` table in Supabase (via POST /api/events) — for the funnel
//      events that need to survive longer than Vercel Analytics' retention window.
// Both are fire-and-forget: a failure here must never block or fail the actual
// user action (signup, viewing a signal, creating an alert rule).
//
// Exactly four event types are instrumented anywhere in the app:
//   signup_started, signup_completed, first_signal_viewed, first_alert_rule_created.

type FunnelMetadata = Record<string, unknown>;

function toVercelProperties(
  metadata?: FunnelMetadata,
): Record<string, string | number | boolean | null> | undefined {
  if (!metadata) return undefined;
  // Vercel Analytics only accepts flat string/number/boolean/null values and
  // strips anything else in production — stringify non-primitives ourselves so
  // that stripping doesn't silently drop data we actually wanted recorded.
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? value
        : JSON.stringify(value),
    ]),
  );
}

function safeTrackVercel(eventType: string, metadata?: FunnelMetadata) {
  try {
    trackVercelAnalytics(eventType, toVercelProperties(metadata));
  } catch {
    // Instrumentation must never throw into the caller's control flow.
  }
}

/**
 * Top-of-funnel event fired before an authenticated user/session exists yet
 * (signup_started — fires on signup form submit, before supabase.auth.signUp() has
 * even been called). Vercel Analytics only: there is no user_id yet to attach an
 * `events` row to, and the events table's user_id column is not nullable.
 */
export function trackFunnelEvent(eventType: string, metadata?: FunnelMetadata): void {
  safeTrackVercel(eventType, metadata);
}

/**
 * Funnel event for an authenticated user, persisted to both Vercel Analytics and
 * the `events` table (via POST /api/events). The route dedupes server-side so the
 * `events` row is written at most once per user regardless of how many times this
 * is called from the client (see supabase/migrations/013_events_table.sql's partial
 * unique indexes + the route's check-then-insert) — safe to call on every relevant
 * page load/action without tracking "have I already logged this" client-side.
 *
 * Fire-and-forget: never awaited by callers, never throws, never blocks the
 * surrounding user action. Uses `keepalive: true` since a couple of call sites fire
 * this immediately before a `window.location.href` navigation.
 */
export function logFunnelEventOnce(eventType: string, metadata?: FunnelMetadata): void {
  safeTrackVercel(eventType, metadata);
  try {
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, metadata, once: true }),
      keepalive: true,
    }).catch(() => {
      // Fire-and-forget — see module doc comment.
    });
  } catch {
    // Instrumentation must never throw into the caller's control flow.
  }
}
