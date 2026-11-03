import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api-response";
import { rateLimitOrPass } from "@/lib/ratelimit";
import { validateSubscribe } from "@/lib/lead-validation";
import { insertPendingSubscriber, deleteSubscriberById } from "@/lib/lead-store";
import { sendSubscribeConfirmation } from "@/lib/lead-mail";
import { CONSENT_VERSION, NEWSLETTER_CONSENT } from "@/lib/consent-copy";

const UNAVAILABLE_MESSAGE = "Sign-up is not available right now. Please try again later.";

export type SubscribePostDeps = {
  validate: typeof validateSubscribe;
  insertPendingSubscriber: typeof insertPendingSubscriber;
  deleteSubscriberById: typeof deleteSubscriberById;
  sendConfirmation: typeof sendSubscribeConfirmation;
  rateLimit: (key: string) => Promise<{ success: boolean }>;
};

// POST /api/subscribe — public newsletter sign-up. Always returns the same
// 200 {ok:true} whether or not the email was already subscribed (anti-
// enumeration — see lib/lead-store.ts insertPendingSubscriber's duplicate
// handling). 503 only when the confirmation mail genuinely could not be
// sent, and in that case the pending row is deleted so nothing is stored
// silently.
export async function handleSubscribePost(req: NextRequest, override?: Partial<SubscribePostDeps>) {
  const validate = override?.validate ?? validateSubscribe;
  const doInsert = override?.insertPendingSubscriber ?? insertPendingSubscriber;
  const doDelete = override?.deleteSubscriberById ?? deleteSubscriberById;
  const doSend = override?.sendConfirmation ?? sendSubscribeConfirmation;
  const rateLimit = override?.rateLimit ?? ((key: string) => rateLimitOrPass(key));

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  try {
    const rl = await rateLimit(`subscribe:${ip}`);
    if (!rl.success) return apiError(429, "rate_limited", "Too many requests. Please try again later.");
  } catch {
    // A limiter failure is not the caller's problem — fall through.
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "invalid_body");
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const result = validate({
    email: input.email,
    consent: input.consent,
    website: typeof input.website === "string" ? input.website : undefined,
    t: typeof input.t === "number" ? input.t : undefined,
    source: input.source,
  });
  if (!result.ok) return apiError(400, result.code);

  const inserted = await doInsert({
    email: result.value.email,
    consentText: NEWSLETTER_CONSENT,
    consentVersion: CONSENT_VERSION,
    source: result.value.source,
  });

  if (!inserted.ok) {
    if (inserted.code === "rate_limited") {
      return apiError(429, "rate_limited", "Too many requests. Please try again later.");
    }
    return apiError(503, "unavailable", UNAVAILABLE_MESSAGE);
  }

  if (inserted.value.duplicate) {
    // Anti-enumeration — same success shape as a brand-new sign-up.
    return NextResponse.json({ ok: true });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  const confirmUrl = `${origin}/api/subscribe/confirm?t=${inserted.value.confirmToken}`;
  const unsubscribeUrl = `${origin}/api/unsubscribe?t=${inserted.value.unsubscribeToken}`;

  const sendResult = await doSend(result.value.email, confirmUrl, unsubscribeUrl);
  if (!sendResult.sent) {
    await doDelete(inserted.value.id);
    return apiError(503, "unavailable", UNAVAILABLE_MESSAGE);
  }

  return NextResponse.json({ ok: true });
}
