import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

function getRatelimiter() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const redis = new Redis({ url, token });
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, "1 m"),
    analytics: true,
  });
}

export async function rateLimitOrPass(key: string) {
  const rl = getRatelimiter();
  if (!rl) return { success: true, limit: 60, remaining: 60, reset: Date.now() + 60_000 };
  return rl.limit(key);
}

