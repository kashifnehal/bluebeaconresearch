// Base URL for GoTrue/auth calls only (sign-in, sign-out, getUser, session
// exchange). Optional Cloudflare Worker proxy in front of Supabase Auth
// (auth.bluebeaconresearch.com, see infra/cloudflare/) so Google's OAuth
// screen and any visible redirect show BBR's own domain instead of the raw
// *.supabase.co project URL — infra/cloudflare/README.md and
// docs/brain/12_DEPLOYMENT.md §6 have the manual DNS/OAuth-console/Supabase
// setup this depends on. Falls back to the raw project URL whenever the env
// var is unset, so merging this file changes no production behavior until
// the proxy is deployed, verified in preview, and the var is actually set.
//
// Direct REST/DB access (lib/supabase-server.ts's service-role client,
// api/prices etc.) intentionally keeps using NEXT_PUBLIC_SUPABASE_URL
// directly — this helper is for auth-flow clients only.
export function getSupabaseAuthUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_AUTH_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}
