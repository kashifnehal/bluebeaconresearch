Redis provisioning (staging) — README

This folder contains Terraform scaffolding to provision an AWS ElastiCache Redis (replication group) for staging/use by the rate-limiter.

Quick operator steps

1. Copy the template and fill variables:

```bash
cp terraform.tfvars.template terraform.tfvars
# edit terraform.tfvars to set your region, vpc_id, subnet_ids, and a secure auth_token
```

2. Initialize and plan:

```bash
terraform -chdir=./infra/redis init
terraform -chdir=./infra/redis plan -var-file=terraform.tfvars
```

3. Apply (requires AWS credentials with appropriate permissions):

```bash
terraform -chdir=./infra/redis apply -var-file=terraform.tfvars
```

4. After apply, capture outputs:

```bash
terraform -chdir=./infra/redis output -json
```

You should see `redis_primary_endpoint` and `redis_auth_token` (if configured).

Set these as secrets in GitHub for CI integration (Repository > Settings > Secrets):

- `REDIS_URL` — e.g. `rediss://:<auth_token>@<primary_endpoint>:6379`
- `REDIS_TOKEN` — (optional) the auth token

Canary rollout for rate-limiter

1. Keep `RATE_LIMIT_FEATURE_FLAG=false` in staging initially.
2. Set `RATE_LIMIT_BACKEND=redis-lua` and `RATE_LIMIT_BACKEND_URL` to the `REDIS_URL` value in staging env.
3. Enable feature flag for a small percentage of traffic or a dedicated canary deployment.
4. Monitor error rates, latencies, and Redis command metrics.
5. If safe, flip the feature flag fully and deprecate Upstash REST for rate-limiting.

Rollback

- Flip `RATE_LIMIT_FEATURE_FLAG=false` to revert to the previous in-process limiter.
- If Redis provisioning introduced network issues, revoke the security group or adjust allowed CIDRs.

Notes

- This repo's GitHub Action expects `REDIS_URL` to be present as a secret to run integration tests.
- Do not commit `terraform.tfvars` with secrets.
