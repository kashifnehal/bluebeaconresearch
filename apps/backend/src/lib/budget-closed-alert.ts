import { getRedis } from "../clients/redis.js";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { EmailService } from "../services/email.service.js";
import { getEnv } from "../env.js";
import { getDailyBudgetUsd } from "./anthropic-budget.js";

// Fired when today's ingestion classification spend is at or over the daily cap.
// At most one email per UTC day. Dedup uses the same Redis connection BullMQ
// already uses: SET alert:budget-closed:<UTC date> 1 EX 129600 NX. 129600 seconds
// is 36 hours, so a send late in the UTC day still covers that date across a
// worker restart. If Redis is unavailable, send no email — an in-memory date
// check alone would re-send after every restart. Added 2026-10-06.
type EmailSender = Pick<EmailService, "send">;
// Deliberately NOT `Pick<Redis, "set">` — ioredis's overloaded `set()` typing collapses
// to a signature that returns only `Promise<"OK">` once picked this way, which doesn't
// match the real NX-variant return type (`"OK" | null`) this function relies on. This
// narrower type says exactly the one call shape used below, for the real client and for
// tests' fake Redis alike.
type RedisSetter = {
  set(key: string, value: string, exFlag: "EX", seconds: number, nxFlag: "NX"): Promise<"OK" | null>;
};

const PAUSED_BODY =
  "Collection and classification are paused until 00:00 UTC. News older than the source's recent window (RSS keeps about 4 hours) may be missed. To continue today, raise ANTHROPIC_DAILY_BUDGET_USD_INGESTION on the Railway workers service.";

// 36 hours. Same window the spend-limit alert uses.
const DEDUPE_TTL_SECONDS = 129600;

let lastClaimedUtcDate: string | null = null;

function utcDateString(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function adminRecipients(): string[] {
  return (getEnv().ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

/**
 * In-process memo of the last UTC date the closed-budget path asked to alert.
 * Returns true only the first time this process sees `utcDate`, so later closed
 * checks that day do not call Redis. The Redis NX key is still what limits the
 * email to one per UTC day across processes and restarts.
 */
export function claimBudgetClosedAlertUtcDate(utcDate: string): boolean {
  if (lastClaimedUtcDate === utcDate) return false;
  lastClaimedUtcDate = utcDate;
  return true;
}

export type BudgetClosedAlertOutcome =
  | "sent"
  | "already_sent_today"
  | "redis_unavailable"
  | "redis_error"
  | "no_recipients"
  | "send_failed";

/**
 * Dollars already stored for today's ingestion bucket (`anthropic_daily_usage.estimated_usd`)
 * and the ingestion cap from `getDailyBudgetUsd` — the same two figures the 90%
 * log line prints, formatted with `toFixed(2)` at the call site.
 */
async function loadIngestionSpendAndCap(now: Date): Promise<{ spentUsd: number; capUsd: number }> {
  const capUsd = getDailyBudgetUsd("ingestion");
  const date = utcDateString(now);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("anthropic_daily_usage")
    .select("estimated_usd")
    .eq("usage_date", date)
    .eq("bucket", "ingestion")
    .maybeSingle();
  if (error) throw error;
  const raw = (data as { estimated_usd?: number | string } | null)?.estimated_usd;
  const spent = Number(raw ?? 0);
  return { spentUsd: Number.isFinite(spent) ? spent : 0, capUsd };
}

/**
 * At most one email per UTC day. Never throws — a Redis or send failure returns
 * an outcome string. `deps` exists only so unit tests can inject a fake Redis
 * and email client (plain tsx + node:assert, no module mock). Production passes
 * nothing and reads spend/cap from the usage row and the ingestion budget env.
 */
export async function maybeSendBudgetClosedAlert(
  deps: {
    redis?: RedisSetter | null;
    email?: EmailSender;
    now?: Date;
    spentUsd?: number;
    capUsd?: number;
  } = {},
): Promise<BudgetClosedAlertOutcome> {
  try {
    let redis: RedisSetter | null;
    try {
      redis = deps.redis !== undefined ? deps.redis : getRedis();
    } catch (err: any) {
      console.warn(
        `[budget-closed-alert] Redis unavailable: ${err?.message ?? err} — sending NO email.`,
      );
      return "redis_unavailable";
    }
    if (!redis) {
      console.warn(
        "[budget-closed-alert] Redis unavailable — sending NO email (never falling back to an " +
          "in-memory date check, which would re-send on every worker restart).",
      );
      return "redis_unavailable";
    }

    const now = deps.now ?? new Date();
    const date = utcDateString(now);
    const key = `alert:budget-closed:${date}`;

    let claimed: string | null;
    try {
      claimed = await redis.set(key, "1", "EX", DEDUPE_TTL_SECONDS, "NX");
    } catch (err: any) {
      console.warn(`[budget-closed-alert] Redis SET NX failed: ${err?.message ?? err} — sending NO email.`);
      return "redis_error";
    }

    if (!claimed) {
      return "already_sent_today";
    }

    const recipients = adminRecipients();
    if (recipients.length === 0) {
      console.warn(
        "[budget-closed-alert] ADMIN_EMAILS is empty — no alert email sent (today's dedupe flag is still set).",
      );
      return "no_recipients";
    }

    let spentUsd: number;
    let capUsd: number;
    if (deps.spentUsd !== undefined && deps.capUsd !== undefined) {
      spentUsd = deps.spentUsd;
      capUsd = deps.capUsd;
    } else {
      try {
        const loaded = await loadIngestionSpendAndCap(now);
        spentUsd = loaded.spentUsd;
        capUsd = loaded.capUsd;
      } catch (err: any) {
        console.warn(
          `[budget-closed-alert] could not read ingestion spend/cap: ${err?.message ?? err} — sending NO email.`,
        );
        return "send_failed";
      }
    }

    const email = deps.email ?? new EmailService();
    const subject = "BBR: daily classification budget reached";
    const figures = `$${spentUsd.toFixed(2)}/$${capUsd.toFixed(2)}`;
    const text = `${date} (UTC)\n\n${figures}\n\n${PAUSED_BODY}`;
    const html = `<p>${date} (UTC)</p><p>${figures}</p><p>${PAUSED_BODY}</p>`;

    let anySent = false;
    for (const to of recipients) {
      try {
        const result = await email.send({ to, subject, html, text });
        if (result.sent) {
          anySent = true;
        } else {
          console.warn(`[budget-closed-alert] email to ${to} failed: ${result.reason}`);
        }
      } catch (err: any) {
        console.warn(`[budget-closed-alert] email to ${to} threw: ${err?.message ?? err}`);
      }
    }
    return anySent ? "sent" : "send_failed";
  } catch (err: any) {
    console.warn(`[budget-closed-alert] unexpected failure: ${err?.message ?? err} — sending NO email.`);
    return "send_failed";
  }
}
