import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-response";
import { isDiscordWebhookUrl } from "@/lib/discord-webhook";
import { getRouteSupabaseClients } from "@/lib/supabase-server";

const TEST_CONTENT = "This is a test alert from Blue Beacon Research.";

export async function POST(req: Request) {
  const clients = await getRouteSupabaseClients();
  if (!clients) return apiError(500, "config_error");
  if (!clients.user) return apiError(401, "unauthorized");

  let body: { webhookUrl?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiError(400, "invalid_body");
  }

  const webhookUrl = typeof body.webhookUrl === "string" ? body.webhookUrl.trim() : "";
  if (!isDiscordWebhookUrl(webhookUrl)) {
    return NextResponse.json({ ok: false, error: "Invalid Discord webhook URL" });
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: TEST_CONTENT }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        error: `Discord responded ${res.status}`,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "failed",
    });
  }
}
