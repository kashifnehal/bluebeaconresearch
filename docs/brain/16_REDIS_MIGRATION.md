# 16_REDIS_MIGRATION.md — Central Redis Migration & Rollout Plan

Last updated: 2026-08-14

Goal

- Remove reliance on Upstash REST quota-sensitive calls for production rate-limiting.
- Deploy a central, TLS-protected Redis instance and cut `rateLimitOrPass` over to the Lua atomic token-bucket implementation behind a controlled feature flag.

Requirements

- Preserve `/api/signals` contract and degraded-mode semantics (cached payloads + `fallback`/`fallbackReason`).
- Zero-downtime rollout with safe rollback path.
- Minimal latency increase vs current inproc checks; single authoritative rate-limit store across instances.

Options (recommended ordering)

1. Managed Redis (Recommended)

- Redis Enterprise Cloud (Redis Cloud by Redis Ltd) or Upstash Redis (paid plan with higher throughput).
- Pros: managed backups, SLA, global clusters, predictable throughput, TLS endpoints.
- Cons: cost vs DIY.

2. Cloud Provider Managed (AWS Elasticache / Azure Cache / GCP Memorystore)

- Pros: native VPC integration, IAM + networking controls, high throughput.
- Cons: VPC peering / egress config may be required for serverless deployments (Vercel/Railway) — extra networking work.

3. Self-hosted Redis (DevOps-managed)

- Pros: full control, potentially lower cost.
- Cons: operational overhead (HA, backups, failover), not recommended for short-term.

Recommendation

- Start with a small managed Redis instance (Redis Cloud or Upstash paid) in the same region as the app. Redis Cloud is the fastest path with TLS and high QPS. If you already have AWS infra and can manage VPC peering, consider ElastiCache for lower network latency.

Connection & Env Vars

- Add these env vars in staging/production (Vercel / Railway / Heroku):
  - `REDIS_URL` (e.g. rediss://:<token>@<host>:<port>)
  - `REDIS_TOKEN` (if using Upstash or token-based auth)
  - `RATE_LIMIT_BACKEND` = `redis-lua` OR `redis-sortedset` (switchable)
  - `RATE_LIMIT_FEATURE_FLAG` = `false` (initially) — used to enable central Redis in runtime

Example ioredis connection (Node):

```js
import Redis from "ioredis";
const redis = new Redis(process.env.REDIS_URL, {
  tls: { rejectUnauthorized: true },
  maxRetriesPerRequest: 2,
});
```

Code changes required (summary)

- Ensure `apps/web/lib/ratelimit.ts` checks `RATE_LIMIT_FEATURE_FLAG` and `RATE_LIMIT_BACKEND` before using Redis/Lua path.
- Keep fallbacks: if Redis connection fails, revert to Upstash or inproc gate and increment metrics.
- Add a small health-check `GET /api/ratelimit/health` that returns Redis connectivity and token-bucket script status.

Rollout Plan (staged)

1. Draft plan & create docs (this file).
2. Provision Redis in staging (managed Redis Cloud, rediss://). Add `REDIS_URL` to staging secrets.
3. Deploy code changes to read `RATE_LIMIT_BACKEND` and `RATE_LIMIT_FEATURE_FLAG` (flag default `false`). Add `RATE_LIMIT_BACKEND=redis-lua` in staging, but leave `RATE_LIMIT_FEATURE_FLAG=false`.
4. Run integration tests in staging: token-bucket Lua script, sorted-set fallback, and failure behavior (simulate Redis down). Validate metrics and behavior.
5. Enable `RATE_LIMIT_FEATURE_FLAG=true` in staging. Run load tests and observe metrics (`signals.ratelimit_check_errors`, `signals.upstash_rate_limited`, `signals.rate_limited_served_cached`).
6. If staging stable, provision production Redis (same provider, appropriate sizing) and add `REDIS_URL` secret to production but keep `RATE_LIMIT_FEATURE_FLAG=false`.
7. Canary: enable `RATE_LIMIT_FEATURE_FLAG=true` for a small subset of hosts or via runtime header (if supported) or deploy a canary instance with flag enabled. Run smoke + load tests.
8. Gradual rollout: enable on 25% → 50% → 100% of instances, monitoring latency and error metrics at each step.
9. After 24–72h with no regressions, switch `RATE_LIMIT_FEATURE_FLAG` permanently on and remove Upstash/REST hot-path or keep as emergency fallback.

Rollback plan

- If errors occur (increased `signals.ratelimit_check_errors` or Redis latency):
  - Flip `RATE_LIMIT_FEATURE_FLAG=false` to revert to previous code path.
  - If a full deploy introduced regressions, redeploy previous release.
  - Restore Upstash quota or re-enable inproc gate limits temporarily.

Testing & Automation

- Add integration tests (Vitest/Jest) for:
  - Lua token-bucket correctness (concurrent allow/deny semantics)
  - Sorted-set fallback correctness
  - Failure fallback to inproc gate
  - SSE proxy + EventSource reconnection behavior under rate-limited conditions
- Add a CI job to run these tests against a disposable Redis instance (use GitHub Actions + Redis Cloud trial or local Redis via Docker).

Monitoring & Alerts

- Track these metrics (already present with `incr` usage):
  - `signals.ratelimit_check_errors`
  - `signals.upstash_rate_limited`
  - `signals.rate_limited_served_cached`
  - `signals.inproc_rate_limit_hits`
  - `signals.db_errors`
- Create alerts:
  - High `ratelimit_check_errors` rate (10/min sustained)
  - Elevated Redis latency (p95 > 200ms)
  - Increase in `rate_limited_served_cached` (suggests Redis capacity insufficient)

Security & Ops

- Use TLS (rediss://). Lock access to Redis via IP allowlists where possible.
- Rotate tokens/credentials periodically and add runbook for secret compromise.

Cost Estimates

- Redis Cloud / Upstash paid: small instance ~$5–$50/mo depending on throughput.
- AWS ElastiCache: higher baseline and operational cost; recommended when co-located in same VPC.

Next actions (what I'll implement next)

1. Create `docs/brain/16_REDIS_MIGRATION.md` (this file) — done.
2. Provide a local Redis docker-compose for quick staging and validation (`docker-compose.redis.yml`).
3. Add a small PR to `apps/web/lib/ratelimit.ts` to respect `RATE_LIMIT_FEATURE_FLAG` and provide a health endpoint — already applied.
4. Draft integration tests and CI job for Redis-backed token-bucket.

Local quick-start (dev/staging validation)

1. Start a local Redis:

```bash
docker compose -f docker-compose.redis.yml up -d
```

2. Add these env vars to your shell or `.env.local` for local testing:

```bash
export REDIS_URL=redis://localhost:6379
export REDIS_TOKEN=""
export RATE_LIMIT_BACKEND=redis-lua
export RATE_LIMIT_FEATURE_FLAG=true
```

3. Restart the Next.js dev server and hit the health endpoint to verify:

```bash
curl -i http://localhost:3000/api/ratelimit/health
```

4. Run load tests against `/api/signals` and watch metrics; toggle `RATE_LIMIT_FEATURE_FLAG` to test fallback behavior.

## Local integration test script

There's a lightweight script to manually test the Lua token-bucket once `REDIS_URL` is available:

```bash
REDIS_URL=redis://localhost:6379 node apps/web/scripts/test_redis_rate_limiter.js
```

It will attempt several token-bucket checks and print allowed/denied results.

If you want, I will now implement the code guard (feature-flag check) and a health endpoint in `apps/web/app/api/ratelimit/health/route.ts` and run basic smoke tests in staging.

---

Note: On 2026-08-14 these migration guidance files and the Terraform/template assets were added to the repository and merged into `main`. The infra scaffolding (`infra/redis/*`), `.github/workflows/redis-integration.yml`, and `.env.example` now include operator guidance. Follow `infra/redis/README_REDIS.md` for provisioning and the canary rollout steps.
