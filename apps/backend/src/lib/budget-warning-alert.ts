import { getRedis } from "../clients/redis.js";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { EmailService } from "../services/email.service.js";
import { getEnv } from "../env.js";
import { getDailyBudgetUsd } from "./anthropic-budget.js";

// Fired when today's ingestion spend is at or above 80% of the daily cap
// and the cap is not yet closed. 80% is an engineering choice with no source.
// At most one email per UTC day. Dedup: SET alert:budget-warning:<UTC date>
// 1 EX 129600 NX (36 hours). If Redis is unavailable, send no email.
// Added 2026-10-16.
type EmailSender = Pick<EmailService, "send">;
type RedisSetter = {
  set(key: string, value: string, exFlag: "EX", seconds: number, nxFlag: "NX"): Promise<"OK" | null>;
};

export type BudgetWarningSupabase = {
  from: (table: string) => any;
};

const DEDUPE_TTL_SECONDS = 129600;
const WARNING_FRACTION = 0.8;

let loggedRedisUnavailable = false;
let loggedNoRecipients = false;

function utcDateString(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function adminRecipients(): string[] {
  return (getEnv().ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

function warnOnce(already: boolean, message: string): true {
  if (!already) console.warn(message);
  return true;
}

export type BudgetWarningOutcome =
  | "sent"
  | "already_sent_today"
  | "redis_unavailable"
  | "redis_error"
  | "no_recipients"
  | "send_failed"
  | "budget_closed"
  | "below_threshold"
  | "query_failed";

export type BudgetWarningDeps = {
  redis?: RedisSetter | null;
  email?: EmailSender;
  now?: Date;
  spentUsd?: number;
  capUsd?: number;
  supabase?: BudgetWarningSupabase;
};

async function loadIngestionSpendAndCap(
  supabase: BudgetWarningSupabase,
  now: Date,
): Promise<{ spentUsd: number; capUsd: number }> {
  const capUsd = getDailyBudgetUsd("ingestion");
  const date = utcDateString(now);
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

function warningBody(now: Date, spentUsd: number, capUsd: number): { text: string; html: string } {
  const date = utcDateString(now);
  const figures = `$${spentUsd.toFixed(2)} of $${capUsd.toFixed(2)}`;
  const when = now.toISOString();
  const text = `${date} (UTC)\n\n${figures}\nChecked at ${when}`;
  const html = `<p>${date} (UTC)</p><p>${figures}</p><p>Checked at ${when}</p>`;
  return { text, html };
}

/**
 * At most one email per UTC day. Never throws. `deps` is for unit tests
 * (plain tsx + node:assert, no module mock). Production passes nothing.
 */
export async function checkBudgetNearCap(deps: BudgetWarningDeps = {}): Promise<BudgetWarningOutcome> {
  try {
    let redis: RedisSetter | null;
    try {
      redis = deps.redis !== undefined ? deps.redis : getRedis();
    } catch (err: any) {
      loggedRedisUnavailable = warnOnce(
        loggedRedisUnavailable,
        `[budget-warning-alert] Redis unavailable: ${err?.message ?? err} — sending NO email.`,
      );
      return "redis_unavailable";
    }
    if (!redis) {
      loggedRedisUnavailable = warnOnce(
        loggedRedisUnavailable,
        "[budget-warning-alert] Redis unavailable — sending NO email.",
      );
      return "redis_unavailable";
    }

    const now = deps.now ?? new Date();
    const supabase = deps.supabase ?? getSupabaseAdmin();

    let spentUsd: number;
    let capUsd: number;
    if (deps.spentUsd !== undefined && deps.capUsd !== undefined) {
      spentUsd = deps.spentUsd;
      capUsd = deps.capUsd;
    } else {
      try {
        const loaded = await loadIngestionSpendAndCap(supabase, now);
        spentUsd = loaded.spentUsd;
        capUsd = loaded.capUsd;
      } catch (err: any) {
        console.warn(
          `[budget-warning-alert] could not read ingestion spend/cap: ${err?.message ?? err} — sending NO email.`,
        );
        return "query_failed";
      }
    }

    if (capUsd <= 0 || spentUsd >= capUsd) return "budget_closed";
    if (spentUsd < capUsd * WARNING_FRACTION) return "below_threshold";

    const date = utcDateString(now);
    const key = `alert:budget-warning:${date}`;

    let claimed: string | null;
    try {
      claimed = await redis.set(key, "1", "EX", DEDUPE_TTL_SECONDS, "NX");
    } catch (err: any) {
      console.warn(
        `[budget-warning-alert] Redis SET NX failed: ${err?.message ?? err} — sending NO email.`,
      );
      return "redis_error";
    }
    if (!claimed) return "already_sent_today";

    const recipients = adminRecipients();
    if (recipients.length === 0) {
      loggedNoRecipients = warnOnce(
        loggedNoRecipients,
        "[budget-warning-alert] ADMIN_EMAILS is empty — no alert email sent (today's dedupe flag is still set).",
      );
      return "no_recipients";
    }

    const email = deps.email ?? new EmailService();
    const subject = "BBR: Daily AI budget is 80% used";
    const { text, html } = warningBody(now, spentUsd, capUsd);

    let anySent = false;
    for (const to of recipients) {
      try {
        const result = await email.send({ to, subject, html, text });
        if (result.sent) {
          anySent = true;
        } else {
          console.warn(`[budget-warning-alert] email send failed: ${result.reason}`);
        }
      } catch (err: any) {
        console.warn(`[budget-warning-alert] email send threw: ${err?.message ?? err}`);
      }
    }
    return anySent ? "sent" : "send_failed";
  } catch (err: any) {
    console.warn(
      `[budget-warning-alert] unexpected failure: ${err?.message ?? err} — sending NO email.`,
    );
    return "send_failed";
  }
}
