import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase-server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiBase = process.env.API_URL;
  if (!apiBase) {
    return NextResponse.json({ error: "Missing API_URL env var" }, { status: 500 });
  }

  const res = await fetch(`${apiBase}/v1/telegram/connect-code`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    return NextResponse.json({ error: json?.error ?? "Failed to generate connect code" }, { status: res.status });
  }

  return NextResponse.json(json ?? {});
}

