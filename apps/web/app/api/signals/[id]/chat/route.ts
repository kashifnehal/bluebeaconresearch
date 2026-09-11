import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase-server";
import { apiError } from "@/lib/api-response";

// #111 (frontend half) — proxies to the backend chat endpoints added in the
// previous commit (apps/backend `signal-chat.routes.ts`). Same auth-forwarding
// pattern as api/telegram/connect-code/route.ts: resolve the caller's Supabase
// session server-side, forward the access token as a Bearer header to
// apps/backend (process.env.API_URL), and pass the upstream status/body straight
// through rather than re-shaping it — the backend's { error: "premium_required" }
// / { error: "rate_limited" } bodies are already the contract the chat panel reads.

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getAccessToken(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return apiError(400, "missing_id");

  const token = await getAccessToken();
  if (!token) return apiError(401, "unauthorized");

  const apiBase = process.env.API_URL?.replace(/\/$/, "");
  if (!apiBase) return apiError(500, "config_error", "Missing API_URL env var");

  try {
    const res = await fetch(`${apiBase}/v1/signals/${encodeURIComponent(id)}/chat`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(json ?? { error: "upstream_error" }, { status: res.status });
    }
    return NextResponse.json(json ?? { data: [] });
  } catch (err) {
    console.warn("⚠️ [API Signal Chat] GET upstream fetch failed:", err);
    return apiError(502, "upstream_unreachable");
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return apiError(400, "missing_id");

  const token = await getAccessToken();
  if (!token) return apiError(401, "unauthorized");

  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return apiError(400, "missing_message");

  const apiBase = process.env.API_URL?.replace(/\/$/, "");
  if (!apiBase) return apiError(500, "config_error", "Missing API_URL env var");

  try {
    const res = await fetch(`${apiBase}/v1/signals/${encodeURIComponent(id)}/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      // Forward the backend's exact error body/status — premium_required (403) and
      // rate_limited (429) are read by name in SignalChatPanel.
      return NextResponse.json(json ?? { error: "upstream_error" }, { status: res.status });
    }
    return NextResponse.json(json ?? {});
  } catch (err) {
    console.warn("⚠️ [API Signal Chat] POST upstream fetch failed:", err);
    return apiError(502, "upstream_unreachable");
  }
}
