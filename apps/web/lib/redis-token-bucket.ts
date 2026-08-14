import { Redis } from "@upstash/redis";

let _rbRedis: Redis | null = null;

function getRBRedis() {
  if (_rbRedis) return _rbRedis;
  const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.REDIS_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url) return null;
  _rbRedis = new Redis({ url, token });
  return _rbRedis;
}

// Token-bucket POC implemented with a Redis sorted set of timestamps.
// This provides an approximate rolling-window limiter (atomicity depends on Redis guarantees).
export async function redisTokenBucketAllow(
  key: string,
  limit = 60,
  windowSeconds = 60,
) {
  const r = getRBRedis();
  if (!r)
    return {
      success: true,
      limit,
      remaining: limit,
      reset: Date.now() + windowSeconds * 1000,
    };

  try {
    const redisKey = `ratelimit:rb:${key}`;
    const now = Date.now();
    const member = `${now}-${Math.random().toString(36).slice(2, 8)}`;
    // add current timestamp
    await r.zadd(redisKey, now, member);
    // remove old entries
    const minScore = 0;
    const maxScore = now - windowSeconds * 1000;
    await r.zremrangebyscore(redisKey, minScore, maxScore);
    const count = await r.zcard(redisKey);
    await r.expire(redisKey, windowSeconds + 5);
    const remaining = Math.max(0, limit - Number(count));
    return {
      success: Number(count) <= limit,
      limit,
      remaining,
      reset: Date.now() + windowSeconds * 1000,
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
