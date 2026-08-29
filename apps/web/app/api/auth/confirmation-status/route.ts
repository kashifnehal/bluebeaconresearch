import { NextResponse, type NextRequest } from "next/server";
import { rateLimitOrPass } from "@/lib/ratelimit";

// POST /api/auth/confirmation-status  —  body: { email: string }  —  returns: { confirmed: boolean }
//
// Lets the "check your email" waiting screen (verify/VerifyClient.tsx) detect that
// the user confirmed their account on a DIFFERENT device (the confirmation link is
// routinely opened in a phone's Gmail app while signup happened on a laptop). The
// device that clicked the link gets authenticated — never this waiting one — so a
// `true` here only ever sends this device to /login, never straight to /dashboard.
//
// ANTI-ENUMERATION: this is a public, unauthenticated endpoint. A caller must not
// be able to learn whether an arbitrary email is a registered account. Every
// outcome that is not "a real, confirmed account" returns the byte-identical
// { confirmed: false } — a nonexistent email, an existing-but-unconfirmed email,
// a malformed body and an upstream lookup failure are all indistinguishable in
// body and status. Timing is kept indistinguishable for the two cases that
// actually matter (nonexistent vs existing-unconfirmed, both of which carry a real
// email string) by always performing the exact same single Admin-API lookup for
// any non-empty email and doing nothing else conditional on the result. This
// mirrors the "distinguishable server-side, never surfaced here" rule already
// documented in verify/VerifyClient.tsx and signup/page.tsx.

const NOT_CONFIRMED = { confirmed: false } as const;

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  // Same cheap local-bucket-first limiter every other public route uses
  // (/api/prices etc.). Must not become a new Upstash-quota consumer — don't
  // bypass it.
  try {
    const rl = await rateLimitOrPass(`confirmation-status:${ip}`);
    if (!rl.success) {
      return NextResponse.json(NOT_CONFIRMED, { status: 429 });
    }
  } catch {
    // A limiter failure is not the caller's problem — fall through.
  }

  let email = "";
  try {
    const body = (await req.json()) as { email?: unknown };
    if (typeof body?.email === "string") email = body.email.trim().toLowerCase();
  } catch {
    // Malformed body — indistinguishable from "not confirmed" below.
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let confirmed = false;
  if (url && serviceKey && email) {
    // Service-role Admin API lookup — same client pattern used elsewhere
    // (lib/status-checks.ts, lib/supabase-server.ts): service-role key, no session
    // persisted. GoTrue's `filter` does a partial email match, so we still confirm
    // an exact, case-insensitive match in code.
    try {
      const res = await fetch(
        `${url}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=50`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          users?: Array<{ email?: string | null; email_confirmed_at?: string | null }>;
        };
        const match = (data.users ?? []).find(
          (u) => (u.email ?? "").toLowerCase() === email,
        );
        confirmed = Boolean(match?.email_confirmed_at);
      }
      // A non-OK response is treated exactly as "not confirmed" — no leak.
    } catch {
      // Upstream/network failure — same { confirmed: false } as every other path.
    }
  }

  return NextResponse.json(confirmed ? { confirmed: true } : NOT_CONFIRMED);
}
