/**
 * Feature flags for Blue Beacon Research.
 *
 * isProjectReady:
 *   false → show the "ACCESS LIMITED" gate modal on every page.
 *           No authenticated user can reach any dashboard route.
 *   true  → modal is hidden, app is fully accessible.
 *
 * This flag lives in server-side code and is NOT exposed to the client
 * bundle, so it cannot be toggled via DevTools or localStorage.
 */
export const isProjectReady = false;
