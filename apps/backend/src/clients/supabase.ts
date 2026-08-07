import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { getEnv } from "../env.js";

if (!(globalThis as any).WebSocket) {
  (globalThis as any).WebSocket = WebSocket;
}

let supabase: ReturnType<typeof createClient<any>> | null = null;

export function getSupabaseAdmin() {
  if (supabase) return supabase;
  const env = getEnv();
  supabase = createClient<any>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: {
      transport: WebSocket as any,
    },
  });
  return supabase;
}

