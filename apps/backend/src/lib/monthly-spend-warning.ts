import { getRedis } from "../clients/redis.js";
import { getEnv } from "../env.js";
import { EmailService } from "../services/email.service.js";
import { recordServiceHealth, type RecordServiceHealthOptions } from "./service-health.js";

// P10 — warn before the Anthropic Console monthly limit stops every call.
// The daily 50% / 90% levels in anthropic-budget.ts are the BBR convention
// reused here. Dedup matches spend-limit-alert.ts: SET key NX, and if Redis
// is unreachable send nothing.
type EmailSender = Pick<EmailService, "send">;
type RedisSetter = {
  set(key: string, value: string, exFlag: "EX", seconds: number, nxFlag: "NX"): Promise<"OK" | null>;
};

const LEVELS = [50, 90] as const;
const DEDUPE_TTL_SECONDS = 35 * 24 * 60 * 60;

export type MonthlySpendSupabase = {
  from: (table: string) => any;
};

export type MonthlySpendDeps = {
  redis?: RedisSetter | null;
  email?: EmailSender;
  recipients?: () => string[];
};

export type MonthlySpendResult =
  | { status: "disabled" }
  | { status: "checked"; month: string; sumUsd: number; limitUsd: number; emailedLevels: number[] };

function adminRecipients(): string[] {
  return (getEnv().ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

function monthWindow(now: Date): { start: string; end: string; label: string } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 10);
  return { start, end, label: start.slice(0, 7) };
}

function spendBody(month: string, sumUsd: number, limitUsd: number, level: number): { text: string; html: string } {
  const figures = `BBR's own estimate from logged calls is $${sumUsd.toFixed(2)} of a $${limitUsd.toFixed(2)} monthly limit (${level}%).`;
  const scope = "This counts only calls BBR logs. The Console may count more.";
  const action = "Raise the limit in the Console or lower the daily cap.";
  const text = `${month} (UTC)\n\n${figures}\n${scope}\n\n${action}`;
  const html = `<p>${month} (UTC)</p><p>${figures}</p><p>${scope}</p><p>${action}</p>`;
  return { text, html };
}

async function sumMonthUsd(
  supabase: MonthlySpendSupabase,
  start: string,
  end: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("anthropic_daily_usage")
    .select("estimated_usd, bucket")
    .gte("usage_date", start)
    .lt("usage_date", end);
  if (error) throw new Error(error.message ?? "anthropic_daily_usage read failed");
  let sum = 0;
  for (const row of (data ?? []) as Array<{ estimated_usd?: number | string }>) {
    const n = Number(row.estimated_usd ?? 0);
    if (Number.isFinite(n)) sum += n;
  }
  return sum;
}

async function writeMonthlyHealth(
  supabase: MonthlySpendSupabase,
  now: Date,
  month: string,
  sumUsd: number,
  limitUsd: number,
  pct: number,
): Promise<void> {
  const detail = `${month} BBR estimate $${sumUsd.toFixed(2)} of $${limitUsd.toFixed(2)} (${Math.round(pct * 100)}%)`;
  if (pct >= 0.9) {
    await recordServiceHealth("anthropic-monthly", "degraded", detail, undefined, {
      supabase: supabase as RecordServiceHealthOptions["supabase"],
    });
    return;
  }

  const dayStart = `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
  const { data, error } = await supabase
    .from("service_health_events")
    .select("id")
    .eq("service", "anthropic-monthly")
    .eq("status", "ok")
    .gte("created_at", dayStart)
    .limit(1);
  if (error) throw new Error(error.message ?? "service_health_events read failed");
  if (Array.isArray(data) && data.length > 0) return;
  await recordServiceHealth("anthropic-monthly", "ok", detail, undefined, {
    supabase: supabase as RecordServiceHealthOptions["supabase"],
  });
}

/**
 * Sum estimated_usd for the current UTC month across every bucket. Email each
 * crossed level (50, 90) at most once per month. Unset limit: no query, no email.
 */
export async function checkMonthlySpend(
  supabase: MonthlySpendSupabase,
  now: Date,
  deps: MonthlySpendDeps = {},
): Promise<MonthlySpendResult> {
  const limitUsd = getEnv().ANTHROPIC_MONTHLY_LIMIT_USD;
  if (limitUsd == null) return { status: "disabled" };

  const { start, end, label } = monthWindow(now);
  const sumUsd = await sumMonthUsd(supabase, start, end);
  const pct = limitUsd > 0 ? sumUsd / limitUsd : 0;

  const redis = deps.redis !== undefined ? deps.redis : getRedis();
  const emailedLevels: number[] = [];
  if (!redis) {
    console.warn("[monthly-spend-warning] Redis unavailable — sending no email.");
  } else {
    const recipients = (deps.recipients ?? adminRecipients)();
    const email = deps.email ?? new EmailService();
    for (const level of LEVELS) {
      if (pct < level / 100) continue;
      const key = `bbr:monthly-spend:${label}:${level}`;
      let claimed: "OK" | null;
      try {
        claimed = await redis.set(key, "1", "EX", DEDUPE_TTL_SECONDS, "NX");
      } catch (err: any) {
        console.warn(
          `[monthly-spend-warning] Redis SET NX failed: ${err?.message ?? err} — sending no email.`,
        );
        break;
      }
      if (!claimed) continue;
      if (recipients.length === 0) {
        console.warn(`[monthly-spend-warning] ADMIN_EMAILS is empty — no ${level}% email sent.`);
        continue;
      }
      const subject = `BBR: estimated Anthropic spend at ${level}% of the monthly limit`;
      const { text, html } = spendBody(label, sumUsd, limitUsd, level);
      for (const to of recipients) {
        const result = await email.send({ to, subject, html, text });
        if (!result.sent) {
          console.warn(`[monthly-spend-warning] email to ${to} failed: ${result.reason}`);
        }
      }
      emailedLevels.push(level);
    }
  }

  try {
    await writeMonthlyHealth(supabase, now, label, sumUsd, limitUsd, pct);
  } catch (err: any) {
    console.warn(`[monthly-spend-warning] health write failed: ${err?.message ?? err}`);
  }

  return { status: "checked", month: label, sumUsd, limitUsd, emailedLevels };
}
