import { NextResponse, type NextRequest } from "next/server";
import { unsubscribeByToken } from "@/lib/lead-store";

export type UnsubscribeDeps = {
  unsubscribeByToken: typeof unsubscribeByToken;
};

const CONFIRMED_MESSAGE = "You have been unsubscribed.";

// GET /api/unsubscribe?t=<token> — forwards to the page so a person can see
// what they're about to do before it happens. No DB write here.
export function handleUnsubscribeGet(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  const token = req.nextUrl.searchParams.get("t") ?? "";
  return NextResponse.redirect(`${origin}/unsubscribe?t=${encodeURIComponent(token)}`);
}

async function readBodyToken(req: NextRequest): Promise<string | null> {
  try {
    const body = (await req.json()) as { t?: unknown };
    return typeof body?.t === "string" ? body.t : null;
  } catch {
    // Mail clients' RFC 8058 one-click POST sends
    // `List-Unsubscribe=One-Click` as application/x-www-form-urlencoded, not
    // JSON — the token for that request is in the URL (the List-Unsubscribe
    // header), not the body, so a parse failure here is expected, not an error.
    return null;
  }
}

// POST /api/unsubscribe — both the one-click POST a mail client sends to the
// List-Unsubscribe URL, and the "Unsubscribe" button on /unsubscribe. Always
// returns 200 with the same message (anti-enumeration — an unknown or
// already-used token looks identical to a real one).
export async function handleUnsubscribePost(req: NextRequest, override?: Partial<UnsubscribeDeps>) {
  const doUnsubscribe = override?.unsubscribeByToken ?? unsubscribeByToken;
  const token = req.nextUrl.searchParams.get("t") ?? (await readBodyToken(req)) ?? "";
  await doUnsubscribe(token);
  return NextResponse.json({ ok: true, message: CONFIRMED_MESSAGE });
}
