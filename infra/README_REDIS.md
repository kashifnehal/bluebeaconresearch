# Staging Redis (Terraform)

This folder contains a minimal Terraform scaffold to provision an AWS ElastiCache Redis replication group for staging.

Prerequisites

- An AWS account with credentials configured locally (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) or via an assumed role.
- A VPC with private subnets and subnet IDs available (pass them to the module).

Quick start (example)

1. Edit variables or create a `terraform.tfvars` with at least `subnet_ids`:

```hcl
subnet_ids = ["subnet-aaaa","subnet-bbbb"]
aws_region = "us-east-1"
environment = "staging"
```

2. Initialize and apply:

```bash
terraform -chdir=infra/redis init
terraform -chdir=infra/redis apply
```

3. After apply, Terraform outputs include `redis_url` — use that as `REDIS_URL` in staging.

Security note: restrict access to the ElastiCache cluster via security groups and do not expose it publicly.
