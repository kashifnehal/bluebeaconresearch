# 10_DECISIONS.md — Architectural Decision Records (ADRs) & Trade-offs

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

This document records the foundational architectural decisions, framework selections, infrastructure trade-offs, underlying assumptions, and system risks for Blue Beacon Research.

---

## 1. ADR 001: Selection of Next.js 16 App Router for Web Terminal

### Context

The platform requires an institutional dark terminal interface with fast initial page load (SEO for landing page) combined with protected real-time dashboard routes.

### Decision

Adopt Next.js 16 (`apps/web`) using the App Router, `@supabase/ssr` middleware, and React 19.

### Rationale

- **SSR & SEO**: Server-side rendering for `/` and public pages guarantees optimal search engine indexing.
- **Middleware Guarding**: `middleware.ts` enables zero-latency route checking for authentication and `isProjectReady` gating before rendering page components.
- **Developer Velocity**: Seamless monorepo integration with shared TypeScript types (`packages/shared`).

---

## 2. ADR 002: Fastify REST Backend vs. Next.js API Routes

### Context

High-frequency ingestion workers, background alert routing, and external developer APIs require high-throughput Node.js execution.

### Decision

Decouple the backend API into a dedicated Fastify REST server (`apps/backend`) running on port 3001 rather than using Next.js route handlers exclusively.

### Rationale

- **Throughput**: Fastify is significantly faster with lower overhead than Next.js serverless functions.
- **Long-Running Process Isolation**: Background workers (`workers.ts`) and cron schedulers require persistent Node.js event loops, which are prohibited in serverless environments like Vercel.
- **Schema Validation**: Built-in Zod schema compilation and Fastify plugin ecosystem.

---

## 3. ADR 003: Upstash Redis & BullMQ for Background Processing

### Context

Ingesting 350+ global news feeds every 15 minutes and dispatching sub-second alerts requires reliable queue management with retry logic.

### Decision

Utilize BullMQ backed by Upstash serverless Redis.

### Rationale

- **Decoupled Heavy Operations**: AI prompts (Anthropic API calls take 1–3s) are isolated from HTTP request/response loops.
- **Concurrency & Backoff**: BullMQ provides automatic exponential backoff, rate-limiting, and dead-letter queues out of the box.
- **Serverless Redis**: Upstash Redis allows seamless scaling without managing self-hosted Redis servers.

---

## 4. ADR 004: Supabase PostgreSQL for Relational Data & RLS Security

### Context

Geopolitical signals, user preferences, alert rules, and API keys require strict tenant isolation and complex relational querying.

### Decision

Adopt Supabase PostgreSQL with native Row Level Security (RLS).

### Rationale

- **Database-Level Isolation**: RLS policies (`auth.uid() = user_id`) enforce security directly inside PostgreSQL, eliminating multi-tenant data leaks regardless of API layer bugs.
- **Full-Text Search**: Built-in GIN index support (`to_tsvector`) for fast text search on signal titles and summaries.
- **Ecosystem Integration**: Unified authentication, database migrations, and real-time subscriptions.

---

## 5. ADR 005: Heuristic Fallback Classifier (No Vendor Lock-in)

### Context

Claude API credits can exhaust. BullMQ workers require Redis to be operational. Both are external dependencies that can fail.

### Decision

`ClaudeService.classifyEvent()` wraps the Anthropic API call in a try/catch and falls back to a **keyword-based NLP heuristic classifier** when the API fails.

### Market Impact Integrity

- The heuristic fallback is conservative by design: it only emits commodity impacts when direct textual evidence exists.
- It must never invent market exposure to populate UI cards or assign a synthetic `USOIL` volatile impact when no commodity signal is present.
- If no defensible asset impact exists, the fallback returns an empty `commodityImpacts` array.
- Commodity asset symbols are validated against the approved product list to prevent unsupported or invented assets.

### Rationale

- **100% Pipeline Reliability**: Signals are ALWAYS created regardless of Anthropic credit balance, rate limits, or API outages.
- **No Mock Data**: Real news articles are processed into real signals, just without AI-enhanced analysis.
- **Zero Cost Fallback**: Heuristic classifier runs fully in-process with no external API cost.

---

## 6. ADR 006: Direct-to-DB Signal Insertion (Bypass BullMQ)

### Context

In early deployment, BullMQ workers may not be running. When collectors insert into `raw_events` and enqueue `aiClassification` jobs, if the worker isn't listening, signals are never created.

### Decision

Both `gnews-collector.ts` and `gdelt-collector.ts` now **classify and insert signals directly** to Supabase, bypassing the BullMQ queue entirely.

### Rationale

- **Simpler Runtime**: No dependency on Redis being available for basic ingestion.
- **Works Locally**: Developers can run a single cron trigger and immediately see signals in the DB.
- **Deduplication**: Signal dedup is handled by checking `external_id` in `raw_events` before classification.

---

## 7. ADR 007: RSS Real-Time Collector & Strict Word-Boundary Ingestion

### Context

GNews API free tier caches articles with a 12-hour lag, serving stale news despite workers running every 15 minutes. Additionally, simple substring keyword filters (`"war"`) produced false positives from historical or benign articles (e.g., _"1970 anti-war protests"_, _"tug-of-war"_).

### Decision

1. Introduce a dedicated RSS Collector (`apps/backend/src/workers/rss-collector.ts`) fetching live feeds from Reuters, BBC World, Al Jazeera, and The Guardian without API keys or rate limits.
2. Upgrade `isRelevantEvent` across collectors and inline auto-ingest to enforce **regex word-boundary matching** (`\bwar\b`, `\boil\b`, `\bgas\b`) and hard exclusions for historic year ranges (`1970`–`2005`).
3. Limit the web signal feed (`/api/signals`) to a **24-hour `event_date` window** sorted by publication timestamp `event_date DESC`.

### Rationale

- **Sub-Hour Freshness**: Wire RSS feeds provide breaking news within minutes (<1h), overcoming third-party API cache delays.
- **Zero API Costs**: RSS feeds require no authentication keys or paid subscriptions.
- **Signal Precision**: Regex word-boundary filtering ensures only true geopolitical/military/economic events reach severity 8–9.

---

## 8. ADR 008: Rate Limiter — Periodic Reconciliation, Not Local-Only or Per-Request

### Context

`apps/web/lib/ratelimit.ts` guards 4 routes against abuse using Upstash as the cross-instance source of truth. A prior pass added an in-memory local bucket meant to cut Upstash REST calls, but the logic was backwards — it only skipped Upstash once a key was *already over* its limit, so normal traffic (the common case) round-tripped externally on every request, contributing to the 2026-08-19 quota-exhaustion incident (`14_CHANGELOG.md` v0.24.0). Two honest options existed to fix this: accept a stated amount of under-enforcement from a purely local-only bucket, or keep Upstash as authoritative via periodic touches. `apps/web` runs as multiple Vercel serverless instances with no shared memory, so a purely local bucket would under-count a single client's true request rate once traffic spans instances/regions.

### Decision

**Periodic reconciliation, not accepted under-enforcement.** Each rate-limit key is resolved from local memory alone unless it's within 20% of its limit or hasn't consulted Upstash in the last 10 requests or 5 seconds (whichever comes first) — sub-linear in request volume (roughly 1 Upstash touch per ~10 requests per key under normal load), not the two rejected extremes of "1 call per request" (the pre-fix bug) or "0 calls ever" (would silently under-enforce at scale).

### Rationale

- **Correctness under the case that matters**: a key split evenly across several instances could look "well under limit" on each instance individually while being over limit in aggregate — the near-limit check (always reconcile above 80% of the local count) catches exactly this case before it matters, rather than after.
- **Cost stays bounded as traffic grows**: reconcile frequency is capped per key regardless of request volume, so Upstash command usage grows sub-linearly with user count instead of 1:1.
- **Known gap, explicitly accepted**: between reconcile touches, a key could locally under-count relative to its true cross-instance total by up to ~10 requests or 5 seconds' worth of traffic — acceptable for abuse *prevention* (the goal is stopping sustained hammering, not exact-request accounting), not acceptable to silently ignore, which is why it's written down here rather than left implicit in the code.

---

## 9. ADR 009: Dedicated Implicit-Flow Clients for Email-Delivered Auth Links

### Context

The shared browser Supabase client (`lib/supabase.ts`, via `@supabase/ssr`'s `createBrowserClient`) hardcodes `flowType: "pkce"`, which can't be overridden through options. PKCE requires the `code_verifier` generated by whichever browser *requested* the flow to still be present in that same browser's storage when the link is later opened — which breaks routinely for email-delivered links, since they're commonly opened in a different browser/device/in-app browser (Gmail app, WhatsApp link preview, a different device entirely) than the one that initiated the request. This affects two flows: password recovery (`resetPasswordForEmail`) and signup confirmation (`signUp`'s `emailRedirectTo`).

An initial fix (2026-08-18) addressed this with a page-scoped implicit-flow client inlined directly into `reset-password/page.tsx` — but left `forgot-password/page.tsx` (the *sender*) on the shared PKCE client, a real mismatch: whichever flow type the sending client used is what GoTrue embeds in the emailed link, so sender and receiver must agree.

### Decision

Two small dedicated clients, each shared between a flow's sender and receiver:
- `lib/supabase-recovery.ts` → `getSupabaseRecoveryClient()`, used by both `forgot-password/page.tsx` and `reset-password/page.tsx`.
- `lib/supabase-email-auth.ts` → `getSupabaseEmailAuthClient()`, used by `signup/page.tsx`, `confirm/page.tsx`, `VerifyClient.tsx`'s resend action, and `login/page.tsx`'s "resend confirmation" action.

Both are configured `flowType: "implicit", detectSessionInUrl: true, persistSession: true`, and both bridge the resulting session into the shared cookie-based client (`setSession()` with the implicit client's tokens) so the very next request is recognized as authenticated by middleware/SSR — the confirmed session otherwise lives only in the implicit client's own `localStorage`, invisible to the cookie-based auth check everything else relies on.

### Rationale

- **Correctness over convenience**: self-contained tokens in the link itself (implicit flow) tolerate any browser opening the link; PKCE's verifier-in-storage requirement doesn't survive a cross-browser open, which is the common case for email links, not an edge case.
- **One client per flow, not one client per page**: sender and receiver must use the same flow-type client or the mismatch bug (fixed 2026-08-19) recurs — sharing one client per flow is what makes that invariant checkable instead of implicit.
- **Shared client (`lib/supabase.ts`) deliberately left untouched**: OAuth and the general dashboard session are handled server-side via `/auth/callback` and don't depend on the browser client's `flowType`, so widening the shared client's config isn't needed and would be a larger blast-radius change than this problem requires.

---

## 10. ADR 010: Post-Classification Cross-Source Signal Merge

### Context

A cost-scaling audit (2026-08-19, done before funding real Anthropic credits) found that GNews, GDELT, and RSS each build their own `external_id` per source, so the same real-world event covered by multiple outlets produces multiple separate `signals` rows and multiple separate Claude calls for what's really one event — confirmed live against production data (120 exact-duplicate-text signal pairs in a 500-row sample), worse for high-severity stories that naturally get picked up by more outlets.

An earlier version of this design proposed skipping the Haiku classification call entirely on a pre-classification title-text match. **That design was explicitly rejected.** Skipping classification risks silently suppressing a genuinely distinct event if the match heuristic is wrong, with no error or log to catch it — for a product whose value proposition is "the most recent, most accurate signal," an invisible dropped signal is a worse business outcome than the cost being optimized away. It also freezes severity at whatever the first source produced: a real escalation (death toll rises, market reacts) covered by a second source would never update the existing signal — the opposite of what paying users need from a signal that's supposed to track a live situation.

### Decision

**Classification never gets skipped, ever.** `classifyEvent()` (Haiku) still runs on every article that passes the existing per-source `external_id` dedup check, unchanged, in all 3 live collectors. Only the expensive Sonnet briefing call may be skipped, and only *after* independent classification confirms two articles plausibly describe the same event.

The new step (`apps/backend/src/workers/signal-merge.ts`, `insertOrMergeSignal()`) runs after classification returns, using its structured output — not raw article text:
- **Match candidates**: recent `signals` (±8h window on `event_date`, the article's real publish time, not our ingestion time — chosen so GNews's ~12h ingestion-side cache lag doesn't force a wider window) with the same `region` (exact match; skipped entirely when region is missing/"global" — too broad a bucket to be a useful signal, confirmed live as the single largest region bucket mixing unrelated stories).
- **Similarity**: Jaccard token-overlap on `classification.summary`, threshold 0.55 — tuned against 500 real production signals, sitting above the zone where same-region pairs start looking like genuinely different developments of an evolving story rather than the same event.
- **No match** → insert new signal exactly as before, existing `severity >= 7` Sonnet gate unchanged.
- **Match, new severity <= existing** → duplicate: append `raw_event_ids`, increment `sources_count`, reuse existing `ai_analysis`, skip Sonnet entirely.
- **Match, new severity > existing** → escalation: update `severity`, append `raw_event_ids`, increment `sources_count`, regenerate the Sonnet briefing (gated on the *new* severity crossing >=7, same rule as everywhere else — an explicit judgment call, since the task spec was ambiguous on whether regeneration should be unconditional).
- Every merge/escalation decision is logged distinctly (`[SIGNAL-MERGE:duplicate]` / `[SIGNAL-MERGE:escalation]`) with the matched signal id, similarity score, and time delta, so real decisions are greppable and spot-checkable after shipping.

### Rationale

- **Bias toward not merging when uncertain, by design**: a missed duplicate costs one extra Sonnet call (a few cents); a wrongful merge or a missed escalation costs the user real information. The 0.55 similarity threshold, the 8h window, and the exact (not fuzzy) region match were all chosen on the conservative side of that tradeoff, backed by a real backtest rather than picked blind.
- **Structured classification output is a higher-confidence match signal than raw article text** — comparing two independent AI classifications of the same event (region, severity, a paraphrased summary) is far less noisy than comparing raw, differently-styled headlines across outlets.
- **Escalation handling is the reason classification can never be skipped**: a design that skips classification on a text match can never know a second article represents a worse outcome than the first. This design always knows, because it always classifies first.
- **Not extended to `reconciliation.ts`** — deliberately scoped to the 3 live collectors only; the orphan-recovery job still inserts signals the old way, a small residual gap (rare, capped at 200/run) rather than an oversight.
- **Does not re-dispatch alerts on escalation** — an escalated signal crossing a `min_severity` threshold arguably deserves a fresh alert, but that's a separate product decision (risk of duplicate-notifying already-alerted users) not decided unilaterally here.
> ⚠️ UPDATED 2026-08-19 (Prompt J.6, commit `4421205`) — Founder decided this, resolving the open question above: escalations now DO re-dispatch, gated to avoid spam. Fires when the new severity crosses >=7 for the first time, or jumps >=2 points in one update (even already above 7, e.g. 7→9) — a plain refinement like 7→8 does not re-alert. Reuses `dispatchAlertsForSignal` (extended with an optional escalation-context parameter that only changes the outgoing message framing to a distinct "UPDATED: severity X → Y" — the original new-signal template and every other call site are byte-unchanged) rather than a parallel send path. Idempotency: no new table/flag — relies on the same "called at most once per triggering DB write" guarantee the original new-signal dispatch already had; the pre-update severity is read once and compared, so a given real jump can only ever be classified as crossing the threshold once. Live-verified against real DB rows: small escalation → no re-alert; threshold-crossing escalation → exactly one re-alert, distinct template confirmed; duplicate/new-signal paths unaffected. Logged distinctly (`[SIGNAL-MERGE:escalation-realerted]` vs. plain `[SIGNAL-MERGE:escalation]`).

---

## 11. Architectural Assumptions & Future Risks

1. **Third-Party API & RSS Feed Availability**: System relies on GNews, GDELT, RSS endpoints, Yahoo Finance uptime.
2. **Anthropic API Credits**: Production requires Anthropic credits. Heuristic fallback covers outages but quality is lower.
3. **GNews Free Tier**: 10 articles / 15 min = 960 articles/day. Upgrade if more volume is needed.
4. **GDELT Reliability**: GDELT v2/doc/doc API is academic infrastructure; occasional slow responses are expected.
5. **Map Rendering Choice**: To avoid Mapbox account/token dependencies and ensure out-of-the-box functionality, the web client uses **MapLibre GL** with OpenStreetMap raster tiles. This preserves GIS features (heatmap, clustering) while removing reliance on Mapbox tier limits.
