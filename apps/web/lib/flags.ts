/**
 * Feature flags for Blue Beacon Research.
 *
 * isProjectReady:
 *   false → show the "ACCESS LIMITED" gate modal on every page.
 *           No authenticated user can reach any dashboard route.
 *   true  → modal is hidden, app is fully accessible.
 *
 * This flag can be toggled via the PROJECT_READY environment variable.
 */
export const isProjectReady = process.env.PROJECT_READY === "true" || process.env.NEXT_PUBLIC_PROJECT_READY === "true";

/**
 * isDeviceLimitEnabled:
 *   false (default) → the 2-device concurrent-session cap is parked: sessions
 *           are still recorded and stale ones still cleaned up, but nothing
 *           gets evicted.
 *   true  → the count-then-evict-oldest logic in lib/session-tracking.ts
 *           actually runs.
 *
 * Toggled via DEVICE_LIMIT_ENABLED. Server-only (no NEXT_PUBLIC_ variant) —
 * this is read exclusively in server route handlers (register-session,
 * auth/callback), never in client code, so build-time inlining doesn't apply.
 * Enabled only when the value is exactly "true"; missing or anything else is
 * disabled.
 */
export const isDeviceLimitEnabled = process.env.DEVICE_LIMIT_ENABLED === "true";

/**
 * isDirectionV3Enabled (TASK NQW3-FILTER1 Part 6, 2026-11-24):
 *   false (default) → every direction chip/arrow renders exactly as today,
 *           regardless of whether a commodity_impacts entry carries a
 *           direction_shown value (backend CLASSIFIER_DIRECTION_V3, off by
 *           default itself — see apps/backend/src/services/claude.service.ts).
 *   true  → a commodity_impacts entry that HAS a direction_shown value shows
 *           an arrow only for 'up'/'down'; for 'none' it shows a plain
 *           impact_channel label instead of an arrow. An entry with no
 *           direction_shown (the common case even with this flag on, until
 *           the backend flag is also on) still renders exactly as today.
 *
 * NEXT_PUBLIC_ because this is read from client components (CommodityChip
 * and the few places that render a direction chip/arrow directly).
 */
export const isDirectionV3Enabled = process.env.NEXT_PUBLIC_DIRECTION_V3 === "true";
