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

/**
 * At most one email per UTC day. Returns the outcome rather than throwing — callers
 * (classifyEvent's catch block) still wrap this in their own try/catch per the task's
 * "a failure to send must never break classification" requirement, but this function
 * itself never throws on a Redis or Resend failure either.
 *
 * `deps` exists only so unit tests can inject a fake Redis/email client without a
 * module-mocking framework (this repo's test runner is plain tsx + node:assert, no
 * jest/vitest mocking available) — production call sites pass nothing and get the real
 * getRedis()/EmailService.
 */
export async function maybeSendSpendLimitAlert(
  deps: { redis?: RedisSetter | null; email?: EmailSender; now?: Date } = {},
): Promise<SpendLimitAlertOutcome> {
  const redis = deps.redis !== undefined ? deps.redis : getRedis();
  if (!redis) {
    console.warn(
      "[spend-limit-alert] Redis unavailable — sending NO email (never falling back to an " +
        "in-memory date check, which would re-send on every worker restart).",
    );
    return "redis_unavailable";
  }

  const date = utcDateString(deps.now ?? new Date());
  const key = `alert:spend-limit:${date}`;

  let claimed: string | null;
  try {
    claimed = await redis.set(key, "1", "EX", 36 * 60 * 60, "NX");
  } catch (err: any) {
    console.warn(`[spend-limit-alert] Redis SET NX failed: ${err?.message ?? err} — sending NO email.`);
    return "redis_error";
  }

  if (!claimed) {
    return "already_sent_today";
  }

  const recipients = adminRecipients();
  if (recipients.length === 0) {
    console.warn(
      "[spend-limit-alert] ADMIN_EMAILS is empty — no alert email sent (today's dedupe flag is still set).",
    );
    return "no_recipients";
  }

  const email = deps.email ?? new EmailService();
  const subject = "BBR: Anthropic spend limit reached";
  const text =
    `${date} (UTC)\n\n` +
    `Live classification is using the keyword fallback until the limit is raised.`;
  const html = `<p>${date} (UTC)</p><p>Live classification is using the keyword fallback until the limit is raised.</p>`;

  let anySent = false;
  for (const to of recipients) {
    const result = await email.send({ to, subject, html, text });
    if (result.sent) {
      anySent = true;
    } else {
      console.warn(`[spend-limit-alert] email to ${to} failed: ${result.reason}`);
    }
  }
  return anySent ? "sent" : "send_failed";
}
