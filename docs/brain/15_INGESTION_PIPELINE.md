# 15_INGESTION_PIPELINE.md — News Ingestion Logic, Filters & Display Rules

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

This document describes **exactly** how Blue Beacon Research fetches news, filters it, stores it, and displays it on the dashboard. Read this before changing collectors or wondering why certain headlines appear (or don't).

---

## 1. Pipeline Overview

```
Railway workers (startup + every 15 min)
  ├── RSS Collector      (14 feeds — world + finance)
  ├── GNews Collector    (1 API query, free tier)
  ├── GDELT Collector    (1 API query, global news index)
  ├── Price Syncer       (Yahoo Finance — 8 commodities)
  └── ACLED Collector    (optional — requires credentials)
        ↓
  relevance-filter.ts    (exclude spam → match keywords OR finance-tier pass-through)
        ↓
  raw_events table       (dedupe by external_id)
        ↓
  Claude/heuristic classify → signals table (event_date = article publish time)
        ↓
  Redis pipeline:last_run (last fetch timestamp + run stats)
        ↓
  /api/signals + /api/ingestion/status → Dashboard UI
```

**Schedule:** `node-cron` every 15 minutes + immediate run on deploy.  
**Last-fetched banner:** reads `pipeline:last_run` from Upstash Redis (fallback: newest `raw_events.created_at`).

---

## 2. Data Sources

### 2.1 RSS Collector (`rss-collector.ts`)

**Auth:** None (public RSS/Atom feeds)  
**Run interval:** Every 15 min + startup  
**Article age window:** **4 hours** (articles older than 4h are skipped)  
**Dedup key:** `rss-{base64(url)[0:32]}` in `raw_events.external_id`

| Feed                            | Tier      | Filter strictness                        |
| :------------------------------ | :-------- | :--------------------------------------- |
| BBC World                       | `world`   | Exclude spam + keyword match             |
| Al Jazeera                      | `world`   | Exclude spam + keyword match             |
| NPR World                       | `world`   | Exclude spam + keyword match             |
| France24                        | `world`   | Exclude spam + keyword match             |
| DW World                        | `world`   | Exclude spam + keyword match             |
| Guardian World                  | `world`   | Exclude spam + keyword match             |
| UN News                         | `world`   | Exclude spam + keyword match             |
| **BBC Business**                | `finance` | **Only hard-exclude** (sports/celebrity) |
| **Guardian Business**           | `finance` | **Only hard-exclude**                    |
| **NYT Business**                | `finance` | **Only hard-exclude**                    |
| **MarketWatch**                 | `finance` | **Only hard-exclude**                    |
| **WSJ Markets** (Dow Jones RSS) | `finance` | **Only hard-exclude**                    |
| **Investing.com**               | `finance` | **Only hard-exclude**                    |
| **OilPrice.com**                | `finance` | **Only hard-exclude**                    |

> **Reuters note:** Official Reuters RSS (`feeds.reuters.com`, `reuters.com/world/rss`) returns 401/404 from server environments. Replaced with **MarketWatch + WSJ Markets + NYT Business** as finance-grade alternatives.

**Typical run stats:** `fetched: 80–150`, `filtered: 20–60`, `duplicates: 20–40`, `inserted: 0–5`

---

### 2.2 GNews Collector (`gnews-collector.ts`)

**Auth:** `GNEWS_API_KEY`  
**API:** `https://gnews.io/api/v4/search`  
**Free tier limit:** ~100 requests/day → **1 query per run** (~96/day at 15-min intervals)  
**Max articles per run:** 10  
**Sort:** `publishedAt` (newest first)  
**Dedup key:** `gnews-{base64(url)[0:32]}`  
**DB source value:** `newsapi` (check constraint — not `gnews`)

**Current query:**

```
conflict OR war OR sanctions OR oil OR stock market OR trade OR inflation OR fed OR earnings OR futures
```

**Filter:** Same as RSS `world` tier — `isRelevantEvent(title, summary)`.

**Known limitation:** GNews free tier caches results; many runs return duplicates already in DB.

---

### 2.3 GDELT Collector (`gdelt-collector.ts`)

**Auth:** None  
**API:** `https://api.gdeltproject.org/api/v2/doc/doc`  
**Max records:** 50 per run  
**Sort:** `DateDesc`  
**Dedup key:** `gdelt-{base64(url)[0:32]}`  
**DB source value:** `gdelt`

**Current query (URL-encoded):**

```
(conflict OR war OR sanctions OR military OR oil OR stock market OR trade OR inflation OR fed OR earnings)
```

**Rate limits:** HTTP 429 common → **30-second retry** once per run.  
**Filter:** `isRelevantEvent(title)` — title only (GDELT often has no summary).

---

### 2.4 ACLED Collector (`acled-collector.ts`) — Optional

**Auth:** `ACLED_EMAIL` + `ACLED_PASSWORD` (not configured in production)  
**Status:** Skipped silently if credentials missing.

---

### 2.5 Price Syncer (`price-syncer.ts`)

**Source:** Yahoo Finance (`yahoo-finance2`)  
**Symbols:** WTI, Brent, Gold, NatGas, Wheat, Copper, Silver, Corn  
**Interval:** Every 15 min (bundled in ingestion cycle)  
**Storage:** `commodity_prices` table + Redis `prices:{SYMBOL}` (900s TTL)

---

## 3. Relevance Filter (`lib/relevance-filter.ts`)

All news collectors share one filter module.

### Step 1 — Hard exclude (`shouldExclude`)

Drop if title+summary contains:

- **Sports:** football, soccer, nfl, nba, cricket, tennis, golf, olympics…
- **Entertainment:** celebrity, music, movie, award, oscar…
- **Lifestyle:** fashion, recipe, cooking, horoscope
- **False-positive phrases:** star wars, war movie, tug-of-war, oil painting
- **Historical years:** 1970–2005 in headline (archive retrospectives)

### Step 2 — Tier-based include

| Tier                            | Rule                                                |
| :------------------------------ | :-------------------------------------------------- |
| **`finance`** RSS feeds         | Pass if NOT excluded (no keyword required)          |
| **`world`** RSS + GNews + GDELT | Pass if NOT excluded AND matches keyword list below |

### Step 3 — Keyword match (`matchesKeywords`)

**Word-boundary tokens:** war, oil, gas, fed, sec, ipo, etf, gdp, cpi, gold, opec, bank, deal…

**Geopolitical phrases:** conflict, missile, sanction, invasion, military, iran, russia, ukraine, taiwan, nato, nuclear, pipeline, hormuz, tanker, red sea…

**Market/finance phrases (v0.14 expanded):** stock, market, trading, nasdaq, dow, s&p, futures, earnings, inflation, recession, interest rate, federal reserve, bond, yield, treasury, forex, dollar, bitcoin, crypto, merger, acquisition, bankruptcy, investor, dividend, ipo, volatility, selloff, rally, semiconductor, banking, mortgage, economy, financial, business, corporate…

Full lists: `apps/backend/src/lib/relevance-filter.ts`

---

## 4. Classification & Signal Creation

After passing the filter and dedup check:

1. Insert row into `raw_events`
2. Call `ClaudeService.classifyEvent()`:
   - If Anthropic API has credit → Claude 3.5 Haiku JSON classification
   > ⚠️ UPDATED 2026-08-19 — Anthropic API credit is currently exhausted, so this branch is not the one running in production right now; every classification is currently going through the heuristic fallback below.
   - If API fails → **heuristic fallback** (local, zero cost) with conservative commodity impact assignment
     - never invent commodity exposure without evidence
     - return an empty `commodityImpacts` array when no defensible commodity signal exists
     - preserve separate event severity, source confidence, and asset-level market-impact confidence
3. Insert into `signals` with:
   - `severity` 1–10
   - `confidence` 0.55–0.90 (dynamic)
   - `commodity_impacts` JSON (USOIL, XAUUSD, etc.)
   - **`event_date`** = article publish time (from RSS `pubDate`, GNews `publishedAt`, GDELT `seendate`)

> ⚠️ UPDATED 2026-08-19 — Step 3 is no longer an unconditional insert in the 3 live collectors (`rss-collector.ts`, `gnews-collector.ts`, `gdelt-collector.ts`). After classification returns, `insertOrMergeSignal()` (`apps/backend/src/workers/signal-merge.ts`) checks recent same-region signals for a plausible cross-source match on the classified summary. No match → inserts exactly as described above. A match with lower/equal severity → merges into the existing signal instead (`raw_event_ids` grows, `sources_count` increments, no new row, Sonnet briefing reused not regenerated). A match with higher severity → treated as an escalation: updates the existing signal's `severity` and regenerates its briefing rather than creating a second row. **Classification itself is never skipped** — this only changes what happens to an already-classified result. Full design and thresholds: `10_DECISIONS.md` ADR 010; `14_CHANGELOG.md` v0.27.0. Not wired into `reconciliation.ts`'s orphan-recovery insert path — that one is unchanged.

- `created_at` = first ingestion time into BBR
- `updated_at` = last signal update time in the DB
- dashboard default: signals with `event_date >= 24h` OR `is_active = true`
- explicit window filters: `latest`, `24h`, `7d`, `active`

### 5.1 API: `/api/signals`

| Rule         | Value                                                               |
| :----------- | :------------------------------------------------------------------ |
| Auth         | Requires logged-in user                                             |
| DB read      | Service role key (if set on Vercel)                                 |
| Time window  | `event_date >= 24 hours ago` OR `is_active = true` (default/latest) |
| Sort default | `event_date DESC`, then `severity DESC`                             |
| Cache        | `force-dynamic` — no Next.js cache                                  |

### 5.2 Timestamp display

| Field        | Meaning                                   | Shown in UI?                 |
| :----------- | :---------------------------------------- | :--------------------------- |
| `event_date` | When the **source article was published** | ✅ `"12 hours ago"` on cards |
| `created_at` | When **we ingested** the signal           | ❌ (except ingestion banner) |

**This is intentional.** A story published 4 hours ago displays "4 hours ago" even if we fetched it 2 minutes ago.

### 5.3 Ingestion status banner (`IngestionStatusBanner`)

| Field         | Source                                                                    |
| :------------ | :------------------------------------------------------------------------ |
| Last fetched  | `pipeline:last_run.lastFetchedAt` (Redis) or `max(raw_events.created_at)` |
| Next run ~    | lastFetched + 15 min                                                      |
| +N signals    | Last run `totals.signals`                                                 |
| Stale warning | Red if last fetch > 20 min ago                                            |

### 5.4 Featured card selection (`/alerts`, `/dashboard`)

```typescript
featuredSignal = signals.find((s) => s.severity >= 8) || signals[0];
```

High-severity (8+) stories dominate the hero card. New low-severity market news may appear in the stream but not as the featured headline.

---

## 6. Why You Might See "No Updates" in 4 Hours

| Cause                     | Explanation                                               |
| :------------------------ | :-------------------------------------------------------- |
| **Duplicates**            | Feeds repeat same URLs → `inserted: 0` (correct behavior) |
| **Filter**                | Headline doesn't match keyword lists (world tier)         |
| **4h RSS window**         | Article published >4h ago skipped at fetch time           |
| **UI shows publish time** | Ingested 2 min ago but article says "4h ago"              |
| **GDELT 429**             | Rate limited — no new articles that run                   |
| **GNews quota**           | Free tier exhausted for the day                           |
| **Hero card logic**       | New severity-5 story hidden behind severity-9 hero        |

---

## 7. Environment Variables

| Variable                       | Required on                  | Purpose                          |
| :----------------------------- | :--------------------------- | :------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY`    | Railway workers + **Vercel** | Write/read signals               |
| `GNEWS_API_KEY`                | Railway workers              | GNews collector                  |
| `REDIS_URL`                    | Railway workers              | BullMQ + pipeline status         |
| `UPSTASH_REDIS_REST_URL/TOKEN` | Vercel + Railway             | Banner reads `pipeline:last_run` |

---

## 8. Verification Commands

**Railway logs (healthy):**

```
startup:ingestion complete → collectors.rss.inserted: N
ingestion-cycle complete   → every 15 min
workers:heartbeat          → every 5 min
```

**Supabase SQL:**

```sql
SELECT title, created_at, event_date,
       NOW() - created_at AS ingested_ago,
       NOW() - event_date AS published_ago
FROM signals ORDER BY created_at DESC LIMIT 10;
```

**API:**

```bash
curl https://bluebeaconresearch.com/api/ingestion/status
```

---

## 9. Future API Candidates (not yet integrated)

| API                      | Why                      | Blocker                           |
| :----------------------- | :----------------------- | :-------------------------------- |
| **NewsAPI.org**          | Broad business headlines | Requires paid plan for production |
| **Finnhub**              | Market news + earnings   | API key + rate limits             |
| **Alpha Vantage News**   | Ticker-specific          | 25 req/day free tier              |
| **Reuters official API** | Premium finance feed     | Paid enterprise access            |
| **Polygon.io**           | Real-time market news    | Paid                              |

Current strategy: maximize free RSS (14 feeds) + GNews + GDELT before adding paid APIs.
