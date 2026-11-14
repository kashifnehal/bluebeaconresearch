// Single source of truth for the origin used in Supabase auth redirectTo/
// emailRedirectTo URLs. The production hostnames always resolve to the
// canonical https://www.bluebeaconresearch.com origin (so a visitor who
// somehow lands on the bare apex domain still gets a redirect URL that
// matches the canonical host), while localhost and Vercel preview hosts keep
// using window.location.origin as before.
const PRODUCTION_ORIGIN = "https://www.bluebeaconresearch.com";
const PRODUCTION_HOSTS = new Set(["bluebeaconresearch.com", "www.bluebeaconresearch.com"]);

export function getSiteOrigin(): string {
  if (typeof window === "undefined") return PRODUCTION_ORIGIN;
  return PRODUCTION_HOSTS.has(window.location.hostname) ? PRODUCTION_ORIGIN : window.location.origin;
}
