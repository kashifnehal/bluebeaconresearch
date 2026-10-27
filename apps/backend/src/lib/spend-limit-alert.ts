import { getRedis } from "../clients/redis.js";
import { EmailService } from "../services/email.service.js";
import { getEnv } from "../env.js";

// W5-SPEND-ALERT — fired from claude.service.ts's classifyEvent() catch block when the
// Anthropic account itself has hit its spend limit (HTTP 400, "You have reached your
// spend limit..."), a condition that silently degrades every classification to
// heuristicClassify() until a human raises the limit. Founder-approved 2026-10-01 with
// two constraints: never spend more than one Resend send/day on this, and never add an
// extra Anthropic call to detect or confirm it.
//
// Dedup uses the SAME Redis connection the backend already uses for BullMQ (see
// clients/redis.ts's getRedis(), reused as-is by queues.ts) — SET key NX with a 36h TTL,
// so at most one email goes out per UTC day regardless of how many raw events fail
// classification that day, and the flag survives a worker restart (an in-memory date
// check would not: it would re-arm and re-send on every restart, which is exactly what
// this is designed to avoid). If Redis is unreachable, send NO email — the dedup
// guarantee matters more than the alert itself, and there is no safe way to send without
// it. EmailService (Resend) is the same provider/account the #83 daily digest and the
// anthropic-budget.ts chat-threshold alert already use.
type EmailSender = Pick<EmailService, "send">;
// Deliberately NOT `Pick<Redis, "set">` — ioredis's overloaded `set()` typing collapses
// to a signature that returns only `Promise<"OK">` once picked this way, which doesn't
// match the real NX-variant return type (`"OK" | null`) this function relies on. This
// narrower type says exactly the one call shape used below, for the real client and for
// tests' fake Redis alike.
type RedisSetter = {
  set(key: string, value: string, exFlag: "EX", seconds: number, nxFlag: "NX"): Promise<"OK" | null>;
};

function utcDateString(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function adminRecipients(): string[] {
  return (getEnv().ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

export type SpendLimitAlertOutcome =
  | "sent"
  | "already_sent_today"
  | "redis_unavailable"
  | "redis_error"
  | "no_recipients"
  | "send_failed";

// Generalised 2026-10-27 to cover two more Anthropic account-level
// conditions that were previously silent: a credit-balance exhaustion (HTTP 400,
// message includes "credit balance" — see isAnthropicUsageLimitError in
// claude.service.ts) and an outright rejected API key (HTTP 401/403 — see
// isAnthropicAuthError). All three kinds share the exact same shape: at most one
// admin email per UTC day, same Redis-unavailable/no-recipient behaviour, same 36h
// dedupe TTL — only the subject/body and the dedupe key's kind segment differ.
export type AnthropicAlertKind = "spend_limit" | "credit_balance" | "auth_rejected";
export type AnthropicAlertOutcome = SpendLimitAlertOutcome;

const ALERT_SUBJECTS: Record<AnthropicAlertKind, string> = {
  spend_limit: "BBR: Anthropic spend limit reached",
  credit_balance: "BBR: Anthropic credit balance too low",
  auth_rejected: "BBR: Anthropic API key rejected",
};

// Deliberately never takes the API's own error text as input — these bodies are
// static per kind so the email can never leak Anthropic's raw error message.
const ALERT_PAUSED_LINE = "Classification is paused; no keyword fallback signals are being created.";
const ALERT_CHECK_LINES: Record<AnthropicAlertKind, string> = {
  spend_limit: "Check Anthropic Console billing for credit.",
  credit_balance: "Check Anthropic Console billing for credit.",
  auth_rejected: "Check the key set on Railway services workers and backend.",
};

function alertBody(kind: AnthropicAlertKind, date: string): { text: string; html: string } {
  // spend_limit keeps its original 2026-10-01 wording byte-for-byte (existing
  // tests assert on it) — the two new kinds get the paused+check-line shape.
  if (kind === "spend_limit") {
    const line =
      "Classification is paused until the limit is raised. No keyword fallback signals are being created.";
    return {
      text: `${date} (UTC)\n\n${line}`,
      html: `<p>${date} (UTC)</p><p>${line}</p>`,
    };
  }
  const checkLine = ALERT_CHECK_LINES[kind];
  return {
    text: `${date} (UTC)\n\n${ALERT_PAUSED_LINE}\n${checkLine}`,
    html: `<p>${date} (UTC)</p><p>${ALERT_PAUSED_LINE}</p><p>${checkLine}</p>`,
  };
}

/**
 * At most one email per UTC day per `kind`. Returns the outcome rather than
 * throwing — callers (classifyEvent's catch block) still wrap this in their own
 * try/catch per the task's "a failure to send must never break classification"
 * requirement, but this function itself never throws on a Redis or Resend
 * failure either.
 *
 * `deps` exists only so unit tests can inject a fake Redis/email client without a
 * module-mocking framework (this repo's test runner is plain tsx + node:assert, no
 * jest/vitest mocking available) — production call sites pass nothing and get the real
 * getRedis()/EmailService.
 */
export async function maybeSendAnthropicAlert(
  kind: AnthropicAlertKind,
  deps: { redis?: RedisSetter | null; email?: EmailSender; now?: Date } = {},
): Promise<AnthropicAlertOutcome> {
  const redis = deps.redis !== undefined ? deps.redis : getRedis();
  if (!redis) {
    console.warn(
      `[anthropic-alert:${kind}] Redis unavailable — sending NO email (never falling back to an ` +
        "in-memory date check, which would re-send on every worker restart).",
    );
    return "redis_unavailable";
  }

  const date = utcDateString(deps.now ?? new Date());
  const key = `alert:anthropic:${kind}:${date}`;

  let claimed: string | null;
  try {
    claimed = await redis.set(key, "1", "EX", 36 * 60 * 60, "NX");
  } catch (err: any) {
    console.warn(`[anthropic-alert:${kind}] Redis SET NX failed: ${err?.message ?? err} — sending NO email.`);
    return "redis_error";
  }

  if (!claimed) {
    return "already_sent_today";
  }

  const recipients = adminRecipients();
  if (recipients.length === 0) {
    console.warn(
      `[anthropic-alert:${kind}] ADMIN_EMAILS is empty — no alert email sent (today's dedupe flag is still set).`,
    );
    return "no_recipients";
  }

  const email = deps.email ?? new EmailService();
  const subject = ALERT_SUBJECTS[kind];
  const { text, html } = alertBody(kind, date);

  let anySent = false;
  for (const to of recipients) {
    const result = await email.send({ to, subject, html, text });
    if (result.sent) {
      anySent = true;
    } else {
      console.warn(`[anthropic-alert:${kind}] email to ${to} failed: ${result.reason}`);
    }
  }
  return anySent ? "sent" : "send_failed";
}

/**
 * Unchanged entry point for the original spend-limit condition — now a thin
 * wrapper over maybeSendAnthropicAlert("spend_limit", ...). Behaviour and the
 * existing test file are unaffected.
 */
export async function maybeSendSpendLimitAlert(
  deps: { redis?: RedisSetter | null; email?: EmailSender; now?: Date } = {},
): Promise<SpendLimitAlertOutcome> {
  return maybeSendAnthropicAlert("spend_limit", deps);
}
