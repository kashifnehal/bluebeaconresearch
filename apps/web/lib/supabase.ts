import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;
let cachedUrl: string | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  if (cached && cachedUrl === url) return cached;

  cachedUrl = url;
  cached = createBrowserClient(url, anonKey);
  return cached;
}

// Full navigation (window.location.href, not router.push) — required so middleware
// sees the cleared session cookie on the very next request, same SSR-cookie rule as
// the post-signup/post-login redirects.
export async function signOutAndRedirect(target: string = "/login") {
  const supabase = getSupabaseBrowserClient();
  if (supabase) await supabase.auth.signOut();
  window.location.href = target;
}

