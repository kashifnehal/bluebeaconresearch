import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api-response";
import { rateLimitOrPass } from "@/lib/ratelimit";
import { validateLead } from "@/lib/lead-validation";
import { insertLead } from "@/lib/lead-store";
import { notifyNewLead } from "@/lib/lead-mail";
import { CONSENT_VERSION, LEAD_CONSENT } from "@/lib/consent-copy";

export type LeadsPostDeps = {
  validate: typeof validateLead;
  insertLead: typeof insertLead;
  notifyNewLead: typeof notifyNewLead;
  rateLimit: (key: string) => Promise<{ success: boolean }>;
};

// POST /api/leads — walkthrough / professional-access requests from
// app/walkthrough/page.tsx. Never stores or logs an IP address.
export async function handleLeadsPost(req: NextRequest, override?: Partial<LeadsPostDeps>) {
  const validate = override?.validate ?? validateLead;
  const doInsert = override?.insertLead ?? insertLead;
  const doNotify = override?.notifyNewLead ?? notifyNewLead;
  const rateLimit = override?.rateLimit ?? ((key: string) => rateLimitOrPass(key));

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  try {
    const rl = await rateLimit(`leads:${ip}`);
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
    kind: input.kind,
    name: input.name,
    workEmail: input.workEmail,
    organisation: input.organisation,
    role: input.role,
    markets: input.markets,
    message: input.message,
    consentContact: input.consentContact,
    website: typeof input.website === "string" ? input.website : undefined,
    t: typeof input.t === "number" ? input.t : undefined,
    source: input.source,
  });
  if (!result.ok) return apiError(400, result.code);

  const inserted = await doInsert({
    kind: result.value.kind,
    name: result.value.name,
    workEmail: result.value.workEmail,
    organisation: result.value.organisation,
    role: result.value.role,
    markets: result.value.markets,
    message: result.value.message,
    consentText: LEAD_CONSENT,
    consentVersion: CONSENT_VERSION,
    source: result.value.source,
  });

  if (!inserted.ok) {
    if (inserted.code === "rate_limited") {
      return apiError(429, "rate_limited", "Too many requests. Please try again later.");
    }
    return apiError(503, "unavailable", "This isn't available right now. Please try again later.");
  }

  // Awaited (serverless functions can be frozen right after the response is
  // sent, so a true fire-and-forget risks the mail never going out) but never
  // allowed to fail the lead itself — the row is already saved either way.
  try {
    await doNotify({
      kind: result.value.kind,
      name: result.value.name,
      workEmail: result.value.workEmail,
      organisation: result.value.organisation,
      role: result.value.role,
      markets: result.value.markets,
      message: result.value.message,
    });
  } catch {
    // Notification failure must not fail the lead response.
  }

  return NextResponse.json({ ok: true });
}
