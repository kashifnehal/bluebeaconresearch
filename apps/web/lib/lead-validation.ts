// Pure validation for the two public lead-intake forms (newsletter sign-up,
// walkthrough/professional-access request). No I/O — callers (the route
// handlers in lib/subscribe-handler.ts etc.) own persistence and mail.

import { FILTER_COMMODITIES } from "@/lib/signal-filters";

export type ValidationCode = "invalid_email" | "missing_consent" | "too_long" | "spam" | "invalid_markets";

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; code: ValidationCode };

const MARKET_SYMBOLS = new Set<string>(FILTER_COMMODITIES.map((c) => c.symbol));

// Honeypot/timing anti-spam fields shared by both forms. "website" is a hidden
// input real users never fill in; "t" is a hidden render timestamp (ms epoch) —
// a submit less than MIN_FILL_MS after render is almost certainly a bot.
export type AntiSpamFields = {
  website?: string;
  t?: number;
};

const MIN_FILL_MS = 3_000;

const EMAIL_MAX = 254;
const NAME_MAX = 100;
const ORG_ROLE_MAX = 120;
const MESSAGE_MAX = 1_000;

function stripControlChars(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1f\x7f]/g, "");
}

function isSpam(fields: AntiSpamFields, now: number): boolean {
  if (typeof fields.website === "string" && fields.website.trim().length > 0) return true;
  if (typeof fields.t === "number" && Number.isFinite(fields.t) && now - fields.t < MIN_FILL_MS) return true;
  return false;
}

/** Trim/lower-case and check shape: no whitespace, exactly one "@", a "." after it. */
function cleanEmail(raw: string): string | null {
  const value = stripControlChars(raw).trim().toLowerCase();
  if (value.length === 0 || value.length > EMAIL_MAX) return null;
  if (/\s/.test(value)) return null;
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return null;
  const domain = value.slice(at + 1);
  const dot = domain.indexOf(".");
  if (dot <= 0 || dot === domain.length - 1) return null;
  return value;
}

/** Whitelisted, size-capped source metadata: page path + first-touch UTM only. */
export type LeadSource = {
  path?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
};

const SOURCE_KEYS: (keyof LeadSource)[] = ["path", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
const SOURCE_VALUE_MAX = 200;

export function sanitizeSource(raw: unknown): LeadSource {
  const out: LeadSource = {};
  if (!raw || typeof raw !== "object") return out;
  const src = raw as Record<string, unknown>;
  for (const key of SOURCE_KEYS) {
    const value = src[key];
    if (typeof value !== "string") continue;
    const cleaned = stripControlChars(value).trim().slice(0, SOURCE_VALUE_MAX);
    if (cleaned.length > 0) out[key] = cleaned;
  }
  return out;
}

export type SubscribeInput = AntiSpamFields & {
  email: unknown;
  consent: unknown;
  source?: unknown;
};

export type SubscribeValue = {
  email: string;
  source: LeadSource;
};

export function validateSubscribe(input: SubscribeInput, now: number = Date.now()): ValidationResult<SubscribeValue> {
  if (isSpam(input, now)) return { ok: false, code: "spam" };
  if (typeof input.email !== "string") return { ok: false, code: "invalid_email" };
  const email = cleanEmail(input.email);
  if (!email) return { ok: false, code: "invalid_email" };
  if (input.consent !== true) return { ok: false, code: "missing_consent" };
  return { ok: true, value: { email, source: sanitizeSource(input.source) } };
}

export type LeadKind = "walkthrough" | "professional_access";

export type LeadInput = AntiSpamFields & {
  kind: unknown;
  name: unknown;
  workEmail: unknown;
  organisation?: unknown;
  role?: unknown;
  markets?: unknown;
  message?: unknown;
  consentContact: unknown;
  source?: unknown;
};

export type LeadValue = {
  kind: LeadKind;
  name: string;
  workEmail: string;
  organisation: string | null;
  role: string | null;
  markets: string[];
  message: string | null;
  consentContact: true;
  source: LeadSource;
};

/** Trims/strips a free-text field and reports whether it exceeds `max`. Empty is not an error here — only length is checked, per spec. */
function cleanBounded(raw: unknown, max: number): { value: string; tooLong: boolean } {
  if (typeof raw !== "string") return { value: "", tooLong: false };
  const cleaned = stripControlChars(raw).trim();
  if (cleaned.length > max) return { value: "", tooLong: true };
  return { value: cleaned, tooLong: false };
}

export function validateLead(input: LeadInput, now: number = Date.now()): ValidationResult<LeadValue> {
  if (isSpam(input, now)) return { ok: false, code: "spam" };

  if (typeof input.workEmail !== "string") return { ok: false, code: "invalid_email" };
  const workEmail = cleanEmail(input.workEmail);
  if (!workEmail) return { ok: false, code: "invalid_email" };

  if (input.consentContact !== true) return { ok: false, code: "missing_consent" };

  const name = cleanBounded(input.name, NAME_MAX);
  if (name.tooLong) return { ok: false, code: "too_long" };

  const organisation = cleanBounded(input.organisation, ORG_ROLE_MAX);
  if (organisation.tooLong) return { ok: false, code: "too_long" };

  const role = cleanBounded(input.role, ORG_ROLE_MAX);
  if (role.tooLong) return { ok: false, code: "too_long" };

  const message = cleanBounded(input.message, MESSAGE_MAX);
  if (message.tooLong) return { ok: false, code: "too_long" };

  const rawMarkets = Array.isArray(input.markets) ? input.markets : [];
  const markets: string[] = [];
  for (const m of rawMarkets) {
    if (typeof m !== "string") return { ok: false, code: "invalid_markets" };
    if (!MARKET_SYMBOLS.has(m)) return { ok: false, code: "invalid_markets" };
    if (!markets.includes(m)) markets.push(m);
  }

  const kind: LeadKind = input.kind === "professional_access" ? "professional_access" : "walkthrough";

  return {
    ok: true,
    value: {
      kind,
      name: name.value,
      workEmail,
      organisation: organisation.value || null,
      role: role.value || null,
      markets,
      message: message.value || null,
      consentContact: true,
      source: sanitizeSource(input.source),
    },
  };
}
