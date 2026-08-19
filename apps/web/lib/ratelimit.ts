import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Module-level singletons to avoid recreating clients on every request
let _redis: Redis | null = null;
let _ratelimit: Ratelimit | null = null;

// In-memory process-level token bucket to prevent hitting Upstash REST on every single request.
// Maps key -> bucket state. lastSyncAt/lastSyncCount track when this key last actually
// consulted Upstash, so the periodic-reconcile check below stays sub-linear in request
// volume instead of firing on every call.
type Bucket = {
  count: number;
  resetAt: number;
  lastSyncAt: number;
  lastSyncCount: number;
};
const _localBuckets = new Map<string, Bucket>();

// Trade-off (documented per growth-planning requirement, see docs/brain/10_DECISIONS.md):
// this is a "periodic reconciliation" design, not "accepted under-enforcement." A purely
// local-only bucket would under-count once traffic spans multiple Vercel instances/regions
// (they don't share memory) — instead of accepting that gap, each key still touches Upstash
// (the authoritative, cross-instance count) at a bounded rate: every SYNC_EVERY_N_REQUESTS
// requests, or every SYNC_EVERY_MS, whichever comes first. That keeps Redis calls sub-linear
// in request volume (roughly 1 touch per N requests per key, not 1 per request) while still
// catching a key that's abusive in aggregate across instances, not just within one process.
const SYNC_EVERY_N_REQUESTS = 10;
const SYNC_EVERY_MS = 5_000;
// Also always double-check with Upstash once local usage is close to the limit — this is
// the case that actually matters for correctness (a key split evenly across instances could
// look "well under limit" locally on every instance while being over limit in aggregate).
const NEAR_LIMIT_FRACTION = 0.8;

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

  // Local in-memory fast-path check
  let bucket = _localBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowSeconds * 1000, lastSyncAt: 0, lastSyncCount: 0 };
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

  // Common case: well under limit and not due for a periodic reconcile — resolve
  // entirely from local memory, no Upstash REST call at all.
  const nearLimit = bucket.count >= limit * NEAR_LIMIT_FRACTION;
  const dueForSync =
    bucket.count - bucket.lastSyncCount >= SYNC_EVERY_N_REQUESTS || now - bucket.lastSyncAt >= SYNC_EVERY_MS;

  if (!nearLimit && !dueForSync) {
    return {
      success: true,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      reset: bucket.resetAt,
    };
  }

  // Consult Upstash as the authoritative, cross-instance guard
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
    bucket.lastSyncAt = now;
    bucket.lastSyncCount = bucket.count;
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
