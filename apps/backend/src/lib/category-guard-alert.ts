import { getRedis } from "../clients/redis.js";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { EmailService } from "../services/email.service.js";
import { getEnv } from "../env.js";

// Fired when any signal created in the last 2 hours has a null event_category.
// 2-hour lookback and threshold of 1 signal are both DESIGN CHOICE, not measured.
// At most one email per UTC day. Dedup: SET alert:category-guard:<UTC date>
// 1 EX 129600 NX (36 hours). If Redis is unavailable, send no email.
// Same email path and one-per-day key pattern as collection-stalled-alert.ts
// and budget-warning-alert.ts. Added 2026-10-17.
type EmailSender = Pick<EmailService, "send">;
type RedisSetter = {
  set(key: string, value: string, exFlag: "EX", seconds: number, nxFlag: "NX"): Promise<"OK" | null>;
};

export type CategoryGuardSupabase = {
  from: (table: string) => any;
};

const DEDUPE_TTL_SECONDS = 129600;
// DESIGN CHOICE, not measured.
const LOOKBACK_MS = 2 * 60 * 60 * 1000;
// DESIGN CHOICE, not measured: any 1 uncategorized signal in the window triggers the alert.
const MIN_UNCATEGORIZED = 1;

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

export type CategoryGuardOutcome =
  | "sent"
  | "already_sent_today"
  | "redis_unavailable"
  | "redis_error"
  | "no_recipients"
  | "send_failed"
  | "below_threshold"
  | "query_failed";

export type CategoryGuardDeps = {
  redis?: RedisSetter | null;
  email?: EmailSender;
  now?: Date;
  uncategorizedCount?: number;
  supabase?: CategoryGuardSupabase;
};

async function loadUncategorizedCount(supabase: CategoryGuardSupabase, now: Date): Promise<number> {
  const since = new Date(now.getTime() - LOOKBACK_MS).toISOString();
  const { count, error } = await supabase
    .from("signals")
    .select("id", { count: "exact", head: true })
    .is("event_category", null)
    .gte("created_at", since);
  if (error) throw error;
  return count ?? 0;
}

function guardBody(date: string, uncategorizedCount: number): { text: string; html: string } {
  const line = `${uncategorizedCount} signal(s) created in the last 2 hours have no event_category.`;
  const text = `${date} (UTC)\n\n${line}`;
  const html = `<p>${date} (UTC)</p><p>${line}</p>`;
  return { text, html };
}

/**
 * At most one email per UTC day. Never throws. `deps` is for unit tests
 * (plain tsx + node:assert, no module mock). Production passes nothing.
 */
export async function checkCategoryGuard(deps: CategoryGuardDeps = {}): Promise<CategoryGuardOutcome> {
  try {
    let redis: RedisSetter | null;
    try {
      redis = deps.redis !== undefined ? deps.redis : getRedis();
    } catch (err: any) {
      loggedRedisUnavailable = warnOnce(
        loggedRedisUnavailable,
        `[category-guard-alert] Redis unavailable: ${err?.message ?? err} — sending NO email.`,
      );
      return "redis_unavailable";
    }
    if (!redis) {
      loggedRedisUnavailable = warnOnce(
        loggedRedisUnavailable,
        "[category-guard-alert] Redis unavailable — sending NO email.",
      );
      return "redis_unavailable";
    }

    const now = deps.now ?? new Date();
    const supabase = deps.supabase ?? getSupabaseAdmin();

    let uncategorizedCount: number;
    if (deps.uncategorizedCount !== undefined) {
      uncategorizedCount = deps.uncategorizedCount;
    } else {
      try {
        uncategorizedCount = await loadUncategorizedCount(supabase, now);
      } catch (err: any) {
        console.warn(
          `[category-guard-alert] could not read uncategorized signal count: ${err?.message ?? err} — sending NO email.`,
        );
        return "query_failed";
      }
    }

    if (uncategorizedCount < MIN_UNCATEGORIZED) return "below_threshold";

    const date = utcDateString(now);
    const key = `alert:category-guard:${date}`;

    let claimed: string | null;
    try {
      claimed = await redis.set(key, "1", "EX", DEDUPE_TTL_SECONDS, "NX");
    } catch (err: any) {
      console.warn(
        `[category-guard-alert] Redis SET NX failed: ${err?.message ?? err} — sending NO email.`,
      );
      return "redis_error";
    }
    if (!claimed) return "already_sent_today";

    const recipients = adminRecipients();
    if (recipients.length === 0) {
      loggedNoRecipients = warnOnce(
        loggedNoRecipients,
        "[category-guard-alert] ADMIN_EMAILS is empty — no alert email sent (today's dedupe flag is still set).",
      );
      return "no_recipients";
    }

    const email = deps.email ?? new EmailService();
    const subject = "BBR: Signals missing event_category";
    const { text, html } = guardBody(date, uncategorizedCount);

    let anySent = false;
    for (const to of recipients) {
      try {
        const result = await email.send({ to, subject, html, text });
        if (result.sent) {
          anySent = true;
        } else {
          console.warn(`[category-guard-alert] email send failed: ${result.reason}`);
        }
      } catch (err: any) {
        console.warn(`[category-guard-alert] email send threw: ${err?.message ?? err}`);
      }
    }
    return anySent ? "sent" : "send_failed";
  } catch (err: any) {
    console.warn(
      `[category-guard-alert] unexpected failure: ${err?.message ?? err} — sending NO email.`,
    );
    return "send_failed";
  }
}
