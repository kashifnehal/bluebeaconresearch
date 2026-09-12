import { getSupabaseAdmin } from "../clients/supabase.js";
import { getEnv } from "../env.js";
import { EmailService } from "../services/email.service.js";

export type AnthropicBudgetBucket = "ingestion" | "chat";

export class AnthropicBudgetExceededError extends Error {
  readonly bucket: AnthropicBudgetBucket;
  constructor(bucket: AnthropicBudgetBucket) {
    super(`anthropic_daily_budget_exceeded:${bucket}`);
    this.name = "AnthropicBudgetExceededError";
    this.bucket = bucket;
  }
}

export const CHAT_BUDGET_EXCEEDED_MESSAGE =
  "BBR's AI usage limit for today has been reached, please try again tomorrow";

// Published list prices used only for the running estimate — not billed invoices.
// Haiku 4.5 figures match the #53 backfill quote ($1 / $5 per MTok). Sonnet 5
// is the current published $3 / $15 per MTok pair.
const PRICE_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 3, output: 15 },
};

const DEFAULT_DAILY_BUDGET_USD = 2;

let warnedMissingIngestion = false;
let warnedMissingChat = false;

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = PRICE_USD_PER_MTOK[model] ?? PRICE_USD_PER_MTOK["claude-sonnet-5"];
  const input = Math.max(0, inputTokens) / 1_000_000;
  const output = Math.max(0, outputTokens) / 1_000_000;
  return Number((input * price.input + output * price.output).toFixed(6));
}

export function utcUsageDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function parseBudgetEnv(raw: string | undefined, bucket: AnthropicBudgetBucket): number {
  const trimmed = raw?.trim();
  if (!trimmed) {
    if (bucket === "ingestion" && !warnedMissingIngestion) {
      warnedMissingIngestion = true;
      console.warn(
        `[ANTHROPIC BUDGET] ANTHROPIC_DAILY_BUDGET_USD_INGESTION unset — defaulting to $${DEFAULT_DAILY_BUDGET_USD}/day`,
      );
    }
    if (bucket === "chat" && !warnedMissingChat) {
      warnedMissingChat = true;
      console.warn(
        `[ANTHROPIC BUDGET] ANTHROPIC_DAILY_BUDGET_USD_CHAT unset — defaulting to $${DEFAULT_DAILY_BUDGET_USD}/day`,
      );
    }
    return DEFAULT_DAILY_BUDGET_USD;
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DAILY_BUDGET_USD;
  return n;
}

export function getDailyBudgetUsd(bucket: AnthropicBudgetBucket): number {
  const env = getEnv();
  if (bucket === "ingestion") {
    return parseBudgetEnv(env.ANTHROPIC_DAILY_BUDGET_USD_INGESTION, "ingestion");
  }
  return parseBudgetEnv(env.ANTHROPIC_DAILY_BUDGET_USD_CHAT, "chat");
}

type UsageRow = {
  estimated_usd: number | string;
  input_tokens?: number | string;
  output_tokens?: number | string;
  call_count?: number | string;
  warned_50: boolean;
  warned_90: boolean;
  chat_50pct_emailed_at: string | null;
};

function asNumber(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function rowUsd(row: UsageRow | null): number {
  return row ? asNumber(row.estimated_usd) : 0;
}

async function readToday(bucket: AnthropicBudgetBucket): Promise<UsageRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("anthropic_daily_usage")
    .select(
      "estimated_usd, input_tokens, output_tokens, call_count, warned_50, warned_90, chat_50pct_emailed_at",
    )
    .eq("usage_date", utcUsageDate())
    .eq("bucket", bucket)
    .maybeSingle();
  if (error) throw error;
  return (data as UsageRow | null) ?? null;
}

/**
 * Production fails closed on a counter read error (skip the paid call).
 * Non-production fails open so unit tests / local runs without the table
 * still exercise the mocked Anthropic client.
 */
export async function isAnthropicBudgetAvailable(
  bucket: AnthropicBudgetBucket,
): Promise<boolean> {
  const cap = getDailyBudgetUsd(bucket);
  try {
    const row = await readToday(bucket);
    return rowUsd(row) < cap;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[ANTHROPIC BUDGET] ${bucket} counter read failed: ${message}`);
    return process.env.NODE_ENV !== "production";
  }
}

export async function assertAnthropicBudget(bucket: AnthropicBudgetBucket): Promise<void> {
  if (!(await isAnthropicBudgetAvailable(bucket))) {
    throw new AnthropicBudgetExceededError(bucket);
  }
}

function adminAlertEmails(): string[] {
  return (getEnv().ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function maybeNotifyThresholds(
  bucket: AnthropicBudgetBucket,
  spent: number,
  cap: number,
  row: UsageRow | null,
): Promise<void> {
  if (cap <= 0) return;
  const pct = spent / cap;
  const supabase = getSupabaseAdmin();
  const date = utcUsageDate();

  if (pct >= 0.9 && !row?.warned_90) {
    console.error(
      `[ANTHROPIC BUDGET] 90%+ of ${bucket} daily cap used ($${spent.toFixed(2)}/$${cap.toFixed(2)})`,
    );
    await supabase
      .from("anthropic_daily_usage")
      .update({ warned_90: true, warned_50: true, updated_at: new Date().toISOString() })
      .eq("usage_date", date)
      .eq("bucket", bucket);
  } else if (pct >= 0.5 && !row?.warned_50) {
    console.warn(
      `[ANTHROPIC BUDGET] 50%+ of ${bucket} daily cap used ($${spent.toFixed(2)}/$${cap.toFixed(2)})`,
    );
    await supabase
      .from("anthropic_daily_usage")
      .update({ warned_50: true, updated_at: new Date().toISOString() })
      .eq("usage_date", date)
      .eq("bucket", bucket);
  }

  if (
    bucket === "chat" &&
    pct >= 0.5 &&
    !row?.chat_50pct_emailed_at
  ) {
    const recipients = adminAlertEmails();
    if (recipients.length === 0) {
      console.warn(
        "[ANTHROPIC BUDGET] chat 50% threshold hit but ADMIN_EMAILS is empty — no alert email sent",
      );
      return;
    }
    try {
      const email = new EmailService();
      const subject = `BBR chat AI budget is at ${Math.round(pct * 100)}% of today's cap`;
      const text =
        `The #111 chat budget (ANTHROPIC_DAILY_BUDGET_USD_CHAT) is at $${spent.toFixed(2)} of $${cap.toFixed(2)} today (UTC).\n\n` +
        `Raise the Railway env var if this is real demand, before legitimate users get the daily-limit message.`;
      const html = `<p>${text.replace(/\n/g, "<br/>")}</p>`;
      for (const to of recipients) {
        const result = await email.send({ to, subject, html, text });
        if (!result.sent) {
          console.warn(`[ANTHROPIC BUDGET] chat 50% email to ${to} failed: ${result.reason}`);
        }
      }
      await supabase
        .from("anthropic_daily_usage")
        .update({
          chat_50pct_emailed_at: new Date().toISOString(),
          warned_50: true,
          updated_at: new Date().toISOString(),
        })
        .eq("usage_date", date)
        .eq("bucket", bucket);
    } catch (err) {
      console.warn(
        `[ANTHROPIC BUDGET] chat 50% email threw: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

export async function recordAnthropicUsage(opts: {
  bucket: AnthropicBudgetBucket;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  const cost = estimateCostUsd(opts.model, opts.inputTokens, opts.outputTokens);
  const date = utcUsageDate();
  const cap = getDailyBudgetUsd(opts.bucket);
  try {
    const supabase = getSupabaseAdmin();
    const existing = await readToday(opts.bucket);
    const next: UsageRow = {
      estimated_usd: rowUsd(existing) + cost,
      input_tokens: asNumber(existing?.input_tokens) + Math.max(0, opts.inputTokens),
      output_tokens: asNumber(existing?.output_tokens) + Math.max(0, opts.outputTokens),
      call_count: asNumber(existing?.call_count) + 1,
      warned_50: existing?.warned_50 ?? false,
      warned_90: existing?.warned_90 ?? false,
      chat_50pct_emailed_at: existing?.chat_50pct_emailed_at ?? null,
    };

    const payload = {
      usage_date: date,
      bucket: opts.bucket,
      estimated_usd: next.estimated_usd,
      input_tokens: next.input_tokens,
      output_tokens: next.output_tokens,
      call_count: next.call_count,
      updated_at: new Date().toISOString(),
    };

    const { error } = existing
      ? await supabase
          .from("anthropic_daily_usage")
          .update(payload)
          .eq("usage_date", date)
          .eq("bucket", opts.bucket)
      : await supabase.from("anthropic_daily_usage").insert(payload);

    if (error) throw error;
    await maybeNotifyThresholds(opts.bucket, asNumber(next.estimated_usd), cap, existing);
  } catch (err) {
    console.warn(
      `[ANTHROPIC BUDGET] failed to record ${opts.bucket} usage: ${err instanceof Error ? err.message : err}`,
    );
  }
}
