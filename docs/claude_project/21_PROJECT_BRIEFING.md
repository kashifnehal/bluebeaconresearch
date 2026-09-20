# 21_PROJECT_BRIEFING.md — New Project Onboarding Brief

> **📍 Doc status — current as of 2026-09-20.** This file is still the durable onboarding brief (why / stack / standing rules). It is **not** the live punch list. `claude/23_TODO.md` and `22_SESSION_HANDOFF.md` are **not in this repo** — do not look for them.
>
> **After this file, read in order:** `docs/brain/LIVE_TODO.md` → `docs/brain/08_CURRENT_STATUS.md` → `docs/brain/14_CHANGELOG.md` (latest is v0.78.0, this docs catch-up). Canonical tree: `docs/claude_project/`. Technical annex: `docs/brain/`. Strategy handoff written 2026-09-16, patched 2026-09-20: `docs/brain/00_CURRENT_BBR_CONTEXT.md`.

**PURPOSE: Paste this file FIRST in any new Claude conversation or project about BBR.**
**Last synced: 2026-09-20 — live state through search-quality fix (Cmd+K Fuse.js + `sort=relevance`)**

---

## WHO YOU ARE WORKING WITH

You are assisting the founder of **Blue Beacon Research** — a geopolitical intelligence SaaS platform converting global events (conflicts, sanctions, policy shifts) into structured market signals for commodity traders, analysts, and businesses with market exposure.

The founder builds with AI coding tools (Antigravity/Cursor/Copilot). This project has months of prior decisions, architecture choices, and strategic reasoning already made. **Continue existing work — never suggest starting over, never propose replacing the tech stack.**

---

## THE SINGLE MOST IMPORTANT THING TO UNDERSTAND

**The product is a signal pipeline, not a UI project.**

```
RSS / GDELT / GNews / ACLED (creds still missing)
        ↓
isRelevantEvent() pre-filter + title-prefilter
        ↓
classifyEvent() — Claude Haiku if credits > 0, ELSE heuristic (severity hard-capped at 6)
        ↓
materiality gate (#141) — materialityPass=false skips signals insert; raw_events kept
        ↓
insertOrMergeSignal() → Supabase `signals`
        ↓
Next.js BFF GET /api/signals (reads Supabase directly — does NOT proxy Fastify)
        ↓
Dashboard / map / watchlist / event-detail / Cmd+K
```

Both Railway services (backend API + workers) are **OPERATIONAL**. The pipeline is live. The primary degraded component is still **Anthropic API credit** — heuristic fallback covers classification; quality briefings/chat suffer when credits are out.

---

## ACTUAL CURRENT STATE (2026-09-20)

Do not treat a row that says "✅ 100% Operational" as ground truth without checking `docs/brain/08_CURRENT_STATUS.md`. Schema source of truth is `supabase/migrations/*.sql` plus `docs/brain/04_DATABASE.md` / `docs/brain/16_MIGRATION_CHECKLIST.md` — not the August "9 migrations" list later in this file.

### ✅ SHIPPED — do not re-implement

| Surface | Notes |
|---------|--------|
| Railway backend + workers | `api.bluebeaconresearch.com`; workers `sleepApplication: false` |
| Next.js 16 web (Vercel) | `bluebeaconresearch.com` |
| Supabase | Live project `evavcgfmemwryggdkjmx` |
| Forex taxonomy (#87) | 6 pairs end-to-end (prefs, feed, alerts, digest) |
| Event-page chat (#111) | Grounded on that signal only; buy/sell + position-advice refusal |
| Public `/accuracy` (#121/#144) | 48h headline; worker also writes 1h/4h/24h rows |
| Materiality gate (#141) | First real reject step; 8 new `signals` columns |
| Live `media_impact_watchlist` (#142) | 8 sourced rows as of 2026-09-19 (no Trump-named individual row) |
| MARKET IMPACT ASSESSMENT (#143) | Event-detail + quick-view; novelty / source confirmation / why-this-signal when present |
| Economic calendar (#86) | `/calendar` — static curated list, not a paid live API |
| Logged-in Help (#155) | `/help` FAQ + `feedback_submissions` (table, not Resend) |
| Cmd+K | Fuse.js fuzzy+keyword on Pages/Watchlist/Rules; Signals use `sort=relevance`; Suggested RAG fallback when <2 hits |
| Discord alerts | Webhook-URL paste only (no bot/OAuth) |
| Demo accounts (#146) | 10 `demo01@`–`demo10@` with `profiles.is_test_account`; excluded from metrics/digest |
| Fastify `/docs` | Swagger is **dev/test only** — production was briefly a public OpenAPI dump |

### ⚠️ DEGRADED / STILL OPEN

| Item | Status |
|------|--------|
| Anthropic credit | Heuristic fallback covering; 7/8/9 severity only from real Claude |
| `TELEGRAM_BOT_TOKEN` | Intentionally deferred by founder; connect UX (#112) exists, delivery still blocked |
| `SUPABASE_SERVICE_ROLE_KEY` on Vercel | Required for reliable server-side `/api/signals` |
| ACLED credentials | Collector inactive until licensed + set |
| #143 leftover | `relevance` / `materiality_pass` still unread in UI (`materiality_pass` is a write-time gate) |
| #142 leftover | Trump-named watchlist row is a founder positioning decision — do not add from a coding session |
| #127 leftover | Map chokepoint/pipeline layers still gated on a vendor-cost check |

---

## TECH STACK — CONFIRMED AS OF AUGUST 2026 (DO NOT CHANGE)

```
Monorepo:     Turborepo + pnpm workspaces
Web:          Next.js 16 App Router + TypeScript + Tailwind CSS + Shadcn/ui
Backend:      Fastify 4 + Node.js 20 + TypeScript (PORT=3001 — corrected 2026-08-18; this
              line previously said 8888, which contradicted both apps/backend/src/env.ts's
              actual default and docs/brain/10_DECISIONS.md's "port 3001" record)
Queue:        BullMQ + Upstash Redis (MUST use rediss:// TLS, not redis://)
Database:     Supabase PostgreSQL (`supabase/migrations/*.sql` — far past the August "12 migrations" count; see `docs/brain/16_MIGRATION_CHECKLIST.md`)
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
15. **"Established research company" — never reveal data-history recency** — Product copy, UI, and methodology/about pages must never state or imply how recently BBR's real data history began (D19 / ADR 015). Framing rule only — does not relax "no unsourced precision" or "build it before you claim it."

---

## PRODUCT POSITIONING (MEMORISE)

**What it is:** Geopolitical intelligence → structured market signals → Telegram alerts before markets open. 1/40th the cost of Bloomberg.

**Who it's for:** Commodity traders (oil, gold, wheat futures), import/export SMBs, boutique fund analysts, quant/algo builders.
- **Forex traders — shipped.** Currency-pair signals, personalization, and alert/digest matching for the 6 majors (EUR/USD, GBP/USD, USD/JPY, USD/CHF, USD/RUB, USD/CNY) are live end-to-end (#87, all 3 phases, 2026-09-09).
- **Equity swing/day-traders — under evaluation.** Still gated behind its own validation checkpoint; no schema or product work started (see ADR 013 / D17).

**Legal position:** Intelligence platform — NOT financial advice. Every signal: "Intelligence for informational purposes only. Not financial advice."

**Pricing:** Free (4hr delay), $49/mo Analyst (real-time + Telegram), $199/mo Pro (API + backtesting), $499/mo Institutional.

---

## DATA PIPELINE — HOW IT ACTUALLY WORKS NOW

```
Railway workers (startup + every 15m)
  RSS (BBC, Al Jazeera, Guardian, NPR, UN News) + GNews + GDELT
        ↓
isRelevantEvent() / title-prefilter — most articles dropped
        ↓
Deduplicate by external_id — most remaining already in DB
        ↓
Insert into raw_events; classify inline (BullMQ ai-classification queue is dormant)
        ↓
classifyEvent() — Haiku if credits > 0, ELSE heuristic (severity ≤6)
        ↓
materiality gate — false skips signals insert; raw_events kept; reject logged
        ↓
insertOrMergeSignal() (cross-source merge / escalation)
        ↓
signals.event_date = article PUBLISH time, not ingestion time
        ↓
Next.js BFF /api/signals (Supabase direct) → dashboard
```

Authoritative pipeline writeup: `docs/brain/15_INGESTION_PIPELINE.md`. Do not restore the old "classify → always insert" shape.

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

# Supabase — live project ref evavcgfmemwryggdkjmx (matches .env.local and
# docs/brain/08_CURRENT_STATUS.md). A previous env block here cited a different,
# unused project; corrected 2026-08-18.
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
GNEWS_API_KEY=<gnews_key>   ← canonical name as of 2026-08-22 (NEWS_API_KEY retired, legacy fallback only)

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
PROJECT_READY=true
NEXT_PUBLIC_APP_URL=https://bluebeaconresearch.com
```

> ⚠️ UPDATED 2026-08-27 — `NEXT_PUBLIC_MAPBOX_TOKEN` was flagged as stale here on 2026-08-19 but the line itself was never actually removed from the env block above (two sessions of "note it, don't fix it"). Removed now: the map uses `maplibre-gl` + OpenStreetMap tiles and has never required a Mapbox token — nothing reads this env var anywhere in the codebase.

---

## IMMEDIATE PRIORITY — STILL OPEN (founder / ops)

Live punch list: `docs/brain/LIVE_TODO.md` + `docs/claude_project/09_BACKLOG.md` numbered tickets. These four ops items from August are **still open**; they are not the only work that exists.

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

> ⚠️ UPDATED 2026-09-20 — the numbered list below is **August 2026 history**. Do not treat "9 migrations" or the 2026-08-19 "through 012" note as current. Live schema: `supabase/migrations/*.sql`. Checklist: `docs/brain/16_MIGRATION_CHECKLIST.md`. Table/column docs: `docs/brain/04_DATABASE.md`. Recent additions include `signal_chat_messages`, `signal_outcomes` (unique on `signal_id, asset, checkpoint_hours`), 8 materiality columns on `signals`, `media_impact_watchlist`, `search_content_embeddings`, `feedback_submissions`, `profiles.is_test_account`, Discord columns on `user_channels`.

9 migrations confirmed applied in Supabase (historical snapshot — incomplete):
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

> ⚠️ UPDATED 2026-08-19 — this list is stale; `supabase/migrations/` now goes through 012: `009_signals_event_date.sql`, `010_add_product_tour_flag.sql`, `011_rls_remediation.sql`, and `20260817220713_consolidate_user_channels_rls.sql` / `20260817220714_reliability_indexes_parts_2_4.sql` (applied to the live DB 2026-08-19, verified via Supabase Advisors) have since landed. Also, `production_schema.sql` (mentioned as a possible schema reference elsewhere in the docs) was deleted 2026-08-19 for only describing 4 of 17 real tables — `supabase/migrations/*.sql` is now the only accurate schema source.

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

**Economic Calendar:** shipped 2026-09-07 (#86) as `/calendar` on a static curated file (deliberate v1). Not a live paid calendar API. Map chokepoint/pipeline layers (#127 leftover) are still gated.

---

## HOW TO WORK WITH THIS PROJECT

**When asked to build something new:**
1. Check `docs/brain/LIVE_TODO.md` Closed, verified — most recent ships are there, with SHAs
2. Check `docs/claude_project/09_BACKLOG.md` numbered tickets and `docs/claude_project/10_DECISIONS.md`
3. Check the topic file for that surface (`05_API`, `04_DATABASE`, `06_COMPONENTS`, `18_AI_ENGINE`)
4. Always use existing tech stack. No new frameworks.
5. `docs/claude_project/22_IMPLEMENTATION_LOG.md` and `docs/brain/CLAUDE_CONTEXT.md` are **August session logs**, not the current changelog.

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
- Never state or imply how recently BBR's real data history began (D19 / ADR 015)
- Dashboard stays a dark terminal. Public landing (`app/page.tsx`) uses research-register copy as of 2026-09-20 (v0.75.0) — do not restore fabricated latency/integrity/archive claims or the old sci-fi CTAs
- Never use `router.push` after auth actions — use `window.location.href` for SSR cookie attachment
- Never use `redis://` — always `rediss://` (TLS required by Upstash/ioredis)
