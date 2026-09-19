import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase-server";
import { apiError, apiErrorLogged } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;
  if (!token) return apiError(401, "unauthorized");

  const body = await req.json().catch(() => null);
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (query.length < 2) return apiError(400, "missing_query");

  const apiBase = process.env.API_URL?.replace(/\/$/, "");
  if (!apiBase) return apiErrorLogged(500, "config_error", "Missing API_URL env var");

  try {
    const res = await fetch(`${apiBase}/v1/search/assist`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(json ?? { error: "upstream_error" }, { status: res.status });
    }
    return NextResponse.json(json ?? { status: "no_confident_answer" });
  } catch (err) {
    console.warn("⚠️ [API Search Assist] POST upstream fetch failed:", err);
    return apiError(502, "upstream_unreachable");
  }
}
