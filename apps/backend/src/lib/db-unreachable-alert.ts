import { getRedis } from "../clients/redis.js";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { EmailService } from "../services/email.service.js";
import { getEnv } from "../env.js";

// BE-DBALERT1 — fired when the workers cannot reach Supabase at all, as opposed to a
// single collector failing. Every existing ops alert (collection-stalled-alert.ts,
// budget-warning-alert.ts, category-guard-alert.ts) reads the database to decide
// whether to fire, so none of them can fire during a database outage. This check only
// touches Redis (dedupe/counter) and Resend (the email), both separate services from
// Supabase, so it still works while the database itself is down. 3 consecutive
// failures, the 5-minute cron (set in workers.ts), the 10-second probe timeout, and the
// 6-hour re-alert interval are engineering choices with no outside source — not derived
// from an SLA, a vendor doc, or an incident post-mortem.
type EmailSender = Pick<EmailService, "send">;

// Same narrowing reasoning as spend-limit-alert.ts's RedisSetter: ioredis's overloaded
// `set()` typing collapses to a signature returning only `Promise<"OK">` once picked via
// `Pick<Redis, ...>`, which doesn't match the real NX-variant return type
// (`"OK" | null`) this relies on. This lists exactly the call shapes used below, for the
// real client and for tests' fake Redis alike.
type DbHealthRedis = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  set(key: string, value: string, exFlag: "EX", seconds: number, nxFlag: "NX"): Promise<"OK" | null>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  get(key: string): Promise<string | null>;
};

export type DbProbeSupabase = {
  from: (table: string) => any;
};

const FAILURES_KEY = "db-health:consecutive-failures";
const FIRST_FAILURE_KEY = "db-health:first-failure-at";
const SENT_KEY = "alert:db-unreachable:sent";

const FAILURES_TTL_SECONDS = 3600;
const FIRST_FAILURE_TTL_SECONDS = 86400;
const SENT_TTL_SECONDS = 21600;
const FAILURE_THRESHOLD = 3;
const DEFAULT_TIMEOUT_MS = 10_000;

function adminRecipients(): string[] {
  return (getEnv().ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

export type DbUnreachableOutcome =
  | "ok"
  | "recovered"
  | "failure_recorded"
  | "sent"
  | "already_sent"
  | "redis_unavailable"
  | "redis_error"
  | "no_recipients"
  | "send_failed";

export type DbUnreachableDeps = {
  supabase?: DbProbeSupabase;
  redis?: DbHealthRedis | null;
  email?: EmailSender;
  now?: Date;
  timeoutMs?: number;
};

// One read, aborted after timeoutMs. A timeout, a thrown error, or a returned
// Postgrest error all count as a failed probe.
async function probeDatabase(supabase: DbProbeSupabase, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let query: any = supabase.from("signals").select("id").limit(1);
    if (typeof query.abortSignal === "function") {
      query = query.abortSignal(controller.signal);
    }
    const timedOut = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener("abort", () => reject(new Error("db probe timed out")));
    });
    const { error } = await Promise.race([query, timedOut]);
    return !error;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function sendToAdmins(
  email: EmailSender | undefined,
  subject: string,
  text: string,
  html: string,
): Promise<"sent" | "no_recipients" | "send_failed"> {
  const recipients = adminRecipients();
  if (recipients.length === 0) {
    console.warn("[db-unreachable-alert] ADMIN_EMAILS is empty — no alert email sent.");
    return "no_recipients";
  }

  const emailClient = email ?? new EmailService();
  let anySent = false;
  for (const to of recipients) {
    try {
      const result = await emailClient.send({ to, subject, html, text });
      if (result.sent) {
        anySent = true;
      } else {
        console.warn(`[db-unreachable-alert] email to ${to} failed: ${result.reason}`);
      }
    } catch (err: any) {
      console.warn(`[db-unreachable-alert] email send threw: ${err?.message ?? err}`);
    }
  }
  return anySent ? "sent" : "send_failed";
}

async function recordFailure(
  redis: DbHealthRedis,
  email: EmailSender | undefined,
  now: Date,
): Promise<DbUnreachableOutcome> {
  let count: number;
  try {
    count = await redis.incr(FAILURES_KEY);
    await redis.expire(FAILURES_KEY, FAILURES_TTL_SECONDS);
  } catch (err: any) {
    console.warn(`[db-unreachable-alert] Redis INCR failed: ${err?.message ?? err} — sending NO email.`);
    return "redis_error";
  }

  if (count === 1) {
    try {
      await redis.set(FIRST_FAILURE_KEY, now.toISOString(), "EX", FIRST_FAILURE_TTL_SECONDS, "NX");
    } catch (err: any) {
      console.warn(`[db-unreachable-alert] Redis SET (first-failure-at) failed: ${err?.message ?? err}`);
    }
  }

  if (count < FAILURE_THRESHOLD) {
    return "failure_recorded";
  }

  let claimed: string | null;
  try {
    claimed = await redis.set(SENT_KEY, "1", "EX", SENT_TTL_SECONDS, "NX");
  } catch (err: any) {
    console.warn(`[db-unreachable-alert] Redis SET NX failed: ${err?.message ?? err} — sending NO email.`);
    return "redis_error";
  }
  if (!claimed) {
    return "already_sent";
  }

  const utcNow = now.toISOString();
  const subject = "BBR: database not reachable";
  const body =
    "The workers could not reach the database for 3 checks in a row. Prices, signals and digests may " +
    "be missing for this window. Check the Supabase dashboard (Reports) and the project status.";
  const text = `${utcNow} (UTC)\n\n${body}`;
  const html = `<p>${utcNow} (UTC)</p><p>${body}</p>`;

  return sendToAdmins(email, subject, text, html);
}

async function recordSuccess(
  redis: DbHealthRedis,
  email: EmailSender | undefined,
  now: Date,
): Promise<DbUnreachableOutcome> {
  try {
    await redis.del(FAILURES_KEY);
  } catch (err: any) {
    console.warn(`[db-unreachable-alert] Redis DEL failed: ${err?.message ?? err}`);
    return "redis_error";
  }

  let wasAlerting: number;
  try {
    wasAlerting = await redis.exists(SENT_KEY);
  } catch (err: any) {
    console.warn(`[db-unreachable-alert] Redis EXISTS failed: ${err?.message ?? err}`);
    return "redis_error";
  }
  if (!wasAlerting) {
    return "ok";
  }

  let firstFailureAt: string | null = null;
  try {
    firstFailureAt = await redis.get(FIRST_FAILURE_KEY);
  } catch (err: any) {
    console.warn(`[db-unreachable-alert] Redis GET (first-failure-at) failed: ${err?.message ?? err}`);
  }

  const recoveredAt = now.toISOString();
  const firstFailureLine = firstFailureAt
    ? `First failure: ${firstFailureAt} (UTC).`
    : "First failure time unknown.";
  const subject = "BBR: database reachable again";
  const body = `${firstFailureLine} Recovery: ${recoveredAt} (UTC). Check price, signal and digest gaps.`;
  const text = `${recoveredAt} (UTC)\n\n${body}`;
  const html = `<p>${recoveredAt} (UTC)</p><p>${body}</p>`;

  const sendOutcome = await sendToAdmins(email, subject, text, html);

  try {
    await redis.del(SENT_KEY);
    await redis.del(FIRST_FAILURE_KEY);
  } catch (err: any) {
    console.warn(`[db-unreachable-alert] Redis DEL (post-recovery) failed: ${err?.message ?? err}`);
  }

  return sendOutcome === "sent" ? "recovered" : sendOutcome;
}

/**
 * Probes the database once and tracks consecutive failures in Redis — a separate
 * service from Supabase, so this keeps working during a database outage. Never throws:
 * callers (workers.ts's cron handler) still wrap this in their own try/catch, but this
 * function itself never throws on a Redis, Supabase, or Resend failure.
 *
 * `deps` exists only so unit tests can inject fakes without a module-mocking framework
 * (this repo's test runner is plain tsx + node:assert). Production call sites pass
 * nothing and get the real getRedis()/getSupabaseAdmin()/EmailService.
 */
export async function checkDatabaseReachable(deps: DbUnreachableDeps = {}): Promise<DbUnreachableOutcome> {
  try {
    let redis: DbHealthRedis | null;
    try {
      redis = deps.redis !== undefined ? deps.redis : (getRedis() as unknown as DbHealthRedis | null);
    } catch (err: any) {
      console.warn(`[db-unreachable-alert] Redis unavailable: ${err?.message ?? err} — doing nothing.`);
      return "redis_unavailable";
    }
    if (!redis) {
      console.warn("[db-unreachable-alert] Redis unavailable — doing nothing.");
      return "redis_unavailable";
    }

    const now = deps.now ?? new Date();
    const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const supabase = deps.supabase ?? (getSupabaseAdmin() as unknown as DbProbeSupabase);

    const reachable = await probeDatabase(supabase, timeoutMs);

    return reachable ? await recordSuccess(redis, deps.email, now) : await recordFailure(redis, deps.email, now);
  } catch (err: any) {
    console.warn(`[db-unreachable-alert] unexpected failure: ${err?.message ?? err} — doing nothing.`);
    return "redis_error";
  }
}
