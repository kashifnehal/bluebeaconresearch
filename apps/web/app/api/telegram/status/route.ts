import { NextResponse } from "next/server";

import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { apiError } from "@/lib/api-response";

export async function GET() {
  // Uses the shared getRouteSupabaseClients() helper rather than re-doing
  // createClient() + auth.getSession() by hand (2026-08-27). Two reasons beyond
  // deduplication: the helper resolves the user via auth.getUser(), which verifies the
  // JWT with the auth server instead of trusting whatever the cookie decodes to, and
  // it keeps this route's client construction identical to alerts/recent's.
  const clients = await getRouteSupabaseClients();
  if (!clients) {
    return apiError(500, "config_error");
  }
  // Deliberately queries via supabaseAuth (the user's own RLS-scoped session), not the
  // service-role client — same decision as alerts/recent, per the RLS remediation in
  // supabase/migrations/011_rls_remediation.sql. user_channels reads stay scoped to
  // what the requesting user's own policy (user_channels_all_own) allows.
  const { supabaseAuth, user } = clients;

  if (!user) return NextResponse.json({ telegramConnected: false }, { status: 200 });

  // maybeSingle (not single) — a brand-new user genuinely has no user_channels row yet,
  // which is a normal "not connected" state, not an error. A real DB error is a
  // separate, distinct state below — previously both were swallowed into the same
  // `telegramConnected: false` response, indistinguishable from each other.
  const { data, error } = await supabaseAuth
    .from("user_channels")
    .select("telegram_chat_id, slack_webhook_url")
    .maybeSingle();

  if (error) {
    return apiError(500, "db_error", error.message);
  }

  return NextResponse.json({
    telegramConnected: Boolean(data?.telegram_chat_id),
    telegramChatId: data?.telegram_chat_id ?? null,
    slackWebhookUrl: data?.slack_webhook_url ?? null,
  });
}

