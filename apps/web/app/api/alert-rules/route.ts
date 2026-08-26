import { NextResponse, type NextRequest } from "next/server";
import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { apiError } from "@/lib/api-response";

export async function GET(_req: NextRequest) {
  const clients = await getRouteSupabaseClients();
  if (!clients) {
    return apiError(500, "config_error");
  }
  // Same RLS-scoped-session pattern as alerts/recent/route.ts — alert_rules access
  // stays scoped to what the requesting user's own "alert_rules_crud_own" policy
  // allows (supabase/migrations/011_rls_remediation.sql), not the service-role client.
  const { supabaseAuth, user } = clients;

  if (!user) {
    return NextResponse.json({ rules: [] });
  }

  const { data, error } = await supabaseAuth
    .from("alert_rules")
    .select("*")
    .eq("user_id", user.id)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return apiError(500, "db_error", error.message);
  }

  return NextResponse.json({ rules: data ?? [] });
}
