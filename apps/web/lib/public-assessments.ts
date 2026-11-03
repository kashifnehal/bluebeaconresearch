// Public, no-auth read access to the public_assessments table (see
// supabase/migrations/20261103190000_public_assessments.sql). Service-role
// client, same env-var resolution as app/api/auth/confirmation-status/route.ts
// and lib/lead-store.ts's getServiceClient() — no new pattern. A bad row is
// never rendered: parseAssessmentRow validates every field and returns null
// rather than throwing.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SLUG_REGEX = /^[a-z0-9-]{3,80}$/;

const MECHANISMS = ["supply", "demand", "route", "cost", "policy", "other"] as const;
export type ExposureMechanism = (typeof MECHANISMS)[number];

export type AssessmentBody = {
  what_happened: string;
  exposure: { market: string; mechanism: ExposureMechanism; note: string }[];
  evidence: string[];
  uncertainty: string[];
  what_to_watch: { date: string; item: string; source: string }[];
};

export type AssessmentSource = {
  publisher: string;
  title: string;
  url: string;
  published_at: string;
};

export type PublicAssessment = {
  id: string;
  slug: string;
  headline: string;
  summary: string;
  eventTime: string | null;
  assessedAt: string;
  markets: string[];
  body: AssessmentBody;
  sources: AssessmentSource[];
  publishedAt: string | null;
  updatedAt: string;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isValidDateString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0 && !Number.isNaN(new Date(v).getTime());
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => isNonEmptyString(x));
}

function parseExposure(v: unknown): AssessmentBody["exposure"] | null {
  if (!Array.isArray(v)) return null;
  const out: AssessmentBody["exposure"] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") return null;
    const { market, mechanism, note } = item as Record<string, unknown>;
    if (!isNonEmptyString(market)) return null;
    if (typeof mechanism !== "string" || !MECHANISMS.includes(mechanism as ExposureMechanism)) return null;
    if (!isNonEmptyString(note)) return null;
    out.push({ market, mechanism: mechanism as ExposureMechanism, note });
  }
  return out;
}

function parseWhatToWatch(v: unknown): AssessmentBody["what_to_watch"] | null {
  if (!Array.isArray(v)) return null;
  const out: AssessmentBody["what_to_watch"] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") return null;
    const { date, item: itemText, source } = item as Record<string, unknown>;
    if (!isValidDateString(date)) return null;
    if (!isNonEmptyString(itemText)) return null;
    if (!isNonEmptyString(source)) return null;
    out.push({ date, item: itemText, source });
  }
  return out;
}

function parseBody(v: unknown): AssessmentBody | null {
  if (!v || typeof v !== "object") return null;
  const { what_happened, exposure, evidence, uncertainty, what_to_watch } = v as Record<string, unknown>;
  if (!isNonEmptyString(what_happened)) return null;
  const parsedExposure = parseExposure(exposure);
  if (!parsedExposure) return null;
  if (!isStringArray(evidence)) return null;
  if (!Array.isArray(uncertainty) || !uncertainty.every((x) => typeof x === "string")) return null;
  const parsedWatch = parseWhatToWatch(what_to_watch);
  if (!parsedWatch) return null;
  return {
    what_happened,
    exposure: parsedExposure,
    evidence,
    uncertainty: uncertainty as string[],
    what_to_watch: parsedWatch,
  };
}

function parseSources(v: unknown): AssessmentSource[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out: AssessmentSource[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") return null;
    const { publisher, title, url, published_at } = item as Record<string, unknown>;
    if (!isNonEmptyString(publisher)) return null;
    if (!isNonEmptyString(title)) return null;
    if (typeof url !== "string" || !url.startsWith("https://")) return null;
    if (!isValidDateString(published_at)) return null;
    out.push({ publisher, title, url, published_at });
  }
  return out;
}

/** Validates every field of a raw DB row. Returns null — never throws — for a bad row, which is never rendered. */
export function parseAssessmentRow(row: unknown): PublicAssessment | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;

  if (!isNonEmptyString(r.id)) return null;
  if (typeof r.slug !== "string" || !SLUG_REGEX.test(r.slug)) return null;
  if (!isNonEmptyString(r.headline)) return null;
  if (typeof r.summary !== "string" || r.summary.trim().length === 0 || r.summary.length > 400) return null;
  if (r.event_time != null && !isValidDateString(r.event_time)) return null;
  if (!isValidDateString(r.assessed_at)) return null;
  if (!Array.isArray(r.markets) || !r.markets.every((m) => typeof m === "string" && m.trim().length > 0)) return null;

  const body = parseBody(r.body);
  if (!body) return null;

  const sources = parseSources(r.sources);
  if (!sources) return null;

  if (r.published_at != null && !isValidDateString(r.published_at)) return null;
  if (!isValidDateString(r.updated_at)) return null;

  return {
    id: r.id,
    slug: r.slug,
    headline: r.headline,
    summary: r.summary,
    eventTime: r.event_time == null ? null : (r.event_time as string),
    assessedAt: r.assessed_at as string,
    markets: r.markets as string[],
    body,
    sources,
    publishedAt: r.published_at == null ? null : (r.published_at as string),
    updatedAt: r.updated_at as string,
  };
}

export function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/** Published assessments, newest-assessed first. Never throws — a DB or config failure degrades to []. */
export async function getPublishedAssessments(
  client: SupabaseClient | null = getServiceClient(),
): Promise<PublicAssessment[]> {
  if (!client) return [];
  try {
    const { data, error } = await client
      .from("public_assessments")
      .select("*")
      .eq("status", "published")
      .order("assessed_at", { ascending: false });
    if (error || !data) return [];
    return data.map(parseAssessmentRow).filter((a): a is PublicAssessment => a !== null);
  } catch {
    return [];
  }
}

/** Looks up one published assessment by slug. The slug is checked against SLUG_REGEX before any query. */
export async function getPublishedAssessmentBySlug(
  slug: string,
  client: SupabaseClient | null = getServiceClient(),
): Promise<PublicAssessment | null> {
  if (!SLUG_REGEX.test(slug)) return null;
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("public_assessments")
      .select("*")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    if (error || !data) return null;
    return parseAssessmentRow(data);
  } catch {
    return null;
  }
}
