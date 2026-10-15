import { config } from "dotenv";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Both src/env.ts and dist/env.js are 3 levels deep from the project root (.env)
// e.g. apps/backend/src -> apps/backend -> apps -> root
const envPath = resolve(__dirname, "../../../.env");
const localEnvPath = resolve(__dirname, "../../../.env.local");

const envConfig = config({ path: envPath });
const localConfig = config({ path: localEnvPath, override: true });

if (process.env.NODE_ENV !== "production") {
  console.log(`[API Environment] Loading from: ${envPath} (${envConfig.error ? "NOT FOUND" : "LOADED"})`);
  console.log(`[API Environment] Loading from: ${localEnvPath} (${localConfig.error ? "NOT FOUND" : "LOADED"})`);
}

import { z } from "zod";

// Number 0..1; unset, blank or invalid values fall back to the default instead of failing startup.
const rateEnv = (fallback: number) =>
  z.preprocess((v) => {
    if (v === undefined || v === null || String(v).trim() === "") return fallback;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
  }, z.number().min(0).max(1));

// Integer >= 0. Unset or blank uses the fallback; anything else must parse.
const nonNegIntEnv = (fallback: number) =>
  z.preprocess((v) => {
    if (v === undefined || v === null || String(v).trim() === "") return fallback;
    return v;
  }, z.coerce.number().int().min(0));

// Integer >= 1. Unset or blank uses the fallback; anything else must parse.
const positiveIntEnv = (fallback: number) =>
  z.preprocess((v) => {
    if (v === undefined || v === null || String(v).trim() === "") return fallback;
    return v;
  }, z.coerce.number().int().min(1));

// Positive number. Unset or blank stays unset. Anything else must parse as > 0.
const optionalPositiveEnv = z.preprocess((v) => {
  if (v === undefined || v === null || String(v).trim() === "") return undefined;
  return v;
}, z.coerce.number().positive().optional());
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  PORT: z.coerce.number().int().positive().default(3001),

  NEXT_PUBLIC_APP_URL: z.string().url().optional(),

  // Comma-separated allowlist of email addresses permitted to call the
  // founder-internal GET /v1/admin/* routes. Unset => nobody is admin (fail closed).
  ADMIN_EMAILS: z.string().optional(),

  // Manual early-access gate for #111 chat — replace once real billing (#84) exists.
  // Unset / empty => nobody can use chat (fail closed). Not the same as ADMIN_EMAILS.
  CHAT_ALLOWED_EMAILS: z.string().optional(),

  // Independent daily Anthropic ceilings (USD, UTC day). Defaults live in
  // anthropic-budget.ts ($2 each) when unset.
  ANTHROPIC_DAILY_BUDGET_USD_INGESTION: z.string().optional(),
  ANTHROPIC_DAILY_BUDGET_USD_CHAT: z.string().optional(),
  // Shadow materiality-gate prompt experiment (gate-shadow.ts). Default $0.50/day
  // — getDailyBudgetUsd's shadow branch uses this default, not the generic
  // DEFAULT_DAILY_BUDGET_USD ($2) ingestion/chat fall back to.
  ANTHROPIC_DAILY_BUDGET_USD_SHADOW: z.string().optional(),
  // Off by default — the shadow gate call only ever fires when this is exactly "true".
  GATE_SHADOW_ENABLED: z.string().optional(),
  GATE_SHADOW_MAX_REJECTS_PER_DAY: z.string().optional(),
  GATE_SHADOW_MAX_PASSES_PER_DAY: z.string().optional(),
  // Probability (0..1) that a live-gate reject is sampled for the shadow trial. Default 0.25
  // (engineering choice from ~430-600 rejects/day; not a researched value).
  GATE_SHADOW_REJECT_SAMPLE_RATE: rateEnv(0.25),
  // Probability (0..1) of recording a non-shadow-group relevance drop in rss_drop_samples. Default 0.1
  // (engineering choice to keep volume small; not a researched value).
  DROP_SAMPLE_BACKGROUND_RATE: rateEnv(0.1),
  // BBR working value. 20 gate calls x $0.0049 = about $0.10 a day, about 5% of the $2 cap. No published source.
  T2_PAIR_DAILY_MAX: nonNegIntEnv(20),
  // Optional. When unset, the monthly spend warning does nothing. A present value
  // must be a finite number greater than 0.
  ANTHROPIC_MONTHLY_LIMIT_USD: optionalPositiveEnv,
  // How many checks in a row a feed must stay quiet before a degraded row.
  // Default 2 is an engineering choice with no outside source. Not set in deploy config.
  FEED_VOLUME_CONSECUTIVE_CHECKS: positiveIntEnv(2),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(10).optional(),

  REDIS_URL: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),

  // Optional. Anthropic has no embeddings API; Voyage `voyage-4-lite` is their
  // recommended cheapest partner ($0.02/MTok, 200M free). Unset → local-hash-v1
  // embedder so /v1/search/assist still retrieves without a new paid vendor.
  VOYAGE_API_KEY: z.string().optional(),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  ACLED_EMAIL: z.string().optional(),
  ACLED_PASSWORD: z.string().optional(),
  GNEWS_API_KEY: z.string().optional(),

  // Resend API key for the #83 daily digest. Same Resend account that already backs
  // Supabase Auth's custom SMTP (verified sender domain send.bluebeaconresearch.com) —
  // this is app-level API access to that same account, not a new provider. Unset =>
  // the digest worker logs and no-ops instead of sending.
  RESEND_API_KEY: z.string().optional(),
  DIGEST_FROM_EMAIL: z.string().optional(),
  DIGEST_CRON: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Swagger UI at `/docs` is local/test only. Production must not serve a public OpenAPI UI. */
export function exposeApiDocs(nodeEnv: Env["NODE_ENV"] = process.env.NODE_ENV as Env["NODE_ENV"]): boolean {
  return nodeEnv === "development" || nodeEnv === "test";
}

export function getEnv(): Env {
  // Fallback for SUPABASE_URL if only its public variant is provided
  if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  }

  // Fallback for GNEWS_API_KEY if legacy NEWS_API_KEY is still set somewhere
  if (!process.env.GNEWS_API_KEY && process.env.NEWS_API_KEY) {
    process.env.GNEWS_API_KEY = process.env.NEWS_API_KEY;
  }

  // Fallback for ACLED_EMAIL if ACLED_API_EMAIL is set
  if (!process.env.ACLED_EMAIL && process.env.ACLED_API_EMAIL) {
    process.env.ACLED_EMAIL = process.env.ACLED_API_EMAIL;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
