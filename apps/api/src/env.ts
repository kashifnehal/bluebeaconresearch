import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  PORT: z.coerce.number().int().positive().default(3001),

  NEXT_PUBLIC_APP_URL: z.string().url().optional(),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(10).optional(),

  REDIS_URL: z.string().min(1).optional(),

  ANTHROPIC_API_KEY: z.string().min(10).optional(),
  RESEND_API_KEY: z.string().min(10).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),

  TELEGRAM_BOT_TOKEN: z.string().min(10).optional(),
  ALPHA_VANTAGE_API_KEY: z.string().min(10).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}

