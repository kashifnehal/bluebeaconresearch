# CLAUDE_CONTEXT.md — Project Synchronization & Change Log for Claude

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

> **Purpose**: This file acts as the primary contextual changelog and implementation record for uploading directly into the Claude Project context. Every task execution, code change, architectural refinement, and bugfix is documented here with precise timestamps, modified files, diff summaries, and verification results.

---

## 📅 Session Log: 2026-08-05

### 🕒 Timestamp: 05:15 IST — Signal Quality, Pre-filtering, Country Mapping, Confidence Calibration & Duplicate Prevention

#### 1. Task Summary
Executed a comprehensive fix for signal quality in Blue Beacon Research to prevent irrelevant news (e.g. sports, entertainment, travel) from being classified as geopolitical signals, fix default "COUNTRY: UNKNOWN" cards, calibrate confidence score prompts, and prevent duplicate signal insertion.

---

#### 2. Modified Files List

1. **`apps/backend/src/workers/gdelt-collector.ts`**
   - Added `HIGH_RELEVANCE_KEYWORDS` and `EXCLUDE_KEYWORDS` constant arrays.
   - Added `isRelevantEvent(title, summary)` pre-filter helper.
   - Filtered out irrelevant events before inserting to `raw_events` and enqueuing to BullMQ classification queue.
   - Added `filtered` count tracking in return object.

2. **`apps/backend/src/workers/gnews-collector.ts`**
   - Imported `isRelevantEvent` from `./gdelt-collector.js`.
   - Applied pre-filter check `isRelevantEvent(title, summary)` before database insertion.
   - Added `filtered` count tracking in return object.

3. **`apps/backend/src/services/claude.service.ts`**
   - Added `console.log('[CLAUDE RAW]', raw)` logging for debugging raw Claude model outputs.
   - Updated Claude 3.5 Haiku classification prompt to calibrate confidence score precision:
     > `"confidence: a float between 0.0 and 1.0 representing how certain you are that this event will materially impact the listed commodity prices. Score 0.8-1.0 only for direct supply disruptions or major policy changes. Score 0.3-0.5 for indirect risks. Score below 0.3 for unlikely impacts."`

4. **`apps/backend/src/workers/ai-classifier.ts`**
   - Added `COUNTRY_CODES` ISO 2-letter lookup dictionary (e.g. `'US': 'United States'`, `'IR': 'Iran'`, `'UA': 'Ukraine'`, `'RU': 'Russia'`, `'IL': 'Israel'`, etc.).
   - Added `formatCountryName` helper to replace `"UNKNOWN"` or missing codes with readable country names or `"Global"`.
   - Implemented duplicate signal check:
     ```typescript
     const { data: existingSignal } = await supabase
       .from("signals")
       .select("id")
       .contains("raw_event_ids", [rawEventId])
       .maybeSingle();

     if (existingSignal?.id) {
       console.log(`[CLASSIFIER] Duplicate signal skipped for raw_event: ${rawEventId}`);
       return { signalId: existingSignal.id, duplicate: true };
     }
     ```

5. **`docs/brain/CLAUDE_CONTEXT.md` & `brain/CLAUDE_CONTEXT.md`**
   - Created and synced synchronization documentation for Claude Project uploads.

---

## 💻 Code Changes & Implementation Diffs

### Task 1: Pre-filter in GDELT & GNews Collectors
```typescript
// Keywords added to gdelt-collector.ts
export const HIGH_RELEVANCE_KEYWORDS = [
  'war', 'conflict', 'attack', 'strike', 'missile', 'bomb', 'explosion', 'troops', 
  'military', 'sanction', 'blockade', 'invasion', 'offensive', 'airstrike', 'ceasefire',
  'oil', 'crude', 'gas', 'pipeline', 'refinery', 'opec', 'hormuz', 'energy', 'fuel',
  'tariff', 'embargo', 'trade war', 'inflation', 'fed', 'rate decision',
  'central bank', 'interest rate', 'cpi', 'gdp', 'recession',
  'iran', 'russia', 'ukraine', 'china', 'taiwan', 'israel', 'hamas', 'houthi',
  'nato', 'nuclear', 'coup', 'protest', 'riot', 'civil war', 'tension',
  'wheat', 'grain', 'food', 'gold', 'copper', 'commodity', 'shortage', 'supply chain',
  'shipping', 'tanker', 'suez', 'malacca', 'red sea', 'vessel', 'port'
];

export const EXCLUDE_KEYWORDS = [
  'sports', 'football', 'soccer', 'fifa', 'nfl', 'nba', 'olympics', 'marathon',
  'celebrity', 'music', 'movie', 'film', 'award', 'oscar', 'grammy',
  'weather', 'tourism', 'travel', 'fashion', 'lifestyle', 'recipe', 'cooking'
];

export function isRelevantEvent(title: string, summary: string = ""): boolean {
  const text = (title + " " + summary).toLowerCase();
  const hasExcludeWord = EXCLUDE_KEYWORDS.some((kw) => text.includes(kw));
  if (hasExcludeWord) return false;
  const hasRelevantWord = HIGH_RELEVANCE_KEYWORDS.some((kw) => text.includes(kw));
  return hasRelevantWord;
}
```

### Task 2: Confidence Calibration & Prompt Update
```typescript
// Prompt update in claude.service.ts
const user =
  `Event: ${String(rawEvent.title ?? "")}\n` +
  `Country: ${String(rawEvent.country ?? "")}\n` +
  `Type: ${String(rawEvent.event_type ?? "")}\n` +
  `Date: ${String(rawEvent.event_date ?? "")}\n\n` +
  `Return ONLY valid JSON (no markdown):\n` +
  `{\n` +
  `  "severity": integer between 1 and 10,\n` +
  `  "confidence": a float between 0.0 and 1.0 representing how certain you are that this event will materially impact the listed commodity prices. Score 0.8-1.0 only for direct supply disruptions or major policy changes. Score 0.3-0.5 for indirect risks. Score below 0.3 for unlikely impacts.,\n` +
  `  "commodityImpacts": [{ "asset": string, "direction": "up"|"down"|"volatile"|"neutral", "confidence": number }],\n` +
  `  "isBreaking": boolean,\n` +
  `  "summary": string (max 120 chars),\n` +
  `  "region": string\n` +
  `}`;
```

### Task 3 & 4: Country Mapping & Duplicate Check
```typescript
// ai-classifier.ts helper & check
const COUNTRY_CODES: Record<string, string> = {
  US: "United States", IR: "Iran", UA: "Ukraine", RU: "Russia",
  IL: "Israel", SA: "Saudi Arabia", CN: "China", SY: "Syria",
  IQ: "Iraq", AF: "Afghanistan", YE: "Yemen", LY: "Libya",
  SD: "Sudan", ET: "Ethiopia", IN: "India", PK: "Pakistan",
  GB: "United Kingdom", DE: "Germany", FR: "France", JP: "Japan",
  KR: "South Korea", TW: "Taiwan", TR: "Turkey", EG: "Egypt",
  QA: "Qatar", AE: "United Arab Emirates", KP: "North Korea",
  PL: "Poland", BY: "Belarus", VE: "Venezuela", CO: "Colombia",
  BR: "Brazil", MX: "Mexico", NG: "Nigeria", ZA: "South Africa",
};

export function formatCountryName(rawCountry?: string | null): string {
  if (!rawCountry || rawCountry.toUpperCase() === "UNKNOWN") return "Global";
  const upper = rawCountry.toUpperCase().trim();
  return COUNTRY_CODES[upper] || rawCountry;
}
```

## 📅 Session Log: 2026-08-05 (Session 2)

### 🕒 Timestamp: 17:15 IST — Railway Environment Variable Audit & Credential Audit

#### 1. Task Summary
Audited all Railway environment variables required by `apps/backend/src/env.ts`, `redis.ts`, and background collectors. Validated user-provided credentials (Supabase, Anthropic API, Alpha Vantage, GNews, Upstash Redis).

---

#### 2. Complete Verified Railway Environment Variables

```env
# 1. Server Configuration
PORT=3001
NODE_ENV=production

# 2. Database & Auth (Supabase)
SUPABASE_URL=https://evavcgfmemwryggdkjmx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>  # REDACTED 2026-08-15 — rotate in Supabase dashboard, this value was exposed in git history

# 3. AI Engine (Anthropic Claude)
ANTHROPIC_API_KEY=<anthropic_key>  # REDACTED 2026-08-15 — rotate at console.anthropic.com, this value was exposed in git history

# 4. News & Market Ingestion
NEWS_API_KEY=<gnews_key>  # REDACTED 2026-08-15 — rotate at gnews.io dashboard
ALPHA_VANTAGE_API_KEY=<alpha_vantage_key>  # REDACTED 2026-08-15 — unused (Yahoo Finance replaced it), rotate or revoke anyway

# 5. Caching & BullMQ Queues (Upstash Redis)
UPSTASH_REDIS_REST_URL=https://cute-javelin-200660.upstash.io
UPSTASH_REDIS_REST_TOKEN=<upstash_token>  # REDACTED 2026-08-15 — rotate in Upstash dashboard, this value was exposed in git history
REDIS_URL=rediss://default:<upstash_token>@cute-javelin-200660.upstash.io:6379  # REDACTED 2026-08-15 — same token as above

# 6. Public Client App URL
NEXT_PUBLIC_APP_URL=https://bluebeaconresearch.com
```

> ⚠️ CORRECTED 2026-08-27 — this block previously read `PORT=8888`, which was wrong, and carried only an annotation saying so. Fixed in place to `PORT=3001`, the actual backend default (`apps/backend/src/env.ts` line 24: `PORT: z.coerce.number().int().positive().default(3001)`; also `docs/brain/10_DECISIONS.md`). Historical note: this session log's original instruction to set `PORT=8888` was itself a mistake, not a later-superseded value — see also `docs/claude_project/09_BACKLOG.md` M23, kept as-is since that file is an explicitly historical record.

---

#### 3. Key Findings & Configuration Rules
1. **`SUPABASE_URL`**: Required by Fastify backend (`env.ts`). Added fallback logic `if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL`.
2. **`REDIS_URL` vs REST URL**: `ioredis` requires the TCP `rediss://...` socket string from Upstash Console (Details tab -> Node.js / ioredis connection string). REST `https://` URLs are for `@upstash/redis` HTTP calls only.
3. **Port Matching**: Set `PORT=8888` on Railway variables tab to align Fastify's listener with Railway's exposed domain port.

> ⚠️ UPDATED 2026-08-19 — this port guidance is wrong; the actual backend port default is 3001, not 8888 (see note above).

---

## 📅 Session Log: 2026-08-07

### 🕒 Timestamp: 17:30 IST — Railway Multi-Service Architecture, Supabase WebSocket Polyfill & Auth Redirection Fix

#### 1. Task Summary
Configured Railway production microservice separation (`backend` API service vs `workers` background job service), resolved Node 20 Supabase Realtime WebSocket runtime crash, and fixed Next.js SSR auth cookie synchronization on login.

---

#### 2. Modified Files List

1. **`apps/backend/src/env.ts`**
   - Added robust env variable fallbacks in `getEnv()`:
     - `GNEWS_API_KEY` → `NEWS_API_KEY`
     - `ACLED_API_EMAIL` → `ACLED_EMAIL`
     - `NEXT_PUBLIC_SUPABASE_URL` → `SUPABASE_URL`

2. **`apps/backend/src/clients/supabase.ts`**
   - Installed `ws` dependency in `apps/backend/package.json`.
   - Polyfilled `globalThis.WebSocket` with `ws` to resolve Node 20 runtime error (`Error: Node.js detected but native WebSocket not found.`).
   - Configured `realtime.transport` option on `createClient`.

3. **`apps/web/app/(auth)/login/page.tsx`**
   - Replaced `router.push` soft client navigation with `window.location.href` upon successful sign-in.
   - Guaranteed Supabase auth cookies are attached to HTTP headers for Next.js SSR `middleware.ts` evaluation.

4. **`docs/brain/CLAUDE_CONTEXT.md` & `brain/CLAUDE_CONTEXT.md`**
   - Synchronized complete documentation across docs and root brain directories.

---

#### 3. Production Microservice Architecture (Railway)

- **Service 1 — `backend` (HTTP API)**:
  - **Start Command**: `pnpm run start:server`
  - **Config File**: [`apps/backend/railway.json`](file:///Users/kashif/Documents/ProjectSprints/blueBeaconResearch/apps/backend/railway.json)
  - **Domain**: `api.bluebeaconresearch.com` (Port 8080/8888)

> ⚠️ UPDATED 2026-08-19 — actual backend port default is 3001, not 8080/8888.
  - **Purpose**: Serves low-latency REST API requests (`/v1/signals`, `/v1/alerts`).

- **Service 2 — `workers` (Background Jobs)**:
  - **Start Command**: `pnpm run start:workers`
  - **Config File**: [`apps/backend/railway.workers.json`](file:///Users/kashif/Documents/ProjectSprints/blueBeaconResearch/apps/backend/railway.workers.json)
  - **Domain**: None (Headless service)
  - **Purpose**: Runs 15-minute `node-cron` collectors (GDELT, ACLED, GNews, Yahoo Finance commodity price syncer) and BullMQ AI classifier queues.

---

### 🕒 Timestamp: 18:00 IST — Yahoo Finance Real-time Market Data & 3-Tier Price Fallback Chain

#### 1. Task Summary
Replaced rate-limited Alpha Vantage API with `yahoo-finance2` for unlimited real-time commodity futures prices. Implemented a 3-tier price fallback chain in `apps/web/app/api/prices/route.ts` (Database → Redis → Static Fallback) guaranteeing non-null price data.

#### 2. Implemented Components
1. **`apps/backend/railway.json`**: Railway config for HTTP API service (`start:server`, healthcheck at `/health`).
2. **`apps/backend/railway.workers.json`**: Railway config for workers service (`start:workers`, no public port).
3. **`apps/backend/src/workers/price-syncer.ts`**: Replaced Alpha Vantage with `yahoo-finance2` library. Fetches real-time commodity futures: WTI (`CL=F`), Brent (`BZ=F`), Gold (`GC=F`), NatGas (`NG=F`), Wheat (`ZW=F`), Copper (`HG=F`), Silver (`SI=F`), Corn (`ZC=F`). Runs every 15 minutes. Caches each price in Upstash Redis with 900s TTL.
4. **`apps/web/app/api/prices/route.ts`**: 3-tier price resolution chain:
   - **Tier 1**: Supabase `commodity_prices` table (freshest data)
   - **Tier 2**: Upstash Redis cache keys `prices:{SYMBOL}` (fallback if DB fails)
   - **Tier 3**: Static hardcoded fallback prices (ensures zero null responses to frontend)

#### 3. Pre-conditions Already Met (Prompt 1 — Signal Quality)

> All tasks from Prompt 1 were confirmed already implemented in the codebase. No new work required.

- ✅ `gdelt-collector.ts`: `HIGH_RELEVANCE_KEYWORDS`, `EXCLUDE_KEYWORDS`, `isRelevantEvent()` filter applied pre-BullMQ queue.
- ✅ `gnews-collector.ts`: `isRelevantEvent()` imported from gdelt-collector and applied.
- ✅ `claude.service.ts`: Confidence calibration prompt updated with precise scoring instructions.
- ✅ `ai-classifier.ts`: `COUNTRY_CODES` ISO-2 mapping + `formatCountryName()` helper + duplicate signal prevention (`contains(raw_event_ids, [rawEventId])` check).

---

### 🕒 Timestamp: 05:00 IST — Google OAuth 2.0 Integration & Trigger Hardening

#### 1. Task Summary
Audited all 20 steps of the Google OAuth workflow across Google Cloud Console, Supabase Auth Providers, Next.js frontend, and PostgreSQL triggers. Enabled Google OAuth sign-in/up across authentication pages, updated `redirectTo` to dynamically use `window.location.origin`, and enhanced database trigger `handle_new_user()` to capture Google user names into `public.profiles`.

#### 2. Implemented & Verified Components
1. **`apps/web/app/(auth)/signup/page.tsx`**: Uncommented Google OAuth section; updated `redirectTo` to use `window.location.origin`.
2. **`apps/web/app/(auth)/login/page.tsx`**: Verified `signInWithOAuth({ provider: 'google' })`; updated `redirectTo` to use `window.location.origin`.
3. **`apps/web/app/auth/callback/route.ts`**: Verified PKCE code exchange (`exchangeCodeForSession`), profile `onboarding_completed` check, and conditional redirects (`/onboarding` vs `/dashboard`).
4. **`apps/web/middleware.ts`**: Verified `/auth` is permitted in `GATED_ALLOWED` so `/auth/callback` runs without unauthenticated blocks.
5. **`supabase/migrations/004_auth_triggers.sql`**: Updated `handle_new_user()` trigger function to `coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')`.


---

## 📋 Cumulative Env Variable Reference (Railway — Both Services)

```env
NODE_ENV=production
PROJECT_READY=true
SUPABASE_URL=https://evavcgfmemwryggdkjmx.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://evavcgfmemwryggdkjmx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
REDIS_URL=redis://default:<token>@cute-javelin-200660.upstash.io:6379
UPSTASH_REDIS_REST_URL=https://cute-javelin-200660.upstash.io
UPSTASH_REDIS_REST_TOKEN=<token>
ANTHROPIC_API_KEY=<anthropic_key>
NEWS_API_KEY=<gnews_key>       # used by gnews-collector.ts
GNEWS_API_KEY=<gnews_key>      # alias fallback resolved in env.ts
ALPHA_VANTAGE_API_KEY=<key>    # now unused by price-syncer (Yahoo Finance used instead)
NEXT_PUBLIC_APP_URL=https://bluebeaconresearch.com
API_URL=https://bluebeaconresearch.com
TELEGRAM_BOT_TOKEN=            # required when bot is active
```

> ⚠️ CORRECTED 2026-08-27 — the env block above previously listed `jzomoxsbnssnibshecui.supabase.co`, an old/wrong project ref, and carried only an annotation saying so. The block itself is now fixed in place to `evavcgfmemwryggdkjmx.supabase.co`, matching the real `.env.local`, `supabase/.temp/project-ref`, and the current status docs (same correction already made in `21_PROJECT_BRIEFING.md`). Historical note: this same file's earlier session-log block above (Aug-05) always had the correct ref — it was this later "cumulative" listing that had regressed.

---

### 🕒 2026-08-27 — CTO verification pass: Telegram audit, geocoding gap, commodity_impacts bug, Sonnet briefing visibility

#### 1. Task Summary
A round of CTO-directed checks, each live-verified rather than taken on faith from prior docs (two of the four original task premises turned out to be stale/inverted on inspection). Full technical detail lives in `docs/brain/14_CHANGELOG.md` v0.30.0 and `docs/brain/08_CURRENT_STATUS.md` §5 — this entry is a pointer, not a duplicate.

#### 2. Outcomes
1. **Telegram delivery path** — audited read-only, no fix applied. Backend wiring is correct; the frontend has no working "Connect Telegram" UI (the `connect-code` endpoint is called by nothing), and onboarding's `@username` field writes a value Telegram's API can't message. Needs a real UI fix before `TELEGRAM_BOT_TOKEN` alone would help.
2. **Watchlist/Backtesting/Settings UX (Select All, sparkline authenticity, dropdown styling)** — all 3 confirmed live-working via Playwright + a throwaway test account. No code changed.
3. **Signal-generation dormant-queue claim** — confirmed already fixed 2026-08-18 (docs were stale, not the code); doc corrected, live evidence gathered (133/554 severity≥7 signals with real `ai_analysis`).
4. **Geocoding** — original premise (RSS missing it) was inverted; RSS already had it, GDELT/GNews didn't. Fixed and live-verified (`155bb5a`).
5. **`commodity_impacts` empty on all live signals** — root-caused to a case-sensitive ticker-allowlist bug in Haiku classification (`6fcaeb8`); 41 of ~1,869 empty historical signals backfilled (scope narrowed to actual bug-victims, not blanket re-classification); two unrelated bugs surfaced as a byproduct (map time-window buttons, `/api/signals?commodity=` JSON error) — not fixed, flagged for a separate pass.
6. **Sonnet briefing ~25% fallback rate** — added error logging + bounded retry (`03b538f`); historical root cause could not be determined retroactively since no error logs existed before this fix.
