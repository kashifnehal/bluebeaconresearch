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
// Funnel event types (fire-once per user): signup_started, signup_completed,
// first_signal_viewed, first_alert_rule_created.
// Recurring usage event types (see logUsageEvent below): dashboard_viewed,
// watchlist_viewed, signal_detail_opened, alert_rule_created.

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

// Recurring usage events (2026-09-04) — persisted to Vercel Analytics + the
// `events` table on every call, with NO server-side once-per-user dedup (unlike
// logFunnelEventOnce). These power the DAU/WAU and per-event-type usage counts on
// the founder-internal /admin/metrics page:
//   dashboard_viewed, watchlist_viewed, signal_detail_opened, alert_rule_created.
// An in-module guard collapses repeat fires within a single page-session (React
// strict-mode double-mount, re-renders, client-side nav back to the same view) —
// keyed by event type + an optional entity id in metadata (`id` or `signalId`) so
// e.g. opening two different signals still records two signal_detail_opened rows,
// but re-rendering one signal's page does not.
const usageEventsFiredThisSession = new Set<string>();

/**
 * @param dedupe  How to collapse repeat fires within this page-session:
 *   - `"type"` (default): at most one row per event type per page load — for
 *     "viewed" events (dashboard_viewed, watchlist_viewed).
 *   - `"entity"`: one row per event type + `metadata.id`/`metadata.signalId` —
 *     for per-entity views (signal_detail_opened) where distinct entities should
 *     each count but a re-render of one should not.
 *   - `false`: always send — for discrete actions (alert_rule_created) where
 *     every occurrence is a real event. Still guards the synchronous
 *     strict-mode double-invoke via a short-lived key.
 */
export function logUsageEvent(
  eventType: string,
  metadata?: FunnelMetadata,
  dedupe: "type" | "entity" | false = "type",
): void {
  safeTrackVercel(eventType, metadata);
  if (dedupe === false) {
    const k = `${eventType}|${Date.now()}`;
    if (usageEventsFiredThisSession.has(k)) return;
    usageEventsFiredThisSession.add(k);
  } else {
    const entityId = dedupe === "entity" && metadata ? (metadata.id ?? metadata.signalId) : undefined;
    const key = `${eventType}|${entityId == null ? "" : String(entityId)}`;
    if (usageEventsFiredThisSession.has(key)) return;
    usageEventsFiredThisSession.add(key);
  }
  try {
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, metadata }),
      keepalive: true,
    }).catch(() => {
      // Fire-and-forget — see module doc comment.
    });
  } catch {
    // Instrumentation must never throw into the caller's control flow.
  }
}
