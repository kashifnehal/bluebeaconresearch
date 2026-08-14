import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Module-level singletons to avoid recreating clients on every request
let _redis: Redis | null = null;
let _ratelimit: Ratelimit | null = null;

// In-memory process-level token bucket to prevent hitting Upstash REST on every single request.
// Maps key -> { count: number, resetAt: number }
const _localBuckets = new Map<string, { count: number; resetAt: number }>();

function getRatelimiter() {
  if (_ratelimit) return _ratelimit;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  _redis = _redis ?? new Redis({ url, token });
  _ratelimit = new Ratelimit({
    redis: _redis,
    limiter: Ratelimit.slidingWindow(60, "1 m"),
    analytics: false, // disable analytics calls to save extra Upstash REST requests
  });

  return _ratelimit;
}

export async function rateLimitOrPass(key: string, limit = 60, windowSeconds = 60) {
  const now = Date.now();

  // Step 3: Check RATE_LIMIT_SAFE_MODE env flag
  const safeMode = (process.env.RATE_LIMIT_SAFE_MODE || "false").toLowerCase() === "true";
  if (safeMode) {
    console.warn(`[upstash] RATE_LIMIT_SAFE_MODE active — skipping external REST check for key: ${key}`);
    return {
      success: true,
      limit,
      remaining: limit,
      reset: now + windowSeconds * 1000,
    };
  }

  // Step 4: Local in-memory fast-path check
  let bucket = _localBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowSeconds * 1000 };
    _localBuckets.set(key, bucket);
  }

  bucket.count += 1;

  // Cleanup old bucket keys periodically
  if (_localBuckets.size > 2000) {
    for (const [k, b] of _localBuckets.entries()) {
      if (now >= b.resetAt) _localBuckets.delete(k);
    }
  }

  // If local instance count exceeds limit, block locally without calling Upstash REST
  if (bucket.count > limit) {
    console.warn(`[rate-limit] Local process limit hit (${bucket.count}/${limit}) for key: ${key}`);
    return {
      success: false,
      limit,
      remaining: 0,
      reset: bucket.resetAt,
    };
  }

  // Consult Upstash as global guard
  const rl = getRatelimiter();
  if (!rl) {
    return {
      success: true,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      reset: bucket.resetAt,
    };
  }

  try {
    const res = await rl.limit(key);
    if (!res.success) {
      console.warn(`[rate-limit] Upstash rate-limit hit for key: ${key}`);
    }
    return res;
  } catch (err: any) {
    // Upstash quota exhausted, 429, or network failure — log structured error and pass gracefully
    console.error(`[upstash] Quota/network error for key ${key}:`, err?.message ?? err);
    return {
      success: true,
      limit,
      remaining: limit,
      reset: now + windowSeconds * 1000,
    };
  }
}
