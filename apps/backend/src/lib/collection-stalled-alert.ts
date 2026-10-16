import { getRedis } from "../clients/redis.js";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { EmailService } from "../services/email.service.js";
import { getEnv } from "../env.js";
import { getDailyBudgetUsd } from "./anthropic-budget.js";

// Fired when today's ingestion budget is still open and the newest
// raw_events.created_at is older than 90 minutes. 90 minutes is an
// engineering choice with no source (three missed 30-minute cycles).
// At most one email per UTC day. Dedup: SET alert:collection-stalled:<UTC date>
// 1 EX 129600 NX (36 hours). If Redis is unavailable, send no email.
// Added 2026-10-16.
type EmailSender = Pick<EmailService, "send">;
type RedisSetter = {
  set(key: string, value: string, exFlag: "EX", seconds: number, nxFlag: "NX"): Promise<"OK" | null>;
};

export type CollectionStalledSupabase = {
  from: (table: string) => any;
};

const DEDUPE_TTL_SECONDS = 129600;
const STALL_THRESHOLD_MS = 90 * 60 * 1000;

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

export type CollectionStalledOutcome =
  | "sent"
  | "already_sent_today"
  | "redis_unavailable"
  | "redis_error"
  | "no_recipients"
  | "send_failed"
  | "budget_closed"
  | "not_stalled"
  | "query_failed";

export type CollectionStalledDeps = {
  redis?: RedisSetter | null;
  email?: EmailSender;
  now?: Date;
  spentUsd?: number;
  capUsd?: number;
  newestCreatedAt?: Date | null;
  supabase?: CollectionStalledSupabase;
};

async function loadIngestionSpendAndCap(
  supabase: CollectionStalledSupabase,
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

// One row, newest created_at. Live check 2026-10-16: public.raw_events has
// no index on created_at (only pkey, unique (source, external_id),
// idx_raw_events_dedup, and a partial materiality_checked_at index).
// No migration added.
async function loadNewestCreatedAt(supabase: CollectionStalledSupabase): Promise<Date | null> {
  const { data, error } = await supabase
    .from("raw_events")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const raw = (data as { created_at?: string } | null)?.created_at;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function stallBody(date: string, ageMinutes: number | null, spentUsd: number): { text: string; html: string } {
  const ageLine =
    ageMinutes == null
      ? "No raw_events rows found."
      : `Newest raw_events row is ${ageMinutes} minutes old.`;
  const spendLine = `Daily spend so far: $${spentUsd.toFixed(2)}.`;
  const text = `${date} (UTC)\n\n${ageLine}\n${spendLine}`;
  const html = `<p>${date} (UTC)</p><p>${ageLine}</p><p>${spendLine}</p>`;
  return { text, html };
}

/**
 * At most one email per UTC day. Never throws. `deps` is for unit tests
 * (plain tsx + node:assert, no module mock). Production passes nothing.
 */
export async function checkCollectionStalled(
  deps: CollectionStalledDeps = {},
): Promise<CollectionStalledOutcome> {
  try {
    let redis: RedisSetter | null;
    try {
      redis = deps.redis !== undefined ? deps.redis : getRedis();
    } catch (err: any) {
      loggedRedisUnavailable = warnOnce(
        loggedRedisUnavailable,
        `[collection-stalled-alert] Redis unavailable: ${err?.message ?? err} — sending NO email.`,
      );
      return "redis_unavailable";
    }
    if (!redis) {
      loggedRedisUnavailable = warnOnce(
        loggedRedisUnavailable,
        "[collection-stalled-alert] Redis unavailable — sending NO email.",
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
          `[collection-stalled-alert] could not read ingestion spend/cap: ${err?.message ?? err} — sending NO email.`,
        );
        return "query_failed";
      }
    }

    if (spentUsd >= capUsd) return "budget_closed";

    let newest: Date | null;
    if (deps.newestCreatedAt !== undefined) {
      newest = deps.newestCreatedAt;
    } else {
      try {
        newest = await loadNewestCreatedAt(supabase);
      } catch (err: any) {
        console.warn(
          `[collection-stalled-alert] could not read newest raw_events.created_at: ${err?.message ?? err} — sending NO email.`,
        );
        return "query_failed";
      }
    }

    const ageMs = newest ? now.getTime() - newest.getTime() : Number.POSITIVE_INFINITY;
    if (ageMs < STALL_THRESHOLD_MS) return "not_stalled";
    const ageMinutes = newest ? Math.floor(ageMs / 60000) : null;

    const date = utcDateString(now);
    const key = `alert:collection-stalled:${date}`;

    let claimed: string | null;
    try {
      claimed = await redis.set(key, "1", "EX", DEDUPE_TTL_SECONDS, "NX");
    } catch (err: any) {
      console.warn(
        `[collection-stalled-alert] Redis SET NX failed: ${err?.message ?? err} — sending NO email.`,
      );
      return "redis_error";
    }
    if (!claimed) return "already_sent_today";

    const recipients = adminRecipients();
    if (recipients.length === 0) {
      loggedNoRecipients = warnOnce(
        loggedNoRecipients,
        "[collection-stalled-alert] ADMIN_EMAILS is empty — no alert email sent (today's dedupe flag is still set).",
      );
      return "no_recipients";
    }

    const email = deps.email ?? new EmailService();
    const subject = "BBR: Collection looks stalled";
    const { text, html } = stallBody(date, ageMinutes, spentUsd);

    let anySent = false;
    for (const to of recipients) {
      try {
        const result = await email.send({ to, subject, html, text });
        if (result.sent) {
          anySent = true;
        } else {
          console.warn(`[collection-stalled-alert] email send failed: ${result.reason}`);
        }
      } catch (err: any) {
        console.warn(`[collection-stalled-alert] email send threw: ${err?.message ?? err}`);
      }
    }
    return anySent ? "sent" : "send_failed";
  } catch (err: any) {
    console.warn(
      `[collection-stalled-alert] unexpected failure: ${err?.message ?? err} — sending NO email.`,
    );
    return "send_failed";
  }
}
