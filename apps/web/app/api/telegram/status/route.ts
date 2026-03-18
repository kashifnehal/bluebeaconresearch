import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase-server";

export async function GET() {
  type UserChannelsRow = {
    telegram_chat_id: string | null;
    slack_webhook_url: string | null;
  };

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return NextResponse.json({ telegramConnected: false }, { status: 200 });

  let row: UserChannelsRow | null = null;
  try {
    const { data } = await supabase
      .from("user_channels")
      .select("telegram_chat_id, slack_webhook_url")
      .single();
    row = (data ?? null) as UserChannelsRow | null;
  } catch {
    row = null;
  }

  return NextResponse.json({
    telegramConnected: Boolean(row?.telegram_chat_id),
    telegramChatId: row?.telegram_chat_id ?? null,
    slackWebhookUrl: row?.slack_webhook_url ?? null,
  });
}

