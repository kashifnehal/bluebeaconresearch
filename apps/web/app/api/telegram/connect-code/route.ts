import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase-server";
import { apiError } from "@/lib/api-response";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) return apiError(401, "unauthorized");

  const apiBase = process.env.API_URL;
  if (!apiBase) {
    return apiError(500, "config_error", "Missing API_URL env var");
  }

  const res = await fetch(`${apiBase}/v1/telegram/connect-code`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    return apiError(res.status, "upstream_error", json?.error ?? "Failed to generate connect code");
  }

  return NextResponse.json(json ?? {});
}

