# 15_INGESTION_PIPELINE.md — News Ingestion Logic, Filters & Display Rules

> **📍 Doc status — current as of 2026-10-09 for the RSS official-tier age window/keyword bypass, hard/ambiguous exclude split, log-only year rule, and decoupled price-sync cron (`96ff0e7`); 2026-10-07 for the GDELT record cap, retry, and DOC-list freeze; 2026-09-28 for the RSS feed roster; 2026-09-20 for the materiality-gate path.**
>
> ⚠️ UPDATED 2026-10-07 — also on the ingestion path: a cleaned excerpt goes to the classifier when the feed stored one (`cf0711f`; a missing summary, including every GDELT item, leaves the prompt unchanged); one email when the daily ingestion classification budget closes (`41c19ce`); ACLED and the dormant classifier do not store a deferred result (`5707819`); read-only view `feed_yield_daily` (`b4b52f1`, migration written, not applied). This is the authoritative ingestion writeup. `claude/23_TODO.md` is not in this repo.

This document describes **exactly** how Blue Beacon Research fetches news, filters it, stores it, and displays it on the dashboard. Read this before changing collectors or wondering why certain headlines appear (or don't).

---

## 1. Pipeline Overview

```
Railway workers (startup + every 30 min)
  ├── RSS Collector      (28 feeds — world + finance)
  ├── GNews Collector    (1 API query, free tier)
  ├── GDELT Collector    (1 API query, global news index)
  ├── Price Syncer       (Yahoo Finance — 8 commodities + 6 forex pairs)
  └── ACLED Collector    (optional — requires credentials)
        ↓
  relevance-filter.ts    (exclude spam → drop routine insider/analyst noise → match keywords OR finance-tier pass-through)
        ↓
  raw_events table       (dedupe by external_id)
        ↓
  Claude/heuristic classify → materiality gate (#141) → signals table
        (materiality_pass=false skips the insert; raw_events kept.
         Watchlist hit is live `media_impact_watchlist`, #142.)
        ↓
  Redis pipeline:last_run (last fetch timestamp + run stats)
        ↓
  /api/signals + /api/ingestion/status → Dashboard UI
```

**Schedule:** `node-cron`, interval set by `INGESTION_INTERVAL_CRON` (Railway env, default `*/15 * * * *`; production is currently `*/30 * * * *`) + immediate run on deploy. `buildPipelineStatus()` (`apps/backend/src/lib/pipeline-status.ts`) parses this at write time and stamps the real interval onto `pipeline:last_run.intervalMinutes`, so `/api/ingestion/status` and the banner never hardcode a cadence that can drift out of sync again (fixed 2026-09-26 — see `LIVE_TODO.md`).  
**Last-fetched banner:** reads `pipeline:last_run` from Upstash Redis (fallback: newest `raw_events.created_at`).

#121/#144's `outcome-tracker.ts` is **not** on this loop. It is a separate daily cron (`0 5 * * *`) that writes `signal_outcomes` at 1h/4h/24h/48h from already-stored signals + `commodity_prices`. `GET /v1/accuracy` still aggregates 48h only. Methodology: `docs/claude_project/17_SIGNAL_ENGINE.md` §7. Do not fold it into collectors.

---

## 2. Data Sources

### 2.1 RSS Collector (`rss-collector.ts`)

**Auth:** None (public RSS/Atom feeds)  
**Run interval:** Every 30 min + startup (see §1 — `INGESTION_INTERVAL_CRON`)  
**Article age window:** **4 hours** for `world`/`finance` tiers; **24 hours** for the `official` tier (central-bank/agency feeds), and the `official` tier also skips the Step 3 keyword gate entirely — any non-excluded headline from those feeds passes (`96ff0e7`, 2026-10-09).  
**Dedup key:** `rss-{base64(url)[0:32]}` in `raw_events.external_id`

| Feed                            | Tier      | Filter strictness                        |
| :------------------------------ | :-------- | :--------------------------------------- |
| BBC World                       | `world`   | Exclude spam + keyword match             |
| Al Jazeera                      | `world`   | Exclude spam + keyword match             |
| NPR World                       | `world`   | Exclude spam + keyword match             |
| France24                        | `world`   | Exclude spam + keyword match             |
| DW World                        | `world`   | Exclude spam + keyword match             |
| Guardian World                  | `world`   | Exclude spam + keyword match             |
| **EIA Press Releases**          | `official`| **Only hard-exclude, 24h window, no keyword gate** |
| **Federal Reserve**             | `official`| **Only hard-exclude, 24h window, no keyword gate** |
| **ECB**                         | `official`| **Only hard-exclude, 24h window, no keyword gate** |
| **Bank of England**             | `official`| **Only hard-exclude, 24h window, no keyword gate** |
| **USTR**                        | `official`| **Only hard-exclude, 24h window, no keyword gate** |
| **Reserve Bank of India**       | `official`| **Only hard-exclude, 24h window, no keyword gate** |
| **Bank of Japan**               | `official`| **Only hard-exclude, 24h window, no keyword gate** |
| **EIA Today in Energy**         | `official`| **Only hard-exclude, 24h window, no keyword gate** |
| **BBC Business**                | `finance` | **Only hard-exclude** (sports/celebrity) |
| **Guardian Business**           | `finance` | **Only hard-exclude**                    |
| **NYT Business**                | `finance` | **Only hard-exclude**                    |
| **MarketWatch**                 | `finance` | **Only hard-exclude**                    |
| **WSJ Markets** (Dow Jones RSS) | `finance` | **Only hard-exclude**                    |
| **Investing.com**               | `finance` | **Only hard-exclude**                    |
| **OilPrice.com**                | `finance` | **Only hard-exclude**                    |
| **Rigzone**                     | `finance` | **Only hard-exclude**                    |
| **Mining.com**                  | `finance` | **Only hard-exclude**                    |
| **gCaptain**                    | `finance` | **Only hard-exclude**                    |
| **Splash247**                   | `finance` | **Only hard-exclude**                    |
| **Hellenic Shipping News**      | `finance` | **Only hard-exclude**                    |
| **FreightWaves**                | `finance` | **Only hard-exclude**                    |
| **Journal of Commerce**         | `finance` | **Only hard-exclude** (308→200 redirect to `/rssfeed`, parser follows it) |

> **Reuters note:** Official Reuters RSS (`feeds.reuters.com`, `reuters.com/world/rss`) returns 401/404 from server environments. Replaced with **MarketWatch + WSJ Markets + NYT Business** as finance-grade alternatives.

> **UN News / USDA note (2026-09-26, re-confirmed 2026-09-28):** Both evaluated as candidate `world`-tier additions, neither added — confirmed dead by a real fetch against production's exact parser config, not assumed. **UN News** (`news.un.org/feed/subscribe/en/news/all/rss.xml`) unconditionally gzips its response (`content-encoding: gzip`, confirmed via raw magic bytes) even without client compression negotiation; `rss-parser`'s HTTP client doesn't decode it, so `parseURL()` throws `"Non-whitespace before first tag"` on every run — the same failure that got it removed 2026-08-28 (#63); needs a manual fetch + gunzip decode path to ever re-add. **USDA Latest News** (`usda.gov/rss/latest-releases.xml`) returns a hard `403` from Akamai (`server: AkamaiGHost`) regardless of User-Agent/Accept headers — bot-fingerprinting, not a header problem, so it won't be fixed by header changes alone. Re-confirmed 2026-09-28 via direct curl when a task instruction claimed (incorrectly) that this URL was "live-verified" that day — it was not added despite being requested. **EIA Press Releases** (`eia.gov/rss/press_rss.xml`) was added successfully 2026-09-26 — real `200`, 11 items fetched in the verification run. **Federal Reserve / ECB / Bank of England / USTR** (world) and **Rigzone / Mining.com / gCaptain / Splash247 / Hellenic Shipping News / FreightWaves / Journal of Commerce** (finance) were added 2026-09-28, each curl-verified as real RSS 2.0 XML before being added.

**Typical run stats:** `fetched: 80–150`, `filtered: 20–60`, `duplicates: 20–40`, `inserted: 0–5`

---

### 2.2 GNews Collector (`gnews-collector.ts`)

**Auth:** `GNEWS_API_KEY`  
**API:** `https://gnews.io/api/v4/search`  
**Free tier limit:** ~100 requests/day → **1 query per run** (~48/day at the current 30-min cadence)  
**Max articles per run:** 10  
**Sort:** `publishedAt` (newest first)  
**Dedup key:** `gnews-{base64(url)[0:32]}`  
**DB source value:** `newsapi` (check constraint — not `gnews`)

**Current query:**

```
conflict OR war OR sanctions OR oil OR stock market OR trade OR inflation OR fed OR earnings OR futures
```

**Filter:** Same as RSS `world` tier — `isRelevantEvent(title, summary)`.
**Article age window:** no explicit code-level age filter — the API call has no `from`/`to` date param; freshness comes only from `sortby=publishedAt` returning the newest matches first.

**Known limitation:** GNews free tier caches results; many runs return duplicates already in DB.

---

### 2.3 GDELT Collector (`gdelt-collector.ts`)

**Auth:** None  
**API:** `https://api.gdeltproject.org/api/v2/doc/doc`  
**Max records:** 250 per run (`maxrecords=250` since 2026-09-26, `3d5e244`)  
**Sort:** `DateDesc`  
**Dedup key:** `gdelt-{base64(url)[0:32]}`  
**DB source value:** `gdelt`

**Current query (URL-encoded):**

```
(conflict OR war OR sanctions OR military OR oil OR stock market OR trade OR inflation OR fed OR earnings)
```

**Rate limits:** On HTTP 429, one retry then stop (`e677efc`, 2026-09-06). Delay is 5 seconds times 2 to the attempt, plus up to 10 seconds of jitter (`gdelt-collector.ts` on `7438ec9`, 2026-10-06). A non-429 error is not retried.
**DOC artlist:** frozen from 2026-10-05 12:00 to 2026-10-06 07:00 UTC, recovered at 10:00 UTC. `48f77ce` (2026-10-06) recorded one HTTP 200 whose newest `seendate` was still 2026-10-02T10:45:00Z.  
**Filter:** `isRelevantEvent(title)` — title only (GDELT often has no summary).
**Article age window:** no explicit code-level age filter — the DOC API query has no date param either; `maxrecords=250` sorted `DateDesc` is the only recency control.
**Fields (DOC 2.0 artlist response):** `url, title, seendate, socialimage, domain, language, sourcecountry` — no `ActionGeo_*`/Goldstein/CAMEO fields exist in this response; those belong to GDELT's separate Event Export CSV product, which this collector doesn't call (confirmed #188, 2026-09-24; `docs/claude_project/16_DATA_PIPELINE.md` §2.1 previously claimed otherwise).
**Country caveat (#188):** `sourcecountry` is the publishing outlet's country, not the event's location — `raw_events.country` keeps it as the raw value, but the classifier's own `country` field (see `18_AI_ENGINE.md`) is what's now used for the signal's displayed country and map coordinates.

---

### 2.4 ACLED Collector (`acled-collector.ts`) — Optional

**Auth:** `ACLED_EMAIL` + `ACLED_PASSWORD` (set on Railway `workers` since 2026-09-28) — `POST https://acleddata.com/oauth/token` (`application/x-www-form-urlencoded`: `username`/`password`/`grant_type=password`/`client_id=acled`/`scope=authenticated`), returns `{access_token, expires_in: 86400, refresh_token, token_type}`, used as `Authorization: Bearer <access_token>`.
**Read:** `GET https://acleddata.com/api/acled/read` (`_format=json`, `event_date`/`event_date_where=>` for a 7-day lookback — no documented pagination), response `{status, success, count, data[], last_update, messages}`; dedup key is `event_id_cnty`.
**Status (corrected 2026-10-01):** credentials-missing is still skipped silently (an intentional not-configured state), but a login/read *failure* is no longer silent — `acled.service.ts` throws and `acled-collector.ts` records `service_health_events` `status=error`. Previously (through 2026-09-30) the service posted to a non-resolving `api.acleddata.com` host, caught the DNS failure, and returned `null`/`[]`, which the collector logged as a false `"ok — fetched 0 event(s)"` — `raw_events` has zero `source='acled'` rows to date. See `LIVE_TODO.md` (2026-10-01 "ACLED collector — real root-cause fix") for the fix and what's still unverified (no credentials in the dev/fix environment).

---

### 2.5 Price Syncer (`price-syncer.ts`)

**Source:** Yahoo Finance (`yahoo-finance2`)  
**Symbols:** 8 commodities (WTI, Brent, Gold, NatGas, Wheat, Copper, Silver, Corn) + **6 forex pairs** (EURUSD, GBPUSD, USDJPY, USDCHF, USDRUB, USDCNY — Yahoo `<PAIR>=X` tickers) — the forex set added by #87 phase 1 (`a15e2fd`, 2026-09-09), synced in the same loop.  
**Interval:** Own schedule, `PRICE_SYNC_CRON` (default `*/15 * * * *`, every 15 min) — decoupled from the news ingestion cron since `96ff0e7` (2026-10-09); previously bundled into the 30-min ingestion cycle.  
**Storage:** `commodity_prices` table (a generic symbol/price time-series despite the name) + Redis `prices:{SYMBOL}` (900s TTL)

---

### 2.6 Digest Sender (`digest-sender.ts`) — #83, added 2026-09-07

**Not part of the ingestion cycle.** Its own `node-cron` schedule in `workers.ts` — `DIGEST_CRON`, default `0 6 * * *` (06:00 UTC), once daily.
**Auth:** `RESEND_API_KEY` (same Resend account as Auth SMTP; **not yet set in production** — worker logs and no-ops without it).
**Logic:** `runDigestOnce()` → every `user_preferences` row with `onboarding_completed_at` set and `digest_enabled = true` → per user, the top 5 `is_active` signals from the last 24h whose `region`/`commodity_impacts` overlap that user's saved `regions`/`commodities` (same `.or()` matching as `/api/signals?personalized=true`), ranked by severity. No global fallback — a user with no saved preferences gets nothing. Email body: Event → Why it matters → Which instruments → Alert threshold + "Built from" source links + not-financial-advice line, via `EmailService` (`resend` npm package).

---

## 3. Relevance Filter (`lib/relevance-filter.ts`)

All news collectors share one filter module.

> ⚠️ UPDATED 2026-08-25 — this whole section describes the pre-`b0783ab` filter. Two real
> bugs were found and fixed that day (P0 QA finding: 95%-confidence irrelevant content in
> the Intelligence Feed): `shouldExclude` used plain substring matching, so the `nfl`
> hard-exclude was silently matching inside "inflation"/"conflict"/"influence" — dropping
> some of the most important words for this product with zero trace, since filtered items
> were never logged. And several `matchesKeywords` entries were too generic/substring-prone
> (`dow` matched any word containing "down"; `russell` matched the name "Russell T Davies";
> `business`/`economic`/`economy`/`financial`/`finance`/`corporate` matched routine local
> news). See `08_CURRENT_STATUS.md`'s 2026-08-25 entry and `14_CHANGELOG.md` v0.28.3 for the
> full before/after evidence. The step-by-step mechanics below (hard-exclude → tier-based
> include → keyword match) are still accurate; only the specific keyword examples are stale.

### Step 1 — Hard exclude (`shouldExclude`)

Drop if title+summary contains (word-boundary match as of `b0783ab`, not substring). Since `96ff0e7` (2026-10-09), the exclude list is split into two tiers:

- **`EXCLUDE_KEYWORDS_HARD`** (sports, entertainment, lifestyle, false-positive phrases — football, soccer, nfl, nba, cricket, tennis, golf, olympics, celebrity, music, movie, award, oscar, fashion, recipe, cooking, horoscope, star wars, war movie, tug-of-war, oil painting, farmers market, dollar tree, military fitness, net worth…) — always drops, no exception.
- **`EXCLUDE_KEYWORDS_AMBIGUOUS`** (`trade deadline`, `fashion`, `war game`/`wargame`) — drops **only when the combined title+summary has no "anchor"** (`hasAnchor()`: an existing geopolitical word or a tracked commodity name). With an anchor present, the headline is kept.
- **Historical years:** 1970–2005 in headline is now **log-only** (`[RELEVANCE] exclude-year would-drop`) — it no longer actually drops the article, and no longer misfires on dollar amounts like "$2000".

### Step 1b — Routine market noise (`isRoutineMarketNoise`), 2026-10-07

After the hard exclude and before the finance-tier pass-through, drop a title that matches an insider-trade pattern or an analyst-rating pattern. On a 1,111-article sample that day, 103 headlines matched and none became a signal. The patterns were built on that same sample, so each drop logs one `[RELEVANCE] routine-noise drop` line. Finance-tier feeds do not skip this check.

### Step 2 — Tier-based include

| Tier                            | Rule                                                |
| :------------------------------ | :-------------------------------------------------- |
| **`official`** RSS feeds (central banks/agencies) | Pass if NOT excluded (no routine-noise or keyword check) — `96ff0e7`, 2026-10-09 |
| **`finance`** RSS feeds         | Pass if NOT excluded and NOT routine market noise (no keyword required) |
| **`world`** RSS + GNews + GDELT | Pass if NOT excluded, NOT routine market noise, AND matches keyword list below |

### Step 3 — Keyword match (`matchesKeywords`)

**Word-boundary tokens:** war, oil, gas, fed, sec, ipo, etf, gdp, cpi, gold, corn, opec, bomb, coup, riot…

**Geopolitical phrases:** conflict, missile, sanction, invasion, military, iran, russia, ukraine, taiwan, nato, nuclear, pipeline, hormuz, tanker, red sea, trade deal, peace deal, nuclear deal, arms deal…

**Market/finance phrases:** stock, market, trading, nasdaq, dow jones, s&p, futures, stock options, earnings, inflation, recession, interest rate, federal reserve, world bank, bond, yield, treasury, forex, dollar, bitcoin, crypto, merger, acquisition, bankruptcy, investor, dividend, ipo, volatility, selloff, semiconductor, banking, mortgage…

Full lists: `apps/backend/src/lib/relevance-filter.ts`

---

## 4. Classification & Signal Creation

After passing the filter and dedup check:

1. Insert row into `raw_events`
2. Call `ClaudeService.classifyEvent()`:
   - If Anthropic API has credit → Claude 3.5 Haiku JSON classification
   > ⚠️ UPDATED 2026-10-06 (`0c9b4b6`, `7438ec9`) — a temporary Anthropic error defers classification instead of a keyword guess. The keyword fallback applies only when no research-model client is configured. A closed daily budget pauses collection (`c468485`).
   > ⚠️ UPDATED 2026-08-19 — Anthropic API credit is currently exhausted, so this branch is not the one running in production right now; every classification is currently going through the heuristic fallback below.
   - If API fails → **heuristic fallback** (local, zero cost) with conservative commodity impact assignment
     - never invent commodity exposure without evidence
     - return an empty `commodityImpacts` array when no defensible commodity signal exists
     - preserve separate event severity, source confidence, and asset-level market-impact confidence
   > ⚠️ UPDATED 2026-09-13 (#141 / #142) — `classifyEvent()` also returns the materiality-gate fields and `mediaImpactEntity` (live `media_impact_watchlist`, 10-min cache — not the #141 hardcoded array). After classify, **before** any `signals` insert, all 5 live call sites (`gnews`/`gdelt`/`rss`/`acled`/`reconciliation`) check `materialityPass`. `false` → log `"rejected"` to `service_health_events` (`service: "materiality_gate"`) and skip the insert. `raw_events` stays. Heuristic path only passes with a validated commodity/currency impact or a watchlist hit.
   > ⚠️ UPDATED 2026-10-01 (claude/277 A6, founder conditions 2026-09-30) — the 3 live-source collectors (`gnews`/`gdelt`/`rss`) now compute a placement proxy before calling `classifyEvent()`: `detectHeadlinePlacement()` (`lib/headline-placement.ts`) checks whether the same trigger keywords `relevance-filter.ts` uses for the relevance gate appear in the article's headline, or only in its body. GNews uses its (truncated) `content` field, RSS uses the already-parsed `contentSnippet`/`content`/`summary` chain, GDELT has no body text at all (so its placement can only ever come back `"headline"` or `"none"`). The result is passed into `classifyEvent(rawEvent, { headlinePlacement })` and adds a small, bonus-only severity bump (`HEADLINE_PLACEMENT_SEVERITY_BONUS`, `claude.service.ts`) when placement is `"headline"` — body-only/no-match never changes severity, by founder design (a penalty risks pushing a real update below the severity≥4 feed floor). Full rationale, the doc-vs-code discrepancy this was checked against, and the bonus's unvalidated status: `docs/claude_project/17_SIGNAL_ENGINE.md` §2.2 Factor 6.
   > ⚠️ UPDATED 2026-10-01 (founder decision D9) — `HEADLINE_PLACEMENT_SEVERITY_BONUS` is now **0** (disabled). Measured against all 2,993 stored signals, the keyword match underlying `detectHeadlinePlacement()` fired "headline" on ~89.5% of titles, making the bonus a near-uniform +1 rather than a real placement signal. The detection call, log line, and collector wiring above are unchanged — only the bonus value is off. Details: `docs/claude_project/17_SIGNAL_ENGINE.md` §2.2 Factor 6, `10_DECISIONS.md` D9.
   > ⚠️ UPDATED 2026-10-07 — RSS, GNews, GDELT, and reconciliation no longer tell the classifier that a similar story exists just because some signal in the last 48 hours shares a country and event type. That check (`hasSimilarRecentSignal`) stays for ACLED and the chart backfill. On RSS and GNews it was true for almost every article, because those rows have no country and every signal's event type is "news". The four call sites now call `findSimilarRecentSignal` (`lib/novelty-hint.ts`): up to 300 signal titles from the last 48 hours, newest first, scored with the same token Jaccard as summary merge (`SIMILARITY_THRESHOLD` from `signal-merge.ts`). That constant was tuned on summaries on 2026-09-25; using it on titles is untested, and every match is logged as `[NOVELTY-HINT] title="..." match="..." similarity=0.xx`. A match names the earlier title and how many hours ago it was logged, and tells the model to treat the article as an update if it adds a number, a named person or organisation, a quote, or a decision, and as a repeat only if it adds nothing new. Those four cues come from published work on novelty in revised articles (named entities, new quotes, and events); their accuracy here is unvalidated (2026-10-07). No match says there is no similar recent signal in the last 48 hours. Callers that omit the new option still get the old country/event-type sentence. The materiality gate text, the JSON schema, and the threshold are unchanged.
3. Insert into `signals` with:
   - `severity` 1–10
   - `confidence` 0.55–0.90 (dynamic)
   - `commodity_impacts` JSON (USOIL, XAUUSD, etc.)
   - `currency_pair_impacts` JSON (EURUSD…USDCNY) — same `{asset,direction,confidence}` shape, from `ClassificationResult.currencyPairImpacts`. Added by #87 phase 1 (`a15e2fd`) to the schema/classifier and by phase 1B (`abb2004`, 2026-09-09) to the live inserts below — `signal-merge.ts` `insertOrMergeSignal()`, `reconciliation.ts`, `acled-collector.ts`. Heuristic fallback only emits USDRUB (Russia+sanctions) / USDCNY (China+tariff/Taiwan); the other 4 pairs are AI-only on that path. ADR 010 merge semantics: written once at row creation, never rewritten on a duplicate/escalation merge (parity with `commodity_impacts`).
   - **`event_date`** = article publish time (from RSS `pubDate`, GNews `publishedAt`, GDELT `seendate`)
   - **#141/#142 columns** = `relevance`, `novelty`, `event_category`, `market_mechanism`, `is_preview`, `source_confirmation`, `materiality_pass`, `materiality_reasoning`, `media_impact_entity`

> ⚠️ UPDATED 2026-09-25 (`d67ae2b`) — after classification, `insertOrMergeSignal()` merges on Jaccard similarity of the summary at **0.33**. A note that the live bar is still 0.55 is out of date.
> ⚠️ UPDATED 2026-08-19 — Step 3 is no longer an unconditional insert in the 3 live collectors (`rss-collector.ts`, `gnews-collector.ts`, `gdelt-collector.ts`). After classification returns, `insertOrMergeSignal()` (`apps/backend/src/workers/signal-merge.ts`) checks recent same-region signals for a plausible cross-source match on the classified summary. No match → inserts exactly as described above. A match with lower/equal severity → merges into the existing signal instead (`raw_event_ids` grows, `sources_count` increments, no new row, Sonnet briefing reused not regenerated). A match with higher severity → treated as an escalation: updates the existing signal's `severity` and regenerates its briefing rather than creating a second row. **Classification itself is never skipped** — this only changes what happens to an already-classified result. Full design and thresholds: `10_DECISIONS.md` ADR 010; `14_CHANGELOG.md` v0.27.0. Not wired into `reconciliation.ts`'s orphan-recovery insert path — that one is unchanged.

- `created_at` = first ingestion time into BBR
- `updated_at` = last signal update time in the DB
- dashboard default: signals with `event_date >= 24h`, full stop (see below —
  2026-09-28, the old `OR is_active = true` escape hatch was a no-op)
- explicit window filters: `latest`, `24h`, `7d`, `30d`, `all`, `active`

### 5.1 API: `/api/signals`

| Rule         | Value                                                               |
| :----------- | :------------------------------------------------------------------ |
| Auth         | Requires logged-in user                                             |
| DB read      | Service role key (if set on Vercel)                                 |
| Time window  | Tiered default (no `window` param): `event_date >= 24h`, widening to 72h then 7d if the candidate count is below `MIN_FEED_FILL` (12) — see below. Explicit `window` values (24h/7d/30d/all/active/`<N>d`) are unaffected, exactly one query each. |
| Sort default | Blended recency+severity rank (`relevanceRankScore`, `lib/signal-relevance-rank.ts`) — same formula `sort=relevance` (command palette) always used, now also the main feed's default. `sort=newest`/`sort=confidence` are the two remaining pure-order modes. |
| Cache        | `force-dynamic` — no Next.js cache                                  |

**2026-09-28 fix:** `is_active` is true on 100% of `signals` rows (no code path
ever sets it false) so the old default-window `event_date.gte.<24h> OR
is_active.eq.true` clause matched every row regardless of age — the "24h
default" was silently unbounded. Fixed to a real `event_date >= 24h` cutoff;
`window=active` still filters on `is_active` explicitly for the callers that
want it (`signal-merge.ts`'s own merge-candidate query, `alert-dispatcher.ts`,
`digest-sender.ts` — all independent of this route). Separately, the default
sort was pure `severity DESC` (with `created_at` only a same-severity
tiebreak), which let an old high-severity signal permanently outrank a
fresher lower-severity one; it now reuses the same `relevanceRankScore` blend
`sort=relevance` already used, so recency is weighed against severity across
the whole ranking, not just within ties. `signal-filters.ts`'s
`DEFAULT_FILTERS.minSeverity` floor also dropped 6 → 4 in the same change.

**2026-09-29 follow-up (tiered feed-fill fallback):** the hard 24h cutoff
above made a real thin-inventory moment (see #237/#238 — separate ingestion
work) look identical to a broken feed. The default (no `window` param) path
now tries 24h first; if the candidate count is below `MIN_FEED_FILL` (12 —
a product choice, not a researched number, revisit once there's real usage
data), it re-queries at 72h, then 7d, and stops — the explicit window picker
already covers wider views on request. The response carries a `resolvedWindow:
"24h" | "72h" | "7d"` field (present only on this default path) so the
frontend can show an honest "still expanding" banner when it widens (see
`dashboard/page.tsx`'s `windowExpandedLine`). The same default path also
splits a `justIn: Signal[]` field out of the response — the top 5 signals of
the resolved-window candidate set by `event_date` DESC (pure recency, no new
ranking formula), with their ids excluded from `signals` so nothing appears
twice. `useSignalFeed.ts` re-prepends `justIn` onto `liveSignals` for callers
that just want the one flat, no-duplicate list.

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
| Next run ~    | lastFetched + `cronIntervalMinutes` (self-reported, see §1)              |
| +N signals    | Last run `totals.signals`                                                 |
| Stale warning | Red if last fetch > 1.5× `cronIntervalMinutes` ago (was a hardcoded 20 min, which false-alarmed for the back half of every real 30-min cycle — fixed 2026-09-26) |

### 5.4 Featured card selection (`/dashboard`)

```typescript
const featured = justIn.length > 0 ? justIn[0] : liveSignals[0];
```

**2026-09-29 rewrite.** The previous rule (`liveSignals.find((s) => s.severity
>= 8) || liveSignals[0]`) leaned on a hard, non-time-bound severity floor and
was only safe because the default view was itself hard-bounded to `event_date
>= 24h` — once §5.1's tiered fallback let that window widen to 72h/7d, a
severity-8+ story up to a week old could resurface as "featured" ahead of
anything actually new, exactly the staleness problem the 2026-09-28 blended-sort
fix was meant to close. The new rule picks the single freshest signal
(`justIn[0]`, a pure `event_date` DESC pick from the same resolved-window
candidate set — see §5.1) when one exists, falling back to the top of the
blended list (`liveSignals[0]`) for explicit window filters or any response
with no `justIn` split. `justIn[0]` is both the freshest signal and, by
construction of the blend, already near the top of it — so this doesn't trade
relevance for recency. Reads from the exact same `liveSignals`/`justIn` the
rest of the feed uses — no separate query. (The pattern also independently
exists on the homepage, `app/page.tsx`, and `/map` — both out of scope for
this change, not touched. `/alerts/page.tsx` has no featured-card selection at
all.)

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
| **Hero card logic**       | Stale — hero is now the freshest signal (§5.4), not severity-gated |

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
ingestion-cycle complete   → every 30 min
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

Current strategy: maximize free RSS (28 feeds) + GNews + GDELT before adding paid APIs.
