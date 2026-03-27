import Redis from "ioredis";
import { getEnv } from "../env";

let redis: Redis | null = null;

export function getRedis() {
  if (redis) return redis;
  const env = getEnv();

  // Prefer a single REDIS_URL (Railway/Upstash compatible).
  const url = env.REDIS_URL || env.UPSTASH_REDIS_REST_URL;
  const isRestUrl = url ? (url.startsWith("https://") || url.startsWith("http://")) : false;

  if (!url || isRestUrl) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("⚠️ [API Redis] No valid REDIS_URL found (or REST URL detected).");
      console.warn("   -> ioredis requires a redis:// or rediss:// protocol URL.");
      console.warn("   -> Falling back to in-memory mode for development.");
      return null;
    }
    if (isRestUrl) {
      throw new Error("Invalid Redis URL: REST URLs (http/https) are not supported by ioredis.");
    }
    throw new Error("Missing REDIS_URL.");
  }

  try {
    redis = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      // Add a small connection timeout to fail faster if the URL is wrong but doesn't throw immediately
      connectTimeout: 5000,
    });

    // CRITICAL: Handle error events to prevent process crashes (ENOTSOCK etc)
    redis.on("error", (err) => {
      console.error("Redis Client Error:", err.message);
      if (err.message.includes("ENOTSOCK")) {
        console.error("Likely caused by an invalid connection string or trying to use a REST URL as a Redis socket.");
      }
    });

    redis.on("connect", () => {
      console.log("✅ Redis client connected successfully.");
    });

  } catch (error: any) {
    console.error("Failed to initialize Redis client:", error.message);
    throw error;
  }

  return redis;
}

