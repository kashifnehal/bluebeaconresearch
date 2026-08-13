# 12_DEPLOYMENT.md — Production Deployment Guide

**Classification: Internal — CTO Level**

---

## 1. INFRASTRUCTURE OVERVIEW

| Service | Platform | URL | Status |
|---------|----------|-----|--------|
| Web app (Next.js) | Vercel | bluebeaconresearch.com | ✅ Live |
| Backend API (Fastify) | Railway | api.bluebeaconresearch.com | ❌ Offline |
| Background Workers | Railway | No public URL | ❌ Not created |
| Database | Supabase | xxx.supabase.co | ✅ Running |
| Redis / Queue | Upstash | xxx.upstash.io | ✅ Connected |

---

## 2. RAILWAY — FIXING THE BACKEND (DO THIS FIRST)

### 2.1 Add Billing (Urgent — $1.00 remaining)
1. Go to railway.app → bottom-left avatar → "Billing"
2. Click "Add payment method" → enter credit card
3. Hobby plan activates: $5/month flat + usage ($0.000463/vCPU-min)
4. Expected monthly cost with both services: $5–15/month

### 2.2 Fix Existing Backend Service (API Server)

**Current state:** Service is offline. No active deployment. Root Directory not set.

**Steps:**
1. Go to railway.app → project "powerful-strength" → click "backend" service
2. Click "Settings" tab
3. **Source section:** Click "Add Root Directory" → type: `apps/backend` → save
4. **Build section:** Set Build Command: `pnpm install && pnpm run build`
5. **Deploy section:** Set Start Command: `pnpm run start:server`
6. **Variables tab:** Verify these are all set (see section 2.4)
7. **Deployments tab:** Click "Deploy" to trigger first deployment
8. Watch build logs — should take 2–3 minutes
9. Success: "Server listening on port 8888" in logs

### 2.3 Create Workers Service (New Service)

**Steps:**
1. In Railway project canvas → click "+" button (bottom-left) → "GitHub Repo"
2. Select same repo: kashifnehal/bluebeaconresearch
3. Service is created — click on it
4. **Settings tab → Source:** Click "Add Root Directory" → `apps/backend`
5. **Build section:** `pnpm install && pnpm run build`
6. **Deploy section:** `pnpm run start:workers`
7. **Networking:** Do NOT add a public domain (workers don't receive HTTP requests)
8. **Variables tab:** Copy all same env vars from backend service
9. Rename service to "workers" (click service name at top)
10. Click "Deploy"
11. Watch logs: should see worker cron registrations

### 2.4 Required Environment Variables (Both Services)

```bash
# Core database
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Redis / Queue
UPSTASH_REDIS_REST_URL=https://YOUR_INSTANCE.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxxxxxxxxxx
REDIS_URL=redis://default:TOKEN@HOST:PORT  (if using Railway Redis plugin)

# AI
ANTHROPIC_API_KEY=sk-ant-api03-xxxx

# News sources
NEWS_API_KEY=xxxx
GNEWS_API_KEY=xxxx
# GUARDIAN_API_KEY=xxxx (add when implementing Guardian collector)
# TRADING_ECONOMICS_API_KEY=xxxx (add when implementing calendar)

# Alerts
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_PUBLIC_CHANNEL_ID=@BlueBeaconResearch  (when channel created)

# Server config
PORT=8888
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://bluebeaconresearch.com
```

**Variables already set in Railway (from screenshot):**
- ✅ ALPHA_VANTAGE_API_KEY (replace with Yahoo Finance — no key needed)
- ✅ ANTHROPIC_API_KEY
- ✅ API_URL
- ✅ NEWS_API_KEY
- ✅ NEXT_PUBLIC_SUPABASE_URL (rename → SUPABASE_URL or add separately)
- ✅ REDIS_URL
- ✅ SUPABASE_SERVICE_ROLE_KEY
- ✅ UPSTASH_REDIS_REST_TOKEN
- ✅ UPSTASH_REDIS_REST_URL
- ❌ SUPABASE_URL (missing — backend uses this name, not NEXT_PUBLIC_SUPABASE_URL)
- ❌ PORT=8888 (missing — Fastify must listen on 8888 to match domain config)
- ❌ TELEGRAM_BOT_TOKEN (missing)
- ❌ GNEWS_API_KEY (missing)
- ❌ NODE_ENV=production (missing)

### 2.5 Set Telegram Webhook (One-time, After API Service is Online)

```bash
# Verify current webhook status
curl https://api.telegram.org/botYOUR_TOKEN/getWebhookInfo

# Set webhook to Railway API URL
curl -X POST "https://api.telegram.org/botYOUR_TOKEN/setWebhook?url=https://api.bluebeaconresearch.com/v1/telegram/webhook"

# Expected response
{"ok":true,"result":true,"description":"Webhook was set"}
```

### 2.6 Verify Deployment Success

After both services deploy, run these checks:

```bash
# 1. API health check
curl https://api.bluebeaconresearch.com/health
# Expected: {"status":"ok","uptime":...}

# 2. Workers running — check Supabase SQL
SELECT COUNT(*) as events_last_hour, MAX(created_at) as latest
FROM raw_events
WHERE created_at > NOW() - INTERVAL '1 hour';
# Expected: count > 0 after 15 minutes

# 3. Signals being generated
SELECT id, title, severity, created_at
FROM signals
ORDER BY created_at DESC LIMIT 5;
# Expected: timestamps from today, not 4 months ago

# 4. Prices syncing
SELECT symbol, price, NOW()-fetched_at AS age
FROM commodity_prices
ORDER BY fetched_at DESC LIMIT 8;
# Expected: age < 20 minutes
```

---

## 3. VERCEL — WEB APP DEPLOYMENT

### 3.1 Current Configuration (Working)
- Framework: Next.js (auto-detected)
- Root directory: apps/web
- Branch: main (auto-deploy on push)
- Domain: bluebeaconresearch.com ✅

### 3.2 Required Environment Variables in Vercel

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_APP_URL=https://bluebeaconresearch.com
NEXT_PUBLIC_API_URL=https://api.bluebeaconresearch.com
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1Ijoixxxxxx
NEXT_PUBLIC_PROJECT_READY=true  # false = show waitlist modal
```

### 3.3 Deployment Trigger
- Auto-deploys on every push to `main` branch
- Manual deploy: Vercel dashboard → project → "Redeploy"
- Preview deploys: every PR gets a preview URL automatically

---

## 4. SUPABASE — DATABASE SETUP

### 4.1 Enable PostGIS
1. Supabase dashboard → project → "Database" → "Extensions"
2. Search "PostGIS" → Enable
3. Verify: run `SELECT PostGIS_version()` in SQL editor

### 4.2 Run Migrations (In Order)
Run each file in Supabase SQL editor:
```
000_init_schema.sql
001_rls_policies.sql
002_sanctions.sql
003_user_channels.sql
004_subscriptions.sql
005_backtest_cache.sql
006_api_keys.sql
007_new_user_trigger.sql
008_price_at_signal.sql       (needs to be created)
009_economic_calendar.sql     (needs to be created)
```

### 4.3 Make All Users Pro (While Stripe Is Stubbed)
```sql
UPDATE profiles SET plan_tier = 'pro';
```

### 4.4 Connection Pooling
In Supabase: Settings → Database → Connection Pooling → Enable PgBouncer (transaction mode)
Use the pooler connection string for the backend (not direct connection) to prevent connection exhaustion.

---

## 5. GOOGLE OAUTH SETUP (Manual Steps)

### 5.1 Google Cloud Console
1. console.cloud.google.com → New Project "Blue Beacon Research"
2. APIs & Services → Library → Enable "Google+ API"
3. APIs & Services → OAuth consent screen:
   - User type: External → CREATE
   - App name: "Blue Beacon Research"
   - Authorized domains: bluebeaconresearch.com, supabase.co
   - Save through all steps
4. APIs & Services → Credentials → + CREATE CREDENTIALS → OAuth client ID:
   - Application type: Web application
   - Name: "Blue Beacon Research Web"
   - Authorized JavaScript origins:
     - https://bluebeaconresearch.com
     - http://localhost:3000
   - Authorized redirect URIs:
     - https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback
     - http://localhost:3000/auth/callback
   - CREATE → copy Client ID and Client Secret

### 5.2 Supabase Google Provider
1. Supabase dashboard → Authentication → Providers → Google
2. Toggle ON
3. Paste Client ID and Client Secret
4. Save

### 5.3 Code (apps/web/app/auth/callback/route.ts)
Created via Cursor Prompt — exchanges OAuth code for session, checks onboarding_completed, redirects accordingly.

---

## 6. MONITORING & ALERTS

### 6.1 Error Monitoring (Sentry — Not Yet Set Up)
```bash
# Install
pnpm add @sentry/nextjs @sentry/node

# Configure apps/web/sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";
Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
```

### 6.2 Pipeline Health Check
- Endpoint: GET /v1/health/pipeline (needs build — see 05_API.md)
- Returns: last GDELT run, signals/hour, prices age, status
- Set up UptimeRobot (free) to ping /health every 5 minutes
- Alert via email if status = 'offline'

### 6.3 Claude AI Cost Monitoring
```typescript
// After every Claude API call, log usage:
const { usage } = await claude.messages.create({...})
await supabase.from('ai_usage_log').insert({
  model: 'claude-3-5-haiku',
  input_tokens: usage.input_tokens,
  output_tokens: usage.output_tokens,
  cost_usd: (usage.input_tokens * 0.0000008) + (usage.output_tokens * 0.000001),
  created_at: new Date()
})
```

Daily cap: if total cost > $10 today → pause classification worker, send admin alert.

---

## 7. CI/CD PIPELINE

**Current state:** Auto-deploy on GitHub push (both Vercel and Railway)

**Ideal CI/CD (not yet implemented):**
```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install
      - run: pnpm turbo type-check
      - run: pnpm turbo lint
  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Vercel
        run: vercel --prod --token ${{ secrets.VERCEL_TOKEN }}
      - name: Trigger Railway Deploy
        run: curl -X POST ${{ secrets.RAILWAY_WEBHOOK_URL }}
```

**Until CI/CD is set up:** Push to main branch manually. Both Vercel and Railway auto-deploy.

---

## 8. SCALING RUNBOOK

### At 1,000 users:
- Upgrade Supabase to Pro ($25/mo) — increase DB resources
- Enable Supabase connection pooling
- Monitor Railway memory usage — upgrade if > 80%

### At 5,000 users:
- SSE becomes DB bottleneck → implement Redis pub/sub fan-out for signal delivery
- Split workers into multiple Railway services by function (GDELT service, AI service, price service)
- Add read replica in Supabase for signal queries

### At 10,000 users:
- Move to dedicated infrastructure (AWS ECS or similar)
- CDN for static signal data (Cloudflare KV)
- Database partitioning: signals table by created_at month
- Rate limit per-user in addition to per-IP

### At 50,000+ users:
- Re-architect: separate microservices for collection, classification, delivery
- Consider Kafka for event streaming instead of BullMQ
- Multi-region deployment (US East, EU West, Asia-Pacific)
- Dedicated Elasticsearch for signal search
