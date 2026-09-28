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
