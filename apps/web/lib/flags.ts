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
