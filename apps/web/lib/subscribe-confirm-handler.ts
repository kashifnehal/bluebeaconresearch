import { NextResponse, type NextRequest } from "next/server";
import { confirmSubscriber } from "@/lib/lead-store";

export type SubscribeConfirmGetDeps = {
  confirmSubscriber: typeof confirmSubscriber;
};

// GET /api/subscribe/confirm?t=<token> — clicked from the confirmation email.
// Always redirects (never a bare JSON error) since this is a link a human
// clicks in their mail client.
export async function handleSubscribeConfirmGet(req: NextRequest, override?: Partial<SubscribeConfirmGetDeps>) {
  const doConfirm = override?.confirmSubscriber ?? confirmSubscriber;
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  const token = req.nextUrl.searchParams.get("t");

  const result = token ? await doConfirm(token) : { ok: false };
  const redirectUrl = result.ok ? `${origin}/subscribe/confirmed` : `${origin}/subscribe/confirmed?state=invalid`;
  return NextResponse.redirect(redirectUrl);
}
