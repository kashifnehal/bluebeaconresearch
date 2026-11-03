// Service-role persistence for the newsletter/lead-intake tables (see
// supabase/migrations/20261103120000_lead_intake.sql). Same service-role
// client pattern as app/api/auth/confirmation-status/route.ts and
// getRouteSupabaseClients() in lib/supabase-server.ts — no new pattern.
//
// Every function takes the Supabase client as an explicit trailing parameter
// (default: the real service client) so route-handler tests can pass a fake.

import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LeadSource } from "@/lib/lead-validation";

export type LeadStoreCode = "config_error" | "rate_limited" | "db_error";

export type LeadStoreResult<T> = { ok: true; value: T } | { ok: false; code: LeadStoreCode };

/** Lazily built service-role client. Returns null when Supabase isn't configured. */
export function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_MAX_ROWS = 3; // a 4th row within the window is refused

async function isRateLimited(
  client: SupabaseClient,
  table: "newsletter_subscribers" | "lead_requests",
  emailColumn: "email" | "work_email",
  email: string,
): Promise<boolean> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(emailColumn, email)
    .gte("created_at", since);
  if (error) {
    // Fail open on the count itself — the DB write below still enforces
    // real constraints; a transient count failure must not block a
    // legitimate sign-up/lead.
    return false;
  }
  return (count ?? 0) >= RATE_LIMIT_MAX_ROWS;
}

function newToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export type PendingSubscriberInput = {
  email: string;
  consentText: string;
  consentVersion: string;
  source: LeadSource;
};

export type PendingSubscriber = {
  id: string;
  confirmToken: string;
  unsubscribeToken: string;
  /** true when the email already had a row (pending/confirmed) — no new row, no mail to send. */
  duplicate: boolean;
};

export async function insertPendingSubscriber(
  input: PendingSubscriberInput,
  client: SupabaseClient | null = getServiceClient(),
): Promise<LeadStoreResult<PendingSubscriber>> {
  if (!client) return { ok: false, code: "config_error" };

  if (await isRateLimited(client, "newsletter_subscribers", "email", input.email)) {
    return { ok: false, code: "rate_limited" };
  }

  const confirmToken = newToken();
  const unsubscribeToken = newToken();

  const { data, error } = await client
    .from("newsletter_subscribers")
    .insert({
      email: input.email,
      status: "pending",
      consent_text: input.consentText,
      consent_version: input.consentVersion,
      confirm_token_hash: sha256(confirmToken),
      unsubscribe_token: unsubscribeToken,
      source: input.source,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique_violation on lower(email) — this address already has a row.
    // Anti-enumeration: the caller must show the same success response either way.
    if (error.code === "23505") {
      return { ok: true, value: { id: "", confirmToken: "", unsubscribeToken: "", duplicate: true } };
    }
    return { ok: false, code: "db_error" };
  }

  return { ok: true, value: { id: data.id as string, confirmToken, unsubscribeToken, duplicate: false } };
}

export async function deleteSubscriberById(
  id: string,
  client: SupabaseClient | null = getServiceClient(),
): Promise<void> {
  if (!client || !id) return;
  await client.from("newsletter_subscribers").delete().eq("id", id);
}

export async function confirmSubscriber(
  token: string,
  client: SupabaseClient | null = getServiceClient(),
): Promise<{ ok: boolean }> {
  if (!client || !token) return { ok: false };
  const { data, error } = await client
    .from("newsletter_subscribers")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString(), confirm_token_hash: null })
    .eq("confirm_token_hash", sha256(token))
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false };
  return { ok: true };
}

/** Always resolves ok:true (anti-enumeration) — mutates only when the token matches a row. */
export async function unsubscribeByToken(
  token: string,
  client: SupabaseClient | null = getServiceClient(),
): Promise<{ ok: true }> {
  if (client && token) {
    await client
      .from("newsletter_subscribers")
      .update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() })
      .eq("unsubscribe_token", token)
      .neq("status", "unsubscribed");
  }
  return { ok: true };
}

export type LeadRequestInput = {
  kind: "walkthrough" | "professional_access";
  name: string;
  workEmail: string;
  organisation: string | null;
  role: string | null;
  markets: string[];
  message: string | null;
  consentText: string;
  consentVersion: string;
  source: LeadSource;
};

export async function insertLead(
  input: LeadRequestInput,
  client: SupabaseClient | null = getServiceClient(),
): Promise<LeadStoreResult<{ id: string }>> {
  if (!client) return { ok: false, code: "config_error" };

  if (await isRateLimited(client, "lead_requests", "work_email", input.workEmail)) {
    return { ok: false, code: "rate_limited" };
  }

  const { data, error } = await client
    .from("lead_requests")
    .insert({
      kind: input.kind,
      name: input.name,
      work_email: input.workEmail,
      organisation: input.organisation,
      role: input.role,
      markets: input.markets,
      message: input.message,
      consent_contact: true,
      consent_text: input.consentText,
      consent_version: input.consentVersion,
      source: input.source,
    })
    .select("id")
    .single();

  if (error) return { ok: false, code: "db_error" };
  return { ok: true, value: { id: data.id as string } };
}
