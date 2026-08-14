# 08_CURRENT_STATUS.md — Repository Status & System Audit Matrix

Last updated: 2026-08-12
Last updated: 2026-08-14

---

| Subsystem | Status | Notes |

- **`Global Map`**: `/map` now plots geolocated events from real `lat`/`lng` values in `/api/signals` using **MapLibre GL** with OpenStreetMap tiles (no Mapbox token required). The frontend will display a small degraded-mode banner and continue to show the last available data when the server returns a cached fallback due to upstream rate-limiting or DB errors.

## Recent Reliability Work (2026-08-13 → 2026-08-14)

- **Adaptive Signals Cooldown**: `/api/signals` now implements an adaptive cooldown (exponential backoff) when upstream rate-limiting or errors occur. The server will return the last-successful cached payload and enter a cooldown window (configurable via `SIGNALS_COOLDOWN_MS` and `SIGNALS_COOLDOWN_MAX_MS`) to avoid repeated external calls.
- **In-Process Gate + DEV_SKIP_UPSTASH**: Added a per-process token gate to short-circuit repeated external calls during bursts and a `DEV_SKIP_UPSTASH` env flag to skip rate-limit checks in dev for better local DX.
- **Redis Rate-Limiter POCs**: Implemented centralized Redis POCs including a sorted-set token-bucket and a Lua atomic token-bucket. `rateLimitOrPass` prefers the Redis/Lua implementation when `REDIS_URL` is present and falls back to Upstash or in-process checks.
- **SSE Token/Proxy Pattern**: Stabilized Server-Sent Events by minting short-lived tokens and exposing a `/api/events/proxy` that allows `EventSource` connections without Authorization headers.
- **Reduced Client Polling**: Increased signal polling interval to 120s with jitter to reduce Upstash/REST pressure during load tests.
- **UI Controls**: `TopBar` debounced search now applies client-side filtering only when empty or >=3 chars (Enter still triggers server search). `Backtesting` mock responses now include `isDemo: true` and the UI displays an amber disclaimer banner.

These changes aim to preserve the `/api/signals` contract and ensure graceful degraded-mode semantics (the API returns `fallback: true` and `fallbackReason` when serving cached data). For production hardening the next step is provisioning a central Redis instance and migrating the token-bucket to a single authoritative store (or upgrading Upstash plan).

Infra update: On 2026-08-14 the Redis migration scaffolding and docs were added and merged into `main`. See `infra/redis/README_REDIS.md` for provisioning steps and the recommended canary rollout. The local docker-compose and CI job were also added to validate the Lua token-bucket implementation.
| :---------------------------------- | :------------------ | :------------------------------------------------------------------------ |
| **Turborepo Monorepo Architecture** | ✅ Operational | Clean monorepo structure |
| **Next.js 16 Web App (Vercel)** | ✅ Operational | `/api/signals` force-dynamic; needs `SUPABASE_SERVICE_ROLE_KEY` on Vercel |
| **PostgreSQL Schema (Supabase)** | ✅ Operational | 9 migrations applied (including 009 event_date index) |
| **Railway Workers (Cron)** | ✅ Operational | `sleepApplication: false`, heartbeat every 5m, collectors every 15m |
| **Railway Backend (HTTP API)** | ✅ Operational | `api.bluebeaconresearch.com` healthcheck passing |
| **RSS Real-Time Collector** | ⚠️ Partial | BBC, Al Jazeera, Guardian, NPR, UN News work; Reuters feed returns 404 |
| **GNews Ingestion** | ⚠️ Degraded | Free tier — 1 query/run; mostly duplicates after initial ingest |
| **GDELT Ingestion** | ⚠️ Degraded | HTTP 429 rate limits; 30s retry added |
| **Price Syncer (Yahoo Finance)** | ✅ Operational | 8 commodity prices every 15 min |
| **Claude AI Classifier** | ⚠️ Degraded | Zero Anthropic credit — heuristic fallback active |
| **Heuristic Fallback Classifier** | ✅ Operational | Dynamic confidence scoring (55%–90%) + word-boundary filtering |
| **Upstash Redis / BullMQ** | ✅ Operational | Fixed `rediss://` TLS protocol |
| **Interactive UI Controls** | ✅ 100% Operational | All buttons, filters, modals, FABs, and CSV downloads active |

---

## 2. Data Pipeline State (as of 2026-08-12)

- **`raw_events`**: Ingestion active on deploy startup + 15-min cron. Typical run: `inserted: 0–2`, `duplicates: 15–40`, `filtered: 40–80`.
- **`signals`**: 20+ signals in 24h `event_date` window, plus active ongoing events older than 24h are preserved in the default feed.
  -- **`Global Map`**: `/map` now plots geolocated events from real `lat`/`lng` values in `/api/signals` using **MapLibre GL** with OpenStreetMap tiles (no Mapbox token required). The frontend will display a small degraded-mode banner and continue to show the last available data when the server returns a cached fallback due to upstream rate-limiting or DB errors.
- **`commodity_prices`**: Updated every 15 min (8 commodities via Yahoo Finance).

**Latest verified ingest** (2026-08-11T18:37 UTC deploy): `startup:rss → inserted: 1, signals: 1`.

---

## 3. How the Data Pipeline Works

```
Railway workers (startup + every 15m)
  RSS (BBC, Al Jazeera, Guardian, NPR, UN News) + GNews + GDELT
        ↓
isRelevantEvent() word-boundary filter — ~70% of articles filtered out
        ↓
Deduplicate by external_id — most remaining articles already in DB
        ↓
Insert into raw_events + signals (event_date = article PUBLISH time)
        ↓
Next.js /api/signals (default feed: 24h fresh + active ongoing events; explicit `window=latest|24h|7d|active` filters available)
        ↓
Dashboard shows eventDate → "X hours ago" = when article was PUBLISHED
```

---

## 4. Why Dashboard Timestamps Look "Old" (Not a Bug)

| Field        | Meaning                                   | Shown in UI?                     |
| :----------- | :---------------------------------------- | :------------------------------- |
| `created_at` | When **we ingested** the signal           | ❌ No (except NotificationPanel) |
| `event_date` | When the **source article was published** | ✅ Yes — `"12 hours ago"`        |

A signal ingested **5 minutes ago** from a BBC article published **12 hours ago** will display **"12 hours ago"**. Refreshing the page does not change this — it is intentional (v0.10.0 decision).

Featured cards on `/alerts` pick the first signal with **`severity >= 8`**. New ingested signals with lower severity (e.g. 5) exist in the DB but may not become the hero card.

---

## 5. Known Issues & Action Items

| Issue                                  | Severity  | Status                                                           |
| :------------------------------------- | :-------- | :--------------------------------------------------------------- |
| Railway Serverless sleep killing cron  | Fixed     | `sleepApplication: false` in `railway.workers.json`              |
| Wrong start command on workers service | Fixed     | `railway.workers.json` → `pnpm run start:workers`                |
| UI timestamps look stale vs ingestion  | Explained | By design — shows `event_date`, not `created_at`                 |
| Reuters RSS feed 404 on Railway        | Open      | `reutersagency.com` feed URL returns 404; other feeds compensate |
| GDELT HTTP 429 rate limiting           | Open      | 30s retry added; may still fail during peak                      |
| GNews free tier quota                  | Open      | 1 query/run; mostly returns duplicates after initial ingest      |
| Anthropic API credit exhausted         | High      | Heuristic fallback active                                        |
| ACLED collector requires credentials   | Open      | Set `ACLED_EMAIL` + `ACLED_PASSWORD` in Railway                  |
| `SUPABASE_SERVICE_ROLE_KEY` on Vercel  | Open      | Required for reliable `/api/signals` server reads                |
| Telegram alerts not working            | Open      | `TELEGRAM_BOT_TOKEN` not set in Railway                          |

---

## 6. How to Verify Workers Are Healthy

Railway → **workers** → Logs. Expect:

```
Running initial ingestion immediately on startup...
startup:rss → { inserted: N, signals: N, ... }
workers: cron schedulers active, health server listening
workers:heartbeat → every 5 min
rss-collector / price-sync → every 15 min
```

Supabase SQL:

```sql
SELECT title, created_at, event_date,
       NOW() - created_at AS ingested_ago,
       NOW() - event_date AS published_ago
FROM signals ORDER BY created_at DESC LIMIT 5;
```

If `created_at` advances but UI still shows old times → check `event_date` (publish time), not ingestion.

---

## 7. Environment Variables Required

### Supabase (Vercel + Railway + `.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=https://evavcgfmemwryggdkjmx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>   ← REQUIRED on Vercel for /api/signals
```

### Redis (Railway workers + backend)

```
REDIS_URL=rediss://default:<token>@<host>:6379   ← MUST be rediss:// (TLS)
```

### Data Sources (Railway workers)

```
GNEWS_API_KEY=<gnews token>
ANTHROPIC_API_KEY=<optional — heuristic fallback works without credits>
ACLED_EMAIL=<optional>
ACLED_PASSWORD=<optional>
```
