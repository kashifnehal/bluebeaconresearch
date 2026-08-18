# 21_PROJECT_BRIEFING.md — New Project Onboarding Brief

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

**PURPOSE: Paste this file FIRST in any new Claude conversation or project about BBR.**
**Last synced: August 2026 — reflects CLAUDE_CONTEXT.md session logs through 2026-08-07**

---

## WHO YOU ARE WORKING WITH

You are assisting the founder of **Blue Beacon Research** — a geopolitical intelligence SaaS platform converting global events (conflicts, sanctions, policy shifts) into structured market signals for commodity traders, analysts, and businesses with market exposure.

The founder builds with AI coding tools (Antigravity/Cursor/Copilot). This project has months of prior decisions, architecture choices, and strategic reasoning already made. **Continue existing work — never suggest starting over, never propose replacing the tech stack.**

---

## THE SINGLE MOST IMPORTANT THING TO UNDERSTAND

**The product is a signal pipeline, not a UI project.**

```
RSS/GDELT/ACLED/GNews → isRelevantEvent() pre-filter → Claude 3.5 (or heuristic fallback) →
structured signal → Supabase DB → Dashboard feed + Telegram alerts
```

Both Railway services (backend API + workers) are currently **OPERATIONAL**. The pipeline is live and ingesting. The primary degraded component is **Anthropic API credit exhaustion** — the heuristic fallback classifier is active and producing signals, but AI-quality briefings are paused.

---

## ACTUAL CURRENT STATE (August 2026) — FROM VERIFIED SESSION LOGS

### ✅ CONFIRMED WORKING (do not re-implement these)

| Component | Status | Notes |
|-----------|--------|-------|
| Railway Backend (HTTP API) | ✅ Operational | `api.bluebeaconresearch.com` healthcheck passing |
| Railway Workers (Cron) | ✅ Operational | `sleepApplication: false`, heartbeat every 5m, collectors every 15m |
| Turborepo Monorepo | ✅ Operational | Clean structure, both services deploy from `apps/backend` |
| Next.js 16 Web App (Vercel) | ✅ Operational | Live at `bluebeaconresearch.com` |
| PostgreSQL Schema (Supabase) | ✅ Operational | 9 migrations applied (000–008 + event_date index) |
| Upstash Redis / BullMQ | ✅ Operational | `rediss://` TLS protocol fixed |
| Price Syncer (Yahoo Finance) | ✅ Operational | 8 commodities every 15 min — Alpha Vantage REPLACED |
| Heuristic Fallback Classifier | ✅ Operational | Dynamic confidence 55–90%, word-boundary filtering |
| Signal Pre-filter | ✅ Operational | `isRelevantEvent()` in gdelt + gnews collectors |
| Country Mapping | ✅ Operational | `COUNTRY_CODES` ISO-2 + `formatCountryName()` in ai-classifier |
| Duplicate Prevention | ✅ Operational | `contains(raw_event_ids, [rawEventId])` check before insert |
| Google OAuth 2.0 | ✅ Operational | PKCE flow, `/auth/callback/route.ts`, profile trigger |
| Interactive UI Controls | ✅ 100% Operational | All buttons, filters, modals, FABs, CSV downloads active |
| RSS Collectors | ✅ Operational | BBC, Al Jazeera, Guardian, NPR, UN News (Reuters 404 — others compensate) |

> ⚠️ UPDATED 2026-08-19 — the "9 migrations applied (000–008 + event_date index)" row is stale; `supabase/migrations/` now has 000–012 (13 files), including migration 012 (RLS consolidation, 6 new indexes, unique constraint) applied to the live DB 2026-08-19.

### ⚠️ DEGRADED (working but impaired)

| Component | Status | What's happening |
|-----------|--------|-----------------|
| **Claude AI Classifier** | ⚠️ Degraded — HIGH | Zero Anthropic credit. Heuristic fallback active. Signals generate but lack Claude briefings. Top priority: add Anthropic credits. |
| GDELT Ingestion | ⚠️ Degraded | HTTP 429 rate limits. 30s retry added. May still fail at peak. |
| GNews Ingestion | ⚠️ Degraded | Free tier — 1 query/run. Mostly duplicates after initial ingest. |
| RSS (Reuters) | ⚠️ Partial | `reutersagency.com` URL returns 404 on Railway. Other feeds compensate. |

### ❌ NOT YET SET UP (genuine open items)

| Item | Impact | Fix |
|------|--------|-----|
| `TELEGRAM_BOT_TOKEN` not in Railway | Telegram alerts not delivering | Add token to Railway workers env vars |
| `SUPABASE_SERVICE_ROLE_KEY` not on Vercel | `/api/signals` may return empty on some refreshes | Add key to Vercel environment variables |
| ACLED credentials not set | ACLED collector inactive | Set `ACLED_EMAIL` + `ACLED_PASSWORD` in Railway |
| Anthropic API credit = $0 | No Claude briefings | Top-up Anthropic account |

---

## TECH STACK — CONFIRMED AS OF AUGUST 2026 (DO NOT CHANGE)

```
Monorepo:     Turborepo + pnpm workspaces
Web:          Next.js 16 App Router + TypeScript + Tailwind CSS + Shadcn/ui
Backend:      Fastify 4 + Node.js 20 + TypeScript (PORT=3001 — corrected 2026-08-18; this
              line previously said 8888, which contradicted both apps/backend/src/env.ts's
              actual default and docs/brain/10_DECISIONS.md's "port 3001" record)
Queue:        BullMQ + Upstash Redis (MUST use rediss:// TLS, not redis://)
Database:     Supabase PostgreSQL (12 migrations applied as of 2026-08-18 — was 9)
AI:           Claude 3.5 Haiku (classification) + Sonnet (briefings) — HEURISTIC FALLBACK ACTIVE
Maps:         MapLibre GL JS + OpenStreetMap tiles (corrected 2026-08-18 — this said "Mapbox
              GL JS" but the actual dependency is maplibre-gl, no Mapbox token required;
              see 14_CHANGELOG.md v0.13.0/v0.16.1)
Price data:   Yahoo Finance (yahoo-finance2 npm) — Alpha Vantage fully replaced
Deploy web:   Vercel (bluebeaconresearch.com)
Deploy api:   Railway service "backend" — start:server — api.bluebeaconresearch.com
Deploy jobs:  Railway service "workers" — start:workers — headless, no public domain
Mobile:       Expo React Native (scaffolded, not submitted to stores)
```

**Two Railway services — both running from `apps/backend`:**
- **backend**: `pnpm run start:server` → config: `apps/backend/railway.json`
- **workers**: `pnpm run start:workers` → config: `apps/backend/railway.workers.json`
  - `"sleepApplication": false` is REQUIRED in `railway.workers.json` — without it Railway scales workers to zero on no HTTP traffic, killing all cron jobs

---

## DECISIONS ALREADY MADE AND IMPLEMENTED (DO NOT RE-LITIGATE)

1. **Yahoo Finance, not Alpha Vantage** — Alpha Vantage free = 25 req/day (exhausted immediately). Yahoo Finance = unlimited free via `yahoo-finance2`
2. **Heuristic fallback classifier** — When Anthropic credits = $0, heuristic scoring (55–90% confidence, keyword-based) keeps the pipeline alive. Always maintain this fallback.
3. **`event_date` not `created_at` shown in UI** — Dashboard timestamps show when articles were **published**, not when BBR ingested them. A signal ingested 5 minutes ago from a 12-hour-old BBC article shows "12 hours ago." This is intentional (v0.10.0 decision).
4. **Price 3-tier fallback** — `apps/web/app/api/prices/route.ts`: Supabase DB → Redis cache → Hardcoded static fallback. Frontend NEVER receives null prices.
5. **`rediss://` not `redis://`** — Upstash Redis requires TLS. `REDIS_URL` must use `rediss://` prefix for `ioredis`. REST `https://` URL is for `@upstash/redis` HTTP calls only — different clients.
6. **`window.location.href` not `router.push` after login** — Ensures Supabase auth cookies attach correctly for Next.js SSR middleware evaluation
7. **WebSocket polyfill for Node 20** — `globalThis.WebSocket = ws` required in `apps/backend/src/clients/supabase.ts` to prevent Node 20 Supabase Realtime crash
8. **Signal pre-filter implemented** — `HIGH_RELEVANCE_KEYWORDS` + `EXCLUDE_KEYWORDS` + `isRelevantEvent()` in both `gdelt-collector.ts` and `gnews-collector.ts`
9. **Country codes mapping implemented** — `COUNTRY_CODES` ISO-2 dictionary + `formatCountryName()` in `ai-classifier.ts`
10. **Duplicate prevention implemented** — `.contains("raw_event_ids", [rawEventId])` check in `ai-classifier.ts` before signal insert
11. **Google OAuth fully implemented** — PKCE flow in `/auth/callback/route.ts`, `handle_new_user()` trigger captures Google display name from `raw_user_meta_data`
12. **Stripe fully stubbed** — All users = 'pro'. Implement only when first person asks to pay.
13. **Global positioning, not India-specific** — Bigger TAM, better brand
14. **"Research firm", not "AI tool"** — Never call it "an AI tool." Always "AI-powered research platform with analyst team"

---

## PRODUCT POSITIONING (MEMORISE)

**What it is:** Geopolitical intelligence → structured market signals → Telegram alerts before markets open. 1/40th the cost of Bloomberg.

**Who it's for:** Commodity traders (oil, gold, wheat futures), import/export SMBs, boutique fund analysts, quant/algo builders.

**Legal position:** Intelligence platform — NOT financial advice. Every signal: "Intelligence for informational purposes only. Not financial advice."

**Pricing:** Free (4hr delay), $49/mo Analyst (real-time + Telegram), $199/mo Pro (API + backtesting), $499/mo Institutional.

---

## DATA PIPELINE — HOW IT ACTUALLY WORKS NOW

```
Railway workers (startup + every 15m)
  RSS (BBC, Al Jazeera, Guardian, NPR, UN News) + GNews + GDELT
        ↓
isRelevantEvent() — ~70% of articles filtered out
        ↓
Deduplicate by external_id — most remaining already in DB
        ↓
Insert into raw_events + BullMQ ai-classification queue
        ↓
AI Classifier (Claude 3.5 Haiku if credits > 0, ELSE heuristic fallback)
        ↓
Insert into signals table (event_date = article PUBLISH time)
        ↓
/api/signals (default: 24h fresh + active ongoing events)
        ↓
Dashboard shows event_date → "X hours ago" = article publish time, NOT ingestion time
```

**Verify pipeline health in Supabase SQL:**
```sql
SELECT title, created_at, event_date,
       NOW() - created_at AS ingested_ago,
       NOW() - event_date AS published_ago
FROM signals ORDER BY created_at DESC LIMIT 5;
```
If `created_at` is recent but `event_date` shows old times — this is normal. `event_date` = publish time.

**Verify in Railway logs (workers service):**
```
startup:rss → { inserted: N, signals: N }     ← should appear within 30s of deploy
workers:heartbeat                              ← every 5 min
rss-collector                                 ← every 15 min
price-sync                                    ← every 15 min
```

---

## ENVIRONMENT VARIABLES — COMPLETE REFERENCE

### Railway (both services need these)
```env
NODE_ENV=production
PROJECT_READY=true
PORT=3001

# Supabase — corrected 2026-08-18: this block previously cited project ref
# jzomoxsbnssnibshecui, an old/wrong project. The current status doc and the real
# .env.local agree on evavcgfmemwryggdkjmx — updated to match those, not the other
# way around (see docs/brain/CLAUDE_CONTEXT.md's own correction of the same stale ref).
SUPABASE_URL=https://evavcgfmemwryggdkjmx.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://evavcgfmemwryggdkjmx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>

# Redis — MUST be rediss:// (TLS) for ioredis / BullMQ
REDIS_URL=rediss://default:<token>@cute-javelin-200660.upstash.io:6379
UPSTASH_REDIS_REST_URL=https://cute-javelin-200660.upstash.io
UPSTASH_REDIS_REST_TOKEN=<token>

# AI (top up credits — currently $0)
ANTHROPIC_API_KEY=<anthropic_key>

# News sources
NEWS_API_KEY=<gnews_key>
GNEWS_API_KEY=<gnews_key>   ← alias fallback in env.ts

# Market data (Yahoo Finance used — Alpha Vantage key kept but unused)
ALPHA_VANTAGE_API_KEY=<key>

# Alerts (NOT YET CONFIGURED — needed for Telegram delivery)
TELEGRAM_BOT_TOKEN=          ← ADD THIS

# App URL
NEXT_PUBLIC_APP_URL=https://bluebeaconresearch.com
API_URL=https://bluebeaconresearch.com

# Optional (improves signal quality)
ACLED_EMAIL=                 ← ADD THIS
ACLED_PASSWORD=              ← ADD THIS
```

### Vercel (web app)
```env
NEXT_PUBLIC_SUPABASE_URL=https://evavcgfmemwryggdkjmx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>   ← REQUIRED — add to Vercel or /api/signals unreliable
NEXT_PUBLIC_MAPBOX_TOKEN=<mapbox_token>
PROJECT_READY=true
NEXT_PUBLIC_APP_URL=https://bluebeaconresearch.com
```

> ⚠️ UPDATED 2026-08-19 — `NEXT_PUBLIC_MAPBOX_TOKEN` is stale (same Mapbox→MapLibre issue already corrected above at the tech-stack table): the map uses `maplibre-gl` + OpenStreetMap tiles and does not require a Mapbox token.

---

## IMMEDIATE PRIORITY — THE ONLY 4 THINGS THAT MATTER NOW

> ⚠️ UPDATED 2026-08-19 — items 1–3 below are still literally open, but this list is no longer "the only things that matter": a 2026-08-18/19 pass fixed a separate, more severe bug (alert dispatch and severity≥7 AI briefings were never triggered at all due to a dormant/unfed BullMQ queue, independent of the Telegram token issue below), plus wired up Sentry, PostHog, CI, and a DB cleanup/reliability pass. See `docs/brain/08_CURRENT_STATUS.md` and `14_CHANGELOG.md` for the current punch list.

**1. Top up Anthropic API credits** (15 minutes)
Go to console.anthropic.com → Billing → Add credits. The heuristic fallback keeps the system alive but Claude briefings are the core product value. Without credits, signal quality is degraded.

**2. Add TELEGRAM_BOT_TOKEN to Railway** (5 minutes)
Railway → workers service → Variables → add `TELEGRAM_BOT_TOKEN`. Without this, zero users receive Telegram alerts regardless of their alert rules.

**3. Add SUPABASE_SERVICE_ROLE_KEY to Vercel** (5 minutes)
Vercel → project → Settings → Environment Variables → add key. Without this, `/api/signals` returns empty on some SSR refreshes.

**4. Set Telegram webhook** (2 minutes, after token is added)
```bash
curl -X POST "https://api.telegram.org/botYOUR_TOKEN/setWebhook?url=https://api.bluebeaconresearch.com/v1/telegram/webhook"
```

---

## DATABASE SCHEMA — MIGRATIONS APPLIED

9 migrations confirmed applied in Supabase:
```
000_init_schema.sql        — core tables, UUID extensions, indexes
001_rls_policies.sql       — Row Level Security for tenant isolation
002_sanctions.sql          — sanctions_matches JSONB column
003_user_channels.sql      — telegram_chat_id, slack_webhook_url table
004_auth_triggers.sql      — handle_new_user() trigger (captures Google name)
005_fix_profiles_rls.sql   — RLS update for profile creation during auth
006_onboarding_schema_fix.sql — onboarding wizard state columns
007_waitlist.sql           — waitlist submission schema
008 (event_date index)     — index on event_date for feed performance
```

> ⚠️ UPDATED 2026-08-19 — this list is stale; `supabase/migrations/` now goes through 012: `009_signals_event_date.sql`, `010_add_product_tour_flag.sql`, `011_rls_remediation.sql`, and `012_reliability_indexes_and_cleanup.sql` (applied to the live DB 2026-08-19, verified via Supabase Advisors) have since landed. Also, `production_schema.sql` (mentioned as a possible schema reference elsewhere in the docs) was deleted 2026-08-19 for only describing 4 of 17 real tables — `supabase/migrations/*.sql` is now the only accurate schema source.

**user_channels table** (actual structure — differs from earlier docs):
```sql
user_id              UUID PK, FK profiles.id ON DELETE CASCADE
telegram_chat_id     TEXT nullable
telegram_connected_at TIMESTAMPTZ
slack_webhook_url    TEXT nullable
slack_connected_at   TIMESTAMPTZ
```

---

## COMPETITORS — QUICK REFERENCE

| Competitor | Threat | Key gap vs BBR |
|-----------|--------|----------------|
| WorldMonitor | HIGHEST | 59K stars, free+Pro, AI chat — but no personalized alerts per user, no backtesting |
| Bloomberg | Benchmark | $24K/year — BBR is 1/40th the price |
| Stocknews.ai | Conceptual | Stocks not commodities — borrow: price-at-signal display |
| ForexFactory | Daily habit | Economic calendar — BBR's biggest missing feature |
| FinancialJuice | Partial | Audio squawk — borrow: browser alert sound for severity 9+ |
| Glint.trade | None | Prediction markets, different customer |

**Biggest missing feature: Economic Calendar (/calendar page)**
Every tool traders use daily has CPI/NFP/Fed decision calendar. BBR has none. Add after Anthropic credits restored.

---

## HOW TO WORK WITH THIS PROJECT

**When asked to build something new:**
1. Check if it's already built — CLAUDE_CONTEXT.md logs all implemented changes
2. Check 09_BACKLOG.md — is it already prioritised?
3. Check 10_DECISIONS.md — has this been decided before?
4. Always use existing tech stack. No new frameworks.

**When debugging a pipeline issue:**
1. Check Railway workers logs first — `startup:rss` and `workers:heartbeat` tell you if cron is running
2. Run the Supabase SQL above — compare `created_at` vs `event_date`
3. Check `SUPABASE_SERVICE_ROLE_KEY` is set on Vercel if dashboard returns empty
4. `event_date` showing "old" timestamps is NOT a bug — it's article publish time

**What to NEVER do:**
- Never suggest rewriting the stack
- Never add features competing with WorldMonitor on breadth (more data feeds, data layers)
- Never make buy/sell recommendations in signal copy or UI
- Never call it "an AI tool" — always "a research platform"
- Never remove the terminal aesthetic (dark design, Node/Encryption cosmetic elements) — intentional brand
- Never use `router.push` after auth actions — use `window.location.href` for SSR cookie attachment
- Never use `redis://` — always `rediss://` (TLS required by Upstash/ioredis)
