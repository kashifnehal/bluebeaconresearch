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
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  PORT: z.coerce.number().int().positive().default(3001),

  NEXT_PUBLIC_APP_URL: z.string().url().optional(),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(10).optional(),

  REDIS_URL: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  ALPHA_VANTAGE_API_KEY: z.string().optional(),
  ACLED_EMAIL: z.string().optional(),
  ACLED_PASSWORD: z.string().optional(),
  NEWS_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(): Env {
  // Fallback for SUPABASE_URL if only its public variant is provided
  if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
