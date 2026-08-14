/**
 * Simple in-process token-bucket rate limiter.
 * - Not suitable for multi-instance production without central coordination.
 * - Useful as an immediate mitigation to reduce external REST calls (Upstash) from each process.
 */

const DEFAULT_PER_MINUTE = Number(
  process.env.INPROC_RATE_LIMIT_PER_MINUTE ?? 60,
);

let tokens = DEFAULT_PER_MINUTE;
let lastRefill = Date.now();

function refill() {
  const now = Date.now();
  const elapsedMs = now - lastRefill;
  if (elapsedMs <= 0) return;
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes > 0) {
    tokens = Math.min(
      DEFAULT_PER_MINUTE,
      tokens + minutes * DEFAULT_PER_MINUTE,
    );
    lastRefill = now;
  }
}

export function inprocAllow(cost = 1): boolean {
  refill();
  if (tokens >= cost) {
    tokens -= cost;
    return true;
  }
  return false;
}

export function inprocStatus() {
  refill();
  return { tokens, capacity: DEFAULT_PER_MINUTE };
}

export default { inprocAllow, inprocStatus };
