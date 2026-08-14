import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import crypto from "crypto";
import { cookies } from "next/headers";
import { incr } from "@/lib/metrics";

export const runtime = "nodejs";

// Simple in-memory token store. Tokens are short-lived (default 60s).
const TOKENS = new Map<string, { userId: string; expiresAt: number }>();
const TTL_MS = Number(process.env.EVENT_TOKEN_TTL_MS ?? 60_000);

function cleanup() {
  const now = Date.now();
  for (const [k, v] of TOKENS.entries())
    if (v.expiresAt <= now) TOKENS.delete(k);
}

export async function POST() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "missing env" }, { status: 500 });
  }
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const token =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  TOKENS.set(token, { userId: user.id, expiresAt: Date.now() + TTL_MS });
  cleanup();
  incr("sse.tokens.minted");
  return NextResponse.json({ token, ttlMs: TTL_MS });
}

export function validateToken(token: string | null) {
  cleanup();
  if (!token) return null;
  const entry = TOKENS.get(token);
  if (!entry) return null;
  return entry.userId;
}
