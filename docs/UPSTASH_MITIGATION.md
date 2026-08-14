# Upstash Quota Mitigation — Options, Tradeoffs, and Recommended Plan

## Context

Recent dev logs show the Upstash rate-limit quota being exceeded (account-level limit reached). This causes `/api/signals` to fall back to cached payloads and degrades the live feed. Immediate remediation is needed to restore consistent availability.

## Goals

- Reduce external REST calls to Upstash/Redis immediately.
- Restore live SSE feeds without leaking credentials.
- Provide a medium-term scalable rate-limiter architecture.
- Avoid degrading API behavior or introducing regressions.

## Options Considered

1. Short-term: Reduce client demand + in-process gate (already implemented)
   - What: Increase polling to 120s + jitter, add per-process token-bucket, add cached short-circuit.
   - Pros: Immediate relief; no infra changes.
   - Cons: Per-process in-memory gating does not coordinate across instances; may still exceed account quota under many processes.

2. Short-term: DEV_SKIP_UPSTASH flag for local dev
   - What: Skip Upstash checks during local development.
   - Pros: Avoids dev friction; already implemented.
   - Cons: Does not help production usage.

3. Medium-term: Centralized rate-limiter using Redis (Upstash or self-hosted)
   - What: Implement a Redis-backed token-bucket (single source-of-truth) used by all app instances.
   - Pros: Accurate global rate limiting; resilient if Redis is scaled/managed; predictable behavior.
   - Cons: Requires Redis availability and costs; if Upstash is the Redis provider and it's the source of quota issue, you must upgrade or move provider.

4. Medium-term: Move rate-limit checks to a single worker/ingest process
   - What: Centralize Upstash/ratelimit interactions in one process or background worker; other instances ask the centralizer for permission.
   - Pros: Minimizes number of Upstash REST calls; easier to implement with existing infra (single worker).
   - Cons: Adds complexity and a single point of failure; requires IPC or small API between app and worker.

5. Long-term: Upgrade Upstash plan or migrate to self-hosted Redis
   - What: Increase quota or self-host Redis on managed infra (AWS ElastiCache, DigitalOcean, etc.).
   - Pros: Removes quota ceiling; full control.
   - Cons: Cost (upgrade) or ops burden (self-host), migration effort.

6. Alternate approach: Use service-side caching with longer TTLs and event-driven invalidation
   - What: Cache signals for longer when Upstash reports issues; rely on SSE/proxy for real-time when possible.
   - Pros: Reduces read volume; minimal infra work.
   - Cons: May serve stale data longer during outages.

## Recommended Priorities (CTO view)

Immediate (P0, 0–24h)

- Keep in-place mitigations: 120s+ jitter polling, in-process token-bucket, `DEV_SKIP_UPSTASH`.
- Implement SSE proxy and token flow (done) to stabilize real-time without cookie issues.
- Add monitoring/alerts for Upstash quota and fallback counts (done — basic metrics & alerter wired).

Short term (P1, 1–7 days)

- Implement a centralized rate-limiter:
  - Preferred: Redis-backed token-bucket using a dedicated Redis instance (not the Upstash account that is exhausted), or
  - Alternative: route ratelimit checks through a single worker service (simpler, less infra change).
- Increase `/api/signals` cache TTL adaptively when repeated Upstash errors occur (cooldown mode).
- Tune thresholds for alerts and add dashboard/SLACK webhook.

Medium term (P2, 2–4 weeks)

- Evaluate Upstash plan upgrade vs migrating to managed Redis (ElastiCache) or a different provider.
- Implement robust distributed token-bucket with Redis and add integration tests.

Long term (P3)

- Architect ingestion pipeline to batch and dedupe Upstash/redis calls (workers + fan-out), and add rate-limit instrumentation and self-healing (circuit-breaker backoffs).

## Operational Checklist for Implementation

1. Decide budget: upgrade Upstash or allocate a small managed Redis cluster.
2. If upgrading Upstash: perform controlled rollout and monitor metrics.
3. If migrating: provision Redis, update `apps/web/lib/ratelimit.ts` to use new Redis URL (env var), add tests.
4. Add a Redis-backed token-bucket helper and swap into `rateLimitOrPass` with fallback to inprocAllow when Redis unavailable.
5. Add telemetry dashboards and alerts (SLACK/webhook) for `signals.*` metrics.
6. Run load test in staging to validate behavior under high client volume.

## Notes on Edge Cases

- Multiple server instances each with in-process gates can still create bursts at process startup — add randomized warmup or staggered backoff.
- The SSE proxy reduces client-side auth issues but still reads DB; if DB or service-role Redis is rate-limited, proxy will also be affected.
- Avoid long-lived tokens; keep token TTL short and rotate service keys securely.

## Acceptance Criteria for P1

- No Upstash quota-exceeded errors in logs for sustained period under expected load.
- `/api/signals` returns live data or cached degraded payloads gracefully with `fallback` flags.
- Alerts fire when thresholds exceeded and stop after remediation.

## Appendix: Quick Implementation Plan for Redis-backed Token Bucket

1. Add `REDIS_URL` env var and dependency on `@upstash/redis` or `ioredis`.
2. Implement `lib/central-rate-limit.ts` with Lua scripts for atomic token consumption.
3. Change `rateLimitOrPass` to call the central limiter; fall back to inprocAllow when Redis unavailable.
4. Run smoke tests and staging rollout.
