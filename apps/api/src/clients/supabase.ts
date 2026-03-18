import { createClient } from "@supabase/supabase-js";
import { getEnv } from "../env";

let supabase: ReturnType<typeof createClient<any>> | null = null;

export function getSupabaseAdmin() {
  if (supabase) return supabase;
  const env = getEnv();
  supabase = createClient<any>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabase;
}

