# Blue Beacon Research — Tactical Intelligence Terminal

> **Geopolitical Risk Intelligence → Actionable Market Signals**

Blue Beacon Research is a real-time geopolitical intelligence platform. It automatically collects conflict and political risk events from external data sources (GDELT, ACLED, and GNews), classifies them using Claude AI, and converts them into structured "signals" scored by severity and commodity market impact.

## 🚀 Key Features

- **Autonomous Intelligence Pipeline**: Ingests up to 350+ new world events every 15 minutes.
- **AI Signal Mapping**: Bridges raw geopolitical news with financial market predictions (Oil, Gold, Natural Gas).
- **Multi-Channel Alerting**: Instant dispatch via Telegram, Slack, Webhooks, and Push for severity ≥ 7 events.
- **Tactical Dashboard**: High-fidelity dark-mode interface with interactive conflict hotspots.
- **Access Control**: Built-in "Access Limited" waitlist to gate the application until production readiness.

## 🏗 Tech Stack & Architecture

- **Monorepo**: Turborepo, pnpm workspaces (`apps/web`, `apps/api`, `apps/mobile`).
- **Web App**: Next.js 15 (App Router), React, TailwindCSS, Framer Motion.
- **Backend API**: Fastify, Node.js, BullMQ (for async workers/cron jobs).
- **Database & Auth**: Supabase (PostgreSQL, Row Level Security).
- **Cache & Queues**: Upstash Redis (REST logic in Web, strict Redis protocol in API).
- **AI**: Anthropic Claude 3.5 Sonnet.

---

## 🛠 Complete Local Setup Guide

If you are opening this project from a fresh clone in VSCode or Cursor, follow these exact steps to run it locally.

### 1. Prerequisites
- **Node.js**: >= 18.0.0
- **pnpm**: >= 8.0.0 (`npm install -g pnpm`)
- **Docker** (Optional, if running a local Redis/Supabase instance instead of cloud).

### 2. Environment Variables & Secrets
Security is critical. **Never commit actual API keys to Git.** The repository uses `.env` as a safe placeholder template and ignores `.env.local` for your real secret keys.

1. Create a `.env.local` file in the root of the workspace:
   ```bash
   touch .env.local
   ```
2. Populate `.env.local` with your actual development keys:

   ```env
   # --- SUPABASE ---
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

   # --- REDIS (UPSTASH) ---
   # Used by Next.js edge functions
   UPSTASH_REDIS_REST_URL=https://your-upstash.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your-token
   # Used by Fastify API & BullMQ workers (Must be a protocol URL!)
   REDIS_URL=rediss://default:password@your-upstash.upstash.io:6379

   # --- APP URLs ---
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   API_URL=http://localhost:3001

   # --- EXTERNAL APIs ---
   ANTHROPIC_API_KEY=your-claude-key
   NEWS_API_KEY=your-newsapi-key
   ALPHA_VANTAGE_API_KEY=your-alphavantage-key

   # --- FEATURE FLAGS ---
   PROJECT_READY=false
   ```

### 3. Database Initialization
Ensure your Supabase project has the correct tables. If deploying to a fresh database, run the `supabase/production_schema.sql` script in your Supabase SQL Editor.

### 4. Installation & Execution
Install dependencies and run the entire stack simultaneously:
```bash
pnpm install
pnpm run dev
```

This will concurrently start:
- `apps/web`: The Next.js dashboard on `http://localhost:3000`
- `apps/api` (Server): The Fastify API on `http://localhost:3001`
- `apps/api` (Workers): The background collectors, AI classifiers, and alert dispatchers.

---

## 🌍 Production Deployment Guide (Vercel)

This repository is optimized for zero-config deployments on **Vercel**. 

### 1. Prepare Vercel project
1. Import the repository into your Vercel dashboard.
2. Vercel automatically detects Next.js. The root directory should remain as the default (`/`).
3. Ensure the Build Command uses Turborepo: `turbo run build` or `pnpm run build`.

### 2. Configure Vercel Environment Variables
Go to **Vercel -> Settings -> Environment Variables** and add *all* the keys from your `.env.local`.

**Crucial Production Values:**
- `NEXT_PUBLIC_APP_URL`: `https://bluebeaconresearch.com`
- `API_URL`: `https://bluebeaconresearch.com`
- `PROJECT_READY`: Set to `true` when you want to bypass the waitlist.

> **Note on Turbo & Env Vars:** The Vercel build will automatically pull these variables through `turbo` because they are explicitly whitelisted in `turbo.json`. If you add new environment variables in the future, you *must* add them to the `env` array in `turbo.json` or they will be undefined during the build step.

### 3. Backend Deployment (Optional if moving API away from Next.js serverless)
Currently, `apps/web` is deployed to Vercel perfectly. `apps/api` is built to pure Node.js ESM. 
If Vercel's serverless platform limits the long-running background workers in `apps/api`, you can deploy `apps/api` individually setting to platforms like **Railway** or **Render**:
1. Connect the Repo.
2. Set Root Directory to `apps/api`.
3. Build Command: `pnpm run build`
4. Start Command: `pnpm run start:server` and a separate worker process running `pnpm run start:workers`.

---
*BB-ALPHA MAIN CONTROL: v1.0.0*
