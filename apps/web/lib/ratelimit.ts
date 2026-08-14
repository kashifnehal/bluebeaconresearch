import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Module-level singletons to avoid recreating clients on every request
let _redis: Redis | null = null;
let _ratelimit: Ratelimit | null = null;

function getRatelimiter() {
  if (_ratelimit) return _ratelimit;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  _redis = _redis ?? new Redis({ url, token });
  _ratelimit = new Ratelimit({
    redis: _redis,
    limiter: Ratelimit.slidingWindow(60, "1 m"),
    analytics: true,
  });

  return _ratelimit;
}

export async function rateLimitOrPass(key: string) {
  const rl = getRatelimiter();
  if (!rl)
    return {
      success: true,
      limit: 60,
      remaining: 60,
      reset: Date.now() + 60_000,
    };
  return rl.limit(key);
}
