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

  redis = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    // BullMQ recommends disabling offline queue for workers; keep default here and override per Queue if needed.
  });

  return redis;
}

