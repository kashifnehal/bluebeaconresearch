import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { redisWindowAllow } from "@/lib/central-rate-limit";
import { redisTokenBucketAllow } from "@/lib/redis-token-bucket";
import { redisTokenBucketAllowLua } from "@/lib/redis-token-bucket-lua";

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
  // Feature-flagged Redis backend: only prefer Redis/Lua path when explicitly enabled.
  const featureFlag =
    (process.env.RATE_LIMIT_FEATURE_FLAG || "false").toLowerCase() === "true";
  const backend = (process.env.RATE_LIMIT_BACKEND || "redis-lua").toLowerCase();
  if (featureFlag && process.env.REDIS_URL) {
    // Allow backend ordering via RATE_LIMIT_BACKEND
    if (backend === "redis-lua") {
      try {
        return await redisTokenBucketAllowLua(key, 60, 60);
      } catch (err) {
        // fall back to other redis implementations
      }
      try {
        return await redisTokenBucketAllow(key, 60, 60);
      } catch (err) {
        // fall through
      }
    } else if (backend === "redis-sortedset") {
      try {
        return await redisTokenBucketAllow(key, 60, 60);
      } catch (err) {
        // fall back
      }
      try {
        return await redisTokenBucketAllowLua(key, 60, 60);
      } catch (err) {
        // fall through
      }
    }

    try {
      return await redisWindowAllow(key, 60, 60);
    } catch (err) {
      // fall through to Upstash
    }
  }

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
