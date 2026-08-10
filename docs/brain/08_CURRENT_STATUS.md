# 08_CURRENT_STATUS.md — Repository Status & System Audit Matrix

Last updated: 2026-08-10

---

## 1. Production Readiness Overview

| Subsystem | Status | Notes |
| :--- | :--- | :--- |
| **Turborepo Monorepo Architecture** | ✅ Operational | Clean monorepo structure |
| **Next.js 16 Web App (Vercel)** | ✅ Operational | Build clean, SSR-safe, zero window crashes |
| **PostgreSQL Schema (Supabase)** | ✅ Operational | 9 migrations applied (including 009 event_date) |
| **GNews Ingestion** | ✅ Operational | Multi-query search, automatic deduplication |
| **GDELT Ingestion** | ✅ Operational | Connected to active `v2/doc/doc` endpoint |
| **Price Syncer (Yahoo Finance)** | ✅ Operational | Real-time prices synced for 8 commodity benchmarks |
| **Claude AI Classifier** | ⚠️ Degraded | Zero Anthropic credit — dynamic heuristic fallback active |
| **Heuristic Fallback Classifier** | ✅ Operational | Dynamic confidence scoring (55%–90%) across 5 factors |
| **Upstash Redis / BullMQ** | ✅ Operational | Fixed `rediss://` TLS protocol |
| **Interactive UI Controls** | ✅ 100% Operational | All buttons, filters, modals, FABs, and CSV downloads active |

---

## 2. Data Pipeline State (as of 2026-08-10)

- **`raw_events`**: 14 rows (GNews & GDELT events)
- **`signals`**: 14 rows (all with accurate `event_date` publication timestamps)
- **`commodity_prices`**: 8 rows (WTI Crude $78.80, Gold $4,399.50, Natural Gas, Wheat, Copper, Silver, Corn, Brent)

The pipeline runs automatically on startup and on 15-minute cron intervals.

---

## 3. How the Data Pipeline Works

```
GNews API (every 15m)
        ↓
gnews-collector.ts fetches 10 articles
        ↓
isRelevantEvent() keyword filter
        ↓
Insert into raw_events (source='newsapi')
        ↓
ClaudeService.classifyEvent()
  → If Anthropic API has credit: calls claude-3-5-haiku
  → If Anthropic fails (credit/rate): heuristicClassify() runs locally
        ↓
Insert into signals table
        ↓
Next.js /api/signals → Frontend
```

Workers also sync commodity prices via Yahoo Finance every 15 minutes into `commodity_prices`.

---

## 4. Known Issues & Action Items

| Issue | Severity | Status |
| :--- | :--- | :--- |
| Anthropic API credit exhausted | High | **Add credits at console.anthropic.com** — heuristic fallback active |
| `raw_events.source` check constraint excludes `gnews` | Fixed | Mapped GNews → `newsapi` source value; migration 008 created |
| `yahoo-finance2` v3 API change (`new YahooFinance()`) | Fixed | price-syncer.ts updated |
| GDELT URL was 404 (wrong endpoint) | Fixed | Now uses `/api/v2/doc/doc` |
| Redis TLS (`redis://` → `rediss://`) ECONNRESET | Fixed | `.env.local` and `redis.ts` updated |
| `.env.local` had wrong Supabase project URL | Fixed | Restored to `evavcgfmemwryggdkjmx.supabase.co` |
| Google OAuth `window is not defined` SSR crash | Fixed | `redirectTo` uses `useState` + `useEffect` |
| Middleware used `getSession()` instead of `getUser()` | Fixed | Security fix applied in `middleware.ts` |
| ACLED collector requires email/password auth | Open | Set `ACLED_EMAIL` + `ACLED_PASSWORD` in Railway env |
| Telegram alerts not working | Open | `TELEGRAM_BOT_TOKEN` not set in Railway |

---

## 5. Environment Variables Required

### Supabase (both `.env.local` and Vercel)
```
NEXT_PUBLIC_SUPABASE_URL=https://evavcgfmemwryggdkjmx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

### Redis (`.env.local` and Railway)
```
REDIS_URL=rediss://default:<token>@<host>:6379   ← MUST be rediss:// (TLS)
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

### Data Sources (Railway workers env)
```
NEWS_API_KEY=<gnews token>
ANTHROPIC_API_KEY=<add credits at console.anthropic.com>
ALPHA_VANTAGE_API_KEY=<optional, price syncer uses Yahoo Finance>
ACLED_EMAIL=<your acled email>
ACLED_PASSWORD=<your acled password>
```
