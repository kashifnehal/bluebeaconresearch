import { NextResponse, type NextRequest } from "next/server";
import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { apiError } from "@/lib/api-response";

export async function GET(_req: NextRequest) {
  const clients = await getRouteSupabaseClients();
  if (!clients) {
    return apiError(500, "config_error");
  }
  // Deliberately queries via supabaseAuth (the user's own RLS-scoped session) below,
  // not the service-role `supabase` client — alerts_sent access should stay scoped to
  // what the requesting user's own policy allows, per the RLS remediation decision
  // recorded in supabase/migrations/011_rls_remediation.sql.
  const { supabaseAuth, user } = clients;

  if (!user) {
    return NextResponse.json({ alerts: [] });
  }

  // Real alerts_sent rows only — no fallback to raw signals relabeled as delivered
  // alerts. An empty result here means no alert_rules have matched anything yet, which
  // is a genuine "no alerts" state, not a gap to paper over.
  const { data, error } = await supabaseAuth
    .from("alerts_sent")
    .select("*, signals(id, title, severity)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return apiError(500, "db_error", error.message);
  }

  return NextResponse.json({ alerts: data ?? [] });
}
