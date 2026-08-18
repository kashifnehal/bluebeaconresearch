import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase-server";
import { apiError } from "@/lib/api-response";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return NextResponse.json({ telegramConnected: false }, { status: 200 });

  // maybeSingle (not single) — a brand-new user genuinely has no user_channels row yet,
  // which is a normal "not connected" state, not an error. A real DB error is a
  // separate, distinct state below — previously both were swallowed into the same
  // `telegramConnected: false` response, indistinguishable from each other.
  const { data, error } = await supabase
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

