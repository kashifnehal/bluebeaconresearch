import { getRedis } from "../clients/redis.js";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { EmailService } from "../services/email.service.js";
import { getEnv } from "../env.js";

// 2026-10-27 — fired when the "signals" table (created_at
// column, same table/column the #83 digest and category-guard-alert.ts already
// count against) gets ZERO new rows in the trailing 24 hours. At most one email
// per UTC day. Dedup: SET alert:signal-silence:<UTC date> 1 EX 129600 NX (36
// hours) — same email path and one-per-day key pattern as
// category-guard-alert.ts/collection-stalled-alert.ts. If Redis is unavailable,
// send no email.
//
// 24 hours is a DESIGN CHOICE, not a measured threshold: normal days ran 69-75
// signals (2026-10-14 to 2026-10-18) and 112 signals (2026-10-27), so a full day
// of zero is unambiguously abnormal, but no statistical cutoff was computed.
const LOOKBACK_HOURS = 24;
const DEDUPE_TTL_SECONDS = 129600;

type EmailSender = Pick<EmailService, "send">;
type RedisSetter = {
  set(key: string, value: string, exFlag: "EX", seconds: number, nxFlag: "NX"): Promise<"OK" | null>;
};

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

export type SignalSilenceOutcome =
  | "sent"
  | "already_sent_today"
  | "redis_unavailable"
  | "redis_error"
  | "no_recipients"
  | "send_failed"
  | "signals_present"
  | "query_failed";

export type SignalSilenceDeps = {
  redis?: RedisSetter | null;
  email?: EmailSender;
  now?: Date;
  countRecentSignals?: (hours: number) => Promise<number>;
};

async function defaultCountRecentSignals(hours: number, now: Date): Promise<number> {
  const since = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
  const { count, error } = await getSupabaseAdmin()
    .from("signals")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  if (error) throw error;
  return count ?? 0;
}

function silenceBody(date: string): { text: string; html: string } {
  const line =
    "No new signals were created in the last 24 hours. Check Anthropic credit and the API key, " +
    "the ingestion budget cap, and the Railway workers logs.";
  return {
    text: `${date} (UTC)\n\n${line}`,
    html: `<p>${date} (UTC)</p><p>${line}</p>`,
  };
}

/**
 * At most one email per UTC day. Never throws. `deps` is for unit tests
 * (plain tsx + node:assert, no module mock). Production passes nothing.
 */
export async function checkSignalSilence(deps: SignalSilenceDeps = {}): Promise<SignalSilenceOutcome> {
  try {
    let redis: RedisSetter | null;
    try {
      redis = deps.redis !== undefined ? deps.redis : getRedis();
    } catch (err: any) {
      loggedRedisUnavailable = warnOnce(
        loggedRedisUnavailable,
        `[signal-silence-alert] Redis unavailable: ${err?.message ?? err} — sending NO email.`,
      );
      return "redis_unavailable";
    }
    if (!redis) {
      loggedRedisUnavailable = warnOnce(
        loggedRedisUnavailable,
        "[signal-silence-alert] Redis unavailable — sending NO email.",
      );
      return "redis_unavailable";
    }

    const now = deps.now ?? new Date();

    const countRecentSignals = deps.countRecentSignals ?? ((hours: number) => defaultCountRecentSignals(hours, now));
    let recentCount: number;
    try {
      recentCount = await countRecentSignals(LOOKBACK_HOURS);
    } catch (err: any) {
      console.warn(
        `[signal-silence-alert] could not read recent signal count: ${err?.message ?? err} — sending NO email.`,
      );
      return "query_failed";
    }

    if (recentCount > 0) return "signals_present";

    const date = utcDateString(now);
    const key = `alert:signal-silence:${date}`;

    let claimed: string | null;
    try {
      claimed = await redis.set(key, "1", "EX", DEDUPE_TTL_SECONDS, "NX");
    } catch (err: any) {
      console.warn(`[signal-silence-alert] Redis SET NX failed: ${err?.message ?? err} — sending NO email.`);
      return "redis_error";
    }
    if (!claimed) return "already_sent_today";

    const recipients = adminRecipients();
    if (recipients.length === 0) {
      loggedNoRecipients = warnOnce(
        loggedNoRecipients,
        "[signal-silence-alert] ADMIN_EMAILS is empty — no alert email sent (today's dedupe flag is still set).",
      );
      return "no_recipients";
    }

    const email = deps.email ?? new EmailService();
    const subject = "BBR: no new signals in 24 hours";
    const { text, html } = silenceBody(date);

    let anySent = false;
    for (const to of recipients) {
      try {
        const result = await email.send({ to, subject, html, text });
        if (result.sent) {
          anySent = true;
        } else {
          console.warn(`[signal-silence-alert] email send failed: ${result.reason}`);
        }
      } catch (err: any) {
        console.warn(`[signal-silence-alert] email send threw: ${err?.message ?? err}`);
      }
    }
    return anySent ? "sent" : "send_failed";
  } catch (err: any) {
    console.warn(`[signal-silence-alert] unexpected failure: ${err?.message ?? err} — sending NO email.`);
    return "send_failed";
  }
}
