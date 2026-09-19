import { NextResponse } from "next/server";

import { apiError, apiErrorLogged } from "@/lib/api-response";
import { parseFeedbackBody } from "@/lib/feedback";
import { getRouteSupabaseClients } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const clients = await getRouteSupabaseClients();
  if (!clients) return apiError(500, "config_error");
  if (!clients.user) return apiError(401, "unauthorized");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError(400, "invalid_body");
  }

  const parsed = parseFeedbackBody(raw);
  if (!parsed.ok) return apiError(400, parsed.error);

  const { supabaseAuth, user } = clients;
  const { error } = await supabaseAuth.from("feedback_submissions").insert({
    user_id: user.id,
    message: parsed.value.message,
    email: parsed.value.email,
    page_context: parsed.value.pageContext,
  });

  if (error) {
    return apiErrorLogged(500, "db_error", error);
  }

  return NextResponse.json({ ok: true });
}
