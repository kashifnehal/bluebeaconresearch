import Redis from "ioredis";
import { getEnv } from "../env.js";

let redis: Redis | null = null;

// Circuit breaker for repeated Redis errors (quota exhaustion, sustained connection
// failure). ioredis's own reconnect logic (retryStrategy below) keeps retrying
// forever by design — sane for a brief network blip, but during a sustained failure
// (e.g. Upstash's "max requests limit exceeded") it means every ~10s reconnect
// attempt fires more commands at an already-exhausted quota, turning one outage into
// a compounding storm. Once errors cluster past the threshold, disconnect outright
// and hand back null (the same "Redis unavailable" contract every caller already
// null-checks) for a cooldown window, instead of leaving a client that will just keep
// failing in the background.
const ERROR_BURST_THRESHOLD = 5;
const ERROR_BURST_WINDOW_MS = 10_000;
const COOLDOWN_MS = 60_000;
let errorTimestamps: number[] = [];
let cooldownUntil = 0;

// Upstash's own quota-exceeded error string embeds the real numbers, e.g. "ERR max
// requests limit exceeded. Limit: 500000, Usage: 500003." — the per-database REST/Redis
// connection has no dedicated usage endpoint (confirmed: neither REST response headers
// nor the ioredis INFO command carry it), and the real percentage-of-quota API is only
// on Upstash's separate account-level Management API (needs UPSTASH_API_KEY +
// UPSTASH_EMAIL, not present in this project's env). Until those are added, this parsed
// number is the only real usage signal available — reactive (only known once a command
// has already failed), not proactive, but genuine data rather than a guess.
let lastKnownUsage: { limit: number; usage: number; at: number } | null = null;

function parseQuotaFromErrorMessage(message: string) {
  const m = message.match(/Limit:\s*(\d+),\s*Usage:\s*(\d+)/);
  if (!m) return null;
  return { limit: Number(m[1]), usage: Number(m[2]) };
}

export function getLastKnownRedisUsage() {
  return lastKnownUsage;
}

// Exported so request-driven call sites (e.g. routes/prices.ts) that catch their own
// Redis errors — rather than letting them surface as a client-level 'error' event —
// can still feed the same breaker. Without this, a per-request command failure (which
// scales with real user traffic, unlike the mostly-cron-driven paths that already go
// through the 'error' handler below) would retry on every single incoming request
// with no backoff at all.
export function recordRedisError(message?: string) {
  const now = Date.now();
  errorTimestamps = errorTimestamps.filter((t) => now - t < ERROR_BURST_WINDOW_MS);
  errorTimestamps.push(now);

  if (message) {
    const parsed = parseQuotaFromErrorMessage(message);
    if (parsed) lastKnownUsage = { ...parsed, at: now };
  }

  if (errorTimestamps.length >= ERROR_BURST_THRESHOLD && now >= cooldownUntil) {
    cooldownUntil = now + COOLDOWN_MS;
    console.error(
      `[Redis] ${ERROR_BURST_THRESHOLD}+ errors within ${ERROR_BURST_WINDOW_MS / 1000}s — ` +
        `disconnecting and backing off for ${COOLDOWN_MS / 1000}s instead of retrying into the same failure. ` +
        `All getRedis() callers will see Redis as unavailable until the cooldown clears.`,
    );
    redis?.disconnect();
    redis = null;
    errorTimestamps = [];
  }
}

export function getRedis() {
  if (Date.now() < cooldownUntil) return null;
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
    const isTls = url.startsWith("rediss://");
    redis = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      connectTimeout: 5000,
      // Bounded exponential backoff, capped at 15s — was previously ioredis's default
      // (capped at 2s), which reconnects fast enough to compound a sustained outage
      // rather than give it room to clear. Still retries indefinitely for genuine
      // transient blips; the circuit breaker above is what stops the compounding case.
      retryStrategy(times) {
        return Math.min(times * 500, 15_000);
      },
      // Upstash requires TLS — pass tls options when using rediss://
      ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
    });

    // CRITICAL: Handle error events to prevent process crashes (ENOTSOCK etc)
    redis.on("error", (err) => {
      console.error("Redis Client Error:", err.message);
      if (err.message.includes("ENOTSOCK")) {
        console.error("Likely caused by an invalid connection string or trying to use a REST URL as a Redis socket.");
      }
      recordRedisError(err.message);
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

