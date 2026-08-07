# CLAUDE_CONTEXT.md — Project Synchronization & Change Log for Claude

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
PORT=8888
NODE_ENV=production

# 2. Database & Auth (Supabase)
SUPABASE_URL=https://jzomoxsbnssnibshecui.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6b21veHNibnNzbmlic2hlY3VpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM2ODY5MywiZXhwIjoyMDg5OTQ0NjkzfQ.9V2R4GyIi0TqdPHyLQ4aZxNsL_2LojgAsktF3Vm17dI

# 3. AI Engine (Anthropic Claude)
ANTHROPIC_API_KEY=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

# 4. News & Market Ingestion
NEWS_API_KEY=0be0d72df15f0e7616dc4e67a2c8907b
ALPHA_VANTAGE_API_KEY=7X3ZTK5BYGNWXZ7K

# 5. Caching & BullMQ Queues (Upstash Redis)
UPSTASH_REDIS_REST_URL=https://cute-javelin-200660.upstash.io
UPSTASH_REDIS_REST_TOKEN=gQAAAAAAAw_UAAIgcDFhMjQ3ZjVhNDk0YmE0ZTFmOTI5YmUxMmQyNTZmN2ZlMw
REDIS_URL=rediss://default:gQAAAAAAAw_UAAIgcDFhMjQ3ZjVhNDk0YmE0ZTFmOTI5YmUxMmQyNTZmN2ZlMw@cute-javelin-200660.upstash.io:6379

# 6. Public Client App URL
NEXT_PUBLIC_APP_URL=https://bluebeaconresearch.com
```

---

#### 3. Key Findings & Configuration Rules
1. **`SUPABASE_URL`**: Required by Fastify backend (`env.ts`). Added fallback logic `if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL`.
2. **`REDIS_URL` vs REST URL**: `ioredis` requires the TCP `rediss://...` socket string from Upstash Console (Details tab -> Node.js / ioredis connection string). REST `https://` URLs are for `@upstash/redis` HTTP calls only.
3. **Port Matching**: Set `PORT=8888` on Railway variables tab to align Fastify's listener with Railway's exposed domain port.

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
  - **Domain**: `api.bluebeaconresearch.com` (Port 8080/8888)
  - **Purpose**: Serves low-latency REST API requests (`/v1/signals`, `/v1/alerts`).

- **Service 2 — `workers` (Background Jobs)**:
  - **Start Command**: `pnpm run start:workers`
  - **Domain**: None (Headless service)
  - **Purpose**: Runs 15-minute `node-cron` collectors (GDELT, ACLED, GNews, Alpha Vantage) and BullMQ AI classifier queues (`aiClassification`, `signalGeneration`, `alertDispatch`).


