import { createClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "./config";

let supabaseSingleton: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (supabaseSingleton) return supabaseSingleton;
  const cfg = getSupabaseConfig();
  if (!cfg.url || !cfg.anonKey) return null;
  supabaseSingleton = createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return supabaseSingleton;
}

export async function getAccessToken() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

