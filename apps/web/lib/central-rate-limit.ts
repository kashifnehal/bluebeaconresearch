import { Redis } from "@upstash/redis";

let _centralRedis: Redis | null = null;

function getCentralRedis() {
  if (_centralRedis) return _centralRedis;
  const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.REDIS_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url) return null;
  _centralRedis = new Redis({ url, token });
  return _centralRedis;
}

// Simple fixed-window counter POC. Atomically increments a counter and sets TTL when first created.
export async function redisWindowAllow(
  key: string,
  limit = 60,
  windowSeconds = 60,
) {
  const r = getCentralRedis();
  if (!r)
    return {
      success: true,
      limit,
      remaining: limit,
      reset: Date.now() + windowSeconds * 1000,
    };

  try {
    const count = await r.incr(key);
    if (count === 1) {
      await r.expire(key, windowSeconds);
    }
    const ttl = await r.ttl(key);
    const remaining = Math.max(0, limit - Number(count));
    return {
      success: Number(count) <= limit,
      limit,
      remaining,
      reset: Date.now() + (ttl > 0 ? ttl * 1000 : windowSeconds * 1000),
    };
  } catch (err) {
    return {
      success: true,
      limit,
      remaining: limit,
      reset: Date.now() + windowSeconds * 1000,
      error: String(err),
    };
  }
}
