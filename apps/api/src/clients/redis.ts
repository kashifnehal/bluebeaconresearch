import Redis from "ioredis";
import { getEnv } from "../env";

let redis: Redis | null = null;

export function getRedis() {
  if (redis) return redis;
  const env = getEnv();

  // Prefer a single REDIS_URL (Railway/Upstash compatible).
  const url = env.REDIS_URL ?? env.UPSTASH_REDIS_REST_URL;
  if (!url) {
    throw new Error("Missing REDIS_URL (or UPSTASH_REDIS_REST_URL).");
  }

  if (url.startsWith("https://") || url.startsWith("http://")) {
    console.warn("⚠️  ioredis: UPSTASH_REDIS_REST_URL detected. This is a REST URL and cannot be used with ioredis. Backend workers and rate-limiting may not function correctly. Use a rediss:// or redis:// URL instead.");
    // For development, we might not want to hard-fail, but BullMQ will.
    // Return a proxy or just let it fail later with a better message.
  }

  redis = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  return redis;
}

