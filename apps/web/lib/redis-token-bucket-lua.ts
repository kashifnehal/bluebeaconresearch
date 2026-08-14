import { Redis } from "@upstash/redis";

let _luaRedis: Redis | null = null;

function getLuaRedis() {
  if (_luaRedis) return _luaRedis;
  const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.REDIS_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url) return null;
  _luaRedis = new Redis({ url, token });
  return _luaRedis;
}

// Atomic token-bucket implemented via a Lua script using a sorted set.
export async function redisTokenBucketAllowLua(
  key: string,
  limit = 60,
  windowSeconds = 60,
) {
  const r = getLuaRedis();
  if (!r)
    return {
      success: true,
      limit,
      remaining: limit,
      reset: Date.now() + windowSeconds * 1000,
    };

  const redisKey = `ratelimit:rb:${key}`;
  const now = Date.now();
  const member = `${now}-${Math.random().toString(36).slice(2, 8)}`;

  const lua = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local window_ms = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])
    local member = ARGV[4]
    redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window_ms)
    redis.call('ZADD', key, now, member)
    local count = redis.call('ZCARD', key)
    redis.call('PEXPIRE', key, window_ms + 5000)
    return {count, now + window_ms}
  `;

  try {
    // @upstash/redis client supports eval(lua, keys, args)
    const res: any = await (r as any).eval(
      lua,
      [redisKey],
      [String(now), String(windowSeconds * 1000), String(limit), member],
    );
    const count = Number(res[0]);
    const resetMs = Number(res[1]);
    return {
      success: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      reset: resetMs,
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
