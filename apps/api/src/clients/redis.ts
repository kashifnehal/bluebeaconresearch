import Redis from "ioredis";
import { getEnv } from "../env";

let redis: Redis | null = null;

export function getRedis() {
  if (redis) return redis;
  const env = getEnv();

  // Prefer a single REDIS_URL (Railway/Upstash compatible).
  const url = env.REDIS_URL || env.UPSTASH_REDIS_REST_URL;
  if (!url) {
    throw new Error("Missing REDIS_URL (or UPSTASH_REDIS_REST_URL).");
  }

  const isRestUrl = url.startsWith("https://") || url.startsWith("http://");

  if (isRestUrl) {
    console.error("❌ CRITICAL: ioredis: UPSTASH_REDIS_REST_URL (or a REST URL) detected.");
    console.error("ioredis requires a redis:// or rediss:// protocol URL. REST URLs are for the Upstash REST API only.");
    console.error("Please add REDIS_URL=rediss://... to your .env file.");
    // We throw here because using a REST URL with ioredis leads to ENOTSOCK and crashes.
    throw new Error("Invalid Redis URL: REST URLs (http/https) are not supported by ioredis.");
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

