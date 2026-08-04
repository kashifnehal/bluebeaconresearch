# 12_DEPLOYMENT.md — Deployment Architecture, Infrastructure & Environment Variables

This document provides a guide to infrastructure hosting, CI/CD deployment pipelines, required secrets, environment variable configurations, and external API service dependencies.

---

## 1. Production Hosting Topology

```
┌─────────────────────────┐      ┌─────────────────────────┐      ┌─────────────────────────┐
│     Vercel Platform     │      │   Render / Railway /    │      │    Supabase Managed     │
│                         │      │     DigitalOcean        │      │       Postgres          │
│ - Next.js 16 Web App    │      │ - Fastify REST API      │      │ - Database & RLS        │
│ - Middleware Auth Guard │      │ - BullMQ Worker Process │      │ - Supabase Auth & JWT   │
└─────────────────────────┘      └─────────────────────────┘      └─────────────────────────┘
                                              │
                                              ▼
                                 ┌─────────────────────────┐
                                 │   Upstash Serverless    │
                                 │         Redis           │
                                 │ - BullMQ Queues         │
                                 │ - Edge Rate Limiting    │
                                 └─────────────────────────┘
```

---

## 2. Environment Variables Audit (`.env.example`)

### Supabase & Auth
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project HTTPS URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public anon JWT key.
- `SUPABASE_SERVICE_ROLE_KEY`: Admin service role key (backend secret).

### AI Engine
- `ANTHROPIC_API_KEY`: Anthropic API secret key for Claude 3.5 Sonnet / Haiku calls.

### External Ingestion APIs
- `ALPHA_VANTAGE_API_KEY`: Financial commodity market data provider.
- `NEWS_API_KEY` / `GNEWS_API_KEY`: Global news article collectors.
- `ACLED_API_KEY` / `ACLED_API_EMAIL`: Verified military engagement data feed.

### Alert Channels & Geospatial
- `TELEGRAM_BOT_TOKEN`: Bot token for instant Telegram alert dispatch.
- `NEXT_PUBLIC_MAPBOX_TOKEN`: Mapbox GL JS map tile access token.
- `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis HTTP credentials.

---

## 3. Build & Deployment Commands

### Monorepo Build Pipeline (`turbo.json`)
```bash
# Install dependencies
pnpm install

# Run type check across monorepo
pnpm run type-check

# Build all applications and packages
pnpm run build

# Start backend server
pnpm --filter backend start
```
