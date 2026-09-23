# 10_DECISIONS.md — Architectural Decision Records (ADRs) & Trade-offs

> **📍 Doc status — current as of 2026-09-20 for standing rules.** Latest ADRs through ADR 022 / D26 plus #146. Day-to-day: `docs/brain/LIVE_TODO.md`. `claude/23_TODO.md` is not in this repo.

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

> ⚠️ UPDATED 2026-09-20 — Fastify `@fastify/swagger` `/docs` is **dev/test only**. Production previously served unauthenticated OpenAPI; that is closed, not a public developer portal. The browser's `/api/signals` BFF reads Supabase directly and does not proxy Fastify.

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

## 11. ADR 011: Validation-Before-Build Discipline

### Context

Desk research (competitor analysis, market sizing, persona modelling) had been accumulating faster than any real-world contact with the people the product is for. The unsourced-TAM-figure incident corrected in the same pass that added this ADR (see ADR 012) is a concrete example of the failure mode: a precise-looking number circulated through the canonical doc tree for weeks because nobody had a checkable source and nobody had talked to the segment it described.

### Decision

No further engineering phase beyond current in-flight work starts without a real-world validation checkpoint first — real user interviews, a real (even manual) paywall test, and/or a distribution test in a community the target user already lives in. Desk research informs *what* to test; it does not substitute for testing.

### Rationale

- **Cost asymmetry**: a validation checkpoint costs days; a wrong build bet costs weeks.
- **The failure mode is already on the record**: ADR 012 exists because a market claim went unchallenged for lack of any real-world contact — validation-before-build is the general form of that fix.
- **Scope**: applies to *new* phases, not to finishing work already underway.
> ⚠️ UPDATED 2026-09-07 — Checkpoint CLEARED. Closed via desk research (Perplexity/Grok transcripts reviewed directly, plus independent web verification) rather than the live interviews or manual paywall test this ADR originally called for: #77 (10-15 live interviews) retired as scoped; #78 (manual Stripe test) deprioritized behind real free-tier traction rather than run now; #91 (distribution test) substituted with independent research, no personal outreach; #92 (concierge digest test) dropped as a pre-build gate, with the digest now built and correctable against real post-launch usage instead. Cleared on desk research plus a founder-confirmed free-first launch strategy (no payment method added until real free-tier traction is observed) — not on the validation methods originally specified above. See `docs/brain/LIVE_TODO.md` for the full decision log.

---

## 12. ADR 012: No Unsourced Precision in Market-Sizing or User-Population Claims

### Context

`docs/claude_project/00_PROJECT.md` and `02_BUSINESS.md` carried per-segment buyer-population figures ("2.5M+ active retail derivatives traders", "800K import/export SMBs", "50K quant/algo builders") and TAM figures derived from them. Independent research (2026-08-30) could not trace three of the four to any named, checkable source — no regulator, exchange body, or trade association publishes a global count for these segments.

### Decision

No market-sizing or user-population number is used in external-facing material unless it traces to a named, checkable source, or is presented as an explicit range with the uncertainty stated. Where no real number exists, say so rather than estimating a precise-looking one. The figures above were removed — not replaced with a new estimate — in the same pass that recorded this ADR.

### Rationale

- Presenting fabricated precision to an investor is a worse outcome than admitting the number isn't known.
- This is low-effort, fixable discipline — the cost is a sentence of honesty, not a research programme.
- Consistent with the project's standing "never fabricate data in the UI" rule, extended to strategy docs.

### Cross-tree mapping

Recorded as **D16** in `docs/claude_project/10_DECISIONS.md` (that file uses `D#` numbering; this file uses `ADR 0##`). Same decision.

---

## 13. ADR 013: Forex/Equity Asset-Class Expansion — Evaluation Status, Not Commitment

### Context

Extending BBR's signal schema and product surface to forex and equity swing/day-traders has been discussed as a way to widen the addressable market. The schema extension is architecturally cheap if bundled with already-planned personalization work.

### Decision

Forex and equity swing/day-trader expansion is a scoped, prompt-ready, evaluation-stage initiative — **not an approved roadmap commitment**. It is gated behind the ADR 011 validation checkpoint (real conversations with real forex/equity traders specifically) before any schema or product work begins. Crypto expansion is not being reconsidered (remains out of scope per `09_BACKLOG.md`).

### Rationale

- The schema extension is cheap if bundled with planned personalization work, but not validated enough to build blind.
- Keeping it explicitly "evaluation-stage" prevents it drifting into roadmap docs as a commitment — the framing error ADR 012 addresses for market size, applied to roadmap.

### Cross-tree mapping

Recorded as **D17** in `docs/claude_project/10_DECISIONS.md`.
> ⚠️ UPDATED 2026-09-07 — Forex gate confirmed SOFTENED: forex only, not equity. Based on desk research (Perplexity/Grok transcripts plus an independently-verified live ForexFactory thread), not customer interviews. The ADR 011 validation checkpoint was cleared via desk research generally (see that ADR's amendment); this decision applies that clearance specifically to forex. Schema/product work for forex may now proceed (#87, forex taxonomy expansion). Equity swing/day-trader expansion remains evaluation-stage and gated as before — no comparable desk-research signal has been produced for that segment specifically. Crypto remains out of scope, unchanged.
> ⚠️ UPDATED 2026-09-09 — #87 forex taxonomy now **fully shipped** (all 3 phases): **phase 1** (schema `signals.currency_pair_impacts` + classifier + forex price sync, `a15e2fd`), **phase 1B** (wired into the live signal-creation paths, `abb2004`), **phase 2** (`user_preferences.forex_pairs` into onboarding + `/api/signals?personalized=true` + `/watchlist`, `55df380`), and **phase 3** (`alert_rules.forex_pairs` + dispatcher/digest forex matching + Alerts UI multi-select, `a102e68` — verified with a real forex-only Telegram alert). Equity still gated — unchanged (ADR 013 / D17). Full record: `14_CHANGELOG.md` v0.36.0–v0.36.3, `LIVE_TODO.md` (#87).

---

## 14. ADR 014: No Features Requiring Government Permission or Difficult Third-Party Platform Approval

### Context

Several proposed channels and features depend on a slow, opaque external approval process before BBR can ship or even test them — Meta Business Verification (business-registration docs submitted for Meta review, 1–2+ week turnaround, sometimes stuck for weeks with no response), Google sensitive-scope OAuth review, TikTok Content Posting API audits, Pinterest Standard Access, and the like. These gates put a third party's queue and legal-review posture on BBR's critical path, and carry their own rejection/restriction risks.

### Decision

BBR does not build features that require government permission or a difficult third-party platform approval process (Meta Business Verification, Google sensitive-scope OAuth, TikTok/Pinterest API audits, etc.). BBR is a global company deliberately avoiding regulatory/legal entanglement. Additionally: BBR never collects or stores payment information directly — only through a hosted processor (Stripe Checkout / Payment Links); and BBR never gives financial or trading advice. Confirmed 2026-09-07.

### Direct consequence — #85 (WhatsApp alert channel) is KILLED, not paused

#85 (WhatsApp alerts via the Meta Cloud API) required Meta Business Verification, which is exactly the "difficult permission" category this decision rules out. It is **killed**, not deferred — see `docs/brain/LIVE_TODO.md` for the preserved planning/cost/risk context so it can be resumed later without re-researching from scratch. Independently, WhatsApp was already the weakest-evidenced of BBR's three candidate notification channels for its researched (Western-trader-weighted) audience — Telegram/Discord dominate there; WhatsApp's edge only showed in India-specific data, and BBR separately decided not to pursue India as a distinct go-to-market push. It is a lower-confidence bet that also fails the new gate, not a strong bet sacrificed to policy.

The Social Auto-Poster spec (docs 34–37 references) and #93 (richfeed) fall under the same policy: their blockers (Meta Advanced Access, TikTok Content Posting API audit, Pinterest Standard Access) are all difficult-approval gates. Combined with the founder's confirmation that richfeed is his own separate India-focused social-distribution project (not BBR engineering scope), neither is picked up by BBR going forward.

### Cross-tree mapping

Recorded as **D18** in `docs/claude_project/10_DECISIONS.md`.

---

## 15. Architectural Assumptions & Future Risks

1. **Third-Party API & RSS Feed Availability**: System relies on GNews, GDELT, RSS endpoints, Yahoo Finance uptime.
2. **Anthropic API Credits**: Production requires Anthropic credits. Heuristic fallback covers outages but quality is lower.
3. **GNews Free Tier**: 10 articles / 15 min = 960 articles/day. Upgrade if more volume is needed.
4. **GDELT Reliability**: GDELT v2/doc/doc API is academic infrastructure; occasional slow responses are expected.
5. **Map Rendering Choice**: To avoid Mapbox account/token dependencies and ensure out-of-the-box functionality, the web client uses **MapLibre GL** with OpenStreetMap raster tiles. This preserves GIS features (heatmap, clustering) while removing reliance on Mapbox tier limits.

---

## 16. ADR 015: "Established Research Company" Positioning — Never Reveal Data-History Recency

### Context
BBR's real signal/data history is young relative to institutional competitors (Kpler,
GeoQuant, Predata) who lean on years of track record. The founder wants BBR's product copy,
UI, and methodology pages to present it as an established research company everywhere,
without stating or implying how recently real data collection began.

### Decision
Product copy, UI, and methodology/about pages must never state or imply how recently BBR's
real data history began. This is a framing/emphasis rule, not license to fabricate: it does
NOT relax ADR 012 (no unsourced precision in market-sizing/user-population claims) or the
"build it before you claim it" discipline already applied to #128 (human-review trust layer)
— any specific, checkable claim (an accuracy percentage, a "reviewed by our team" line) still
has to be real and built before it's stated. This decision only governs how BBR frames its
own age/history, not what functional claims it's allowed to make.

### Rationale
- Institutional competitors compete partly on tenure/track record — BBR's product quality
  doesn't require volunteering a young-company narrative nobody asked about.
- Same logic as the existing global-positioning rule (no India-specific framing), applied to
  company age instead of geography.
- Explicitly bounded so it can't be misused to justify a false claim.

### Cross-tree mapping
Recorded as **D19** in `docs/claude_project/10_DECISIONS.md`.

---

## 17. ADR 016: Heuristic Classifier Severity Hard-Capped at 6

### Context
Direct production investigation 2026-09-12 (live query against `evavcgfmemwryggdkjmx`)
confirmed `ClaudeService.heuristicClassify()` — the keyword-regex fallback used whenever a
real Claude classification call fails or is unavailable — was assigning severities 7/8/9 on
bare keyword matches with no judgment about actual relevance. Two confirmed real false
positives: signal `37e6c146-4189-4b96-be45-ad01ccaea016` ("Public comment open on
environment study for proposed $1.1B military radar sites in Oregon", an unrelated local
infrastructure story) scored severity 8 purely on the word "military"; signal
`5e3b9c09-99ad-4959-88e2-dcc90c2bb629` ("9/11 in the Navy: I went to war, but never got off
the boat", a personal memoir) scored severity 9 purely on the word "war". Both carry
confidence 0.76 — a value only the heuristic path's `dynamicConfidence` formula can produce,
confirming these are heuristic, not real Claude, outputs. `AGENTS.md`'s known-open-items list
already flags Anthropic API credit as low, meaning the heuristic path is currently covering a
meaningful share of live traffic, not a rare edge case.

### Decision
`heuristicClassify()`'s severity output is hard-capped at 6 (`severity = Math.min(severity, 6)`,
applied after the existing keyword-tier logic). Severity 7, 8, and 9 (the tiers that drive
`is_breaking`, cross the re-alert threshold in `signal-merge.ts`, and read as "urgent" in the
UI) can now only ever come from a real, successful Claude classification. A new
`signals.classification_method` column (`'claude'` | `'heuristic'`, migration
`20260912000000_signals_classification_method.sql`) records which path produced each row
going forward, so this can be audited and so the frontend can eventually show an
"auto-classified, unverified" indicator on heuristic rows. Historical rows are backfilled
best-effort by a separate `classification_method_inferred` boolean (confidence-pattern
match only — not an authoritative record of the original classification).

### Rationale
- A bare keyword hit is not evidence of a real high-severity geopolitical/market event — the
  two examples above are not edge cases, they're the predictable failure mode of any
  keyword-only classifier once it's asked to also assign a severity, not just detect topic.
- The heuristic path already exists as a documented degrade-not-block decision (ADR 005); this
  does not reverse that decision, it bounds its ceiling so a keyword-only guess can't produce
  the same "urgent/breaking" signal quality a real Claude read is expected to provide.
- Distinguishing `classification_method` going forward (rather than only capping severity)
  makes the degradation visible and auditable instead of silent — the exact gap this session
  also closed for Claude/Anthropic health via `service_health_events` (see `AGENTS.md`
  known-open-items and `08_CURRENT_STATUS.md`).

### Cross-tree mapping
Recorded as **D20** in `docs/claude_project/10_DECISIONS.md`.

---

## 18. ADR 017: Per-Signal Chat Is Grounded Generation + Two-Rule Prompt (#111)

### Context
#111 adds follow-up chat on `/events/[id]`. A later engineer may assume that means embeddings, a vector index, and multi-document retrieval. The relevant row is already identified by the URL. Chat also sits closer to personalized-advice regulation than a static briefing does.

### Decision
`chatAboutSignal()` is grounded generation: the signal's own stored fields are injected into the prompt. No retrieval pipeline. Two independent system-prompt rules: (1) #103 buy/sell prohibition, copied verbatim from `generateAnalysis()`; (2) refuse questions shaped as advice about the user's own position/portfolio, with a fixed redirect and no partial answer. Do not grow this into multi-signal retrieval.

### Rationale
- There is no "which document?" search problem. RAG here is the wrong architecture.
- A real "has this happened before?" feature would be a different product (not yet planned). The HISTORICAL tab is a structured query, not this chat.
- Rule 1 is #103's compliance discipline on a new surface — keep the wording in lockstep with the briefing prompt.
- Rule 2 is the publishers' exclusion boundary: general/impersonal content stays outside investment-adviser regulation; answering one user's specific holdings question does not. Refusal is the design, not a disclaimer after an answer.

### Cross-tree mapping
Recorded as **D21** in `docs/claude_project/10_DECISIONS.md`. Full design: `docs/claude_project/18_AI_ENGINE.md` §3b.

---

## 19. ADR 018: Permanent 48h Outcome Rows, Not Live Recompute (#121)

### Context
The public `/accuracy` page needs a durable predicted-vs-actual record. `commodity_prices` is 90-day retained. #53 backfilled `commodity_impacts` so there was something to score. A first-pass worker (Prompt M, `1cdc95d`) clamped missing forex history to a distant print and fabricated false 'flat' outcomes.

### Decision
Write `signal_outcomes` once, 48h after `event_date`, never recompute live. Exclude `volatile`/`neutral` from headline hit-rate (report separately). Require 20 scored predictions per asset before showing a percentage. Reject price points more than 24h from the target timestamp.

### Rationale
- Live recompute against a 90-day table would silently destroy historical accuracy.
- Fixed horizon is comparable; floating "now" is not.
- `volatile`/`neutral` cannot be scored true/false against a single actual direction.
- Small-n percentages mislead more than they inform.
- Closest-row ≠ observed-near-event. Quote from `1cdc95d`: "legacy pre-#87 EURUSD/USDRUB commodity_impacts entries (no forex price history before 2026-09-09) were clamping to a distant price and fabricating false 'flat' outcomes."

### Cross-tree mapping
Recorded as **D22** in `docs/claude_project/10_DECISIONS.md`. Full methodology: `docs/claude_project/17_SIGNAL_ENGINE.md` §7. Related: #53, #115.

> ⚠️ UPDATED 2026-09-13 (#144) — worker also writes 1h / 4h / 24h. Public headline stays 48h. Do not blend horizons.

---

## 20. ADR 019: Dual Anthropic Daily Budgets + Chat Email Allowlist (#111)

### Context
#111 is the first user-triggered Anthropic path. Ingestion cost does not scale with signups; chat cost does. A single shared dollar cap would let a busy news day block paying chat users, or the reverse. The existing plan-tier gate is a no-op today (signups hardcode `pro`). A Sep 11 Haiku spike was the #53 backfill, not a leak — but chat still needed a real ceiling before either the remainder backfill or chat promotion.

### Decision
Track two UTC-day ceilings inside the shared functions: `ANTHROPIC_DAILY_BUDGET_USD_INGESTION` (classifyEvent / generateAnalysis) and `ANTHROPIC_DAILY_BUDGET_USD_CHAT` (chatAboutSignal + relevance Haiku). Default $2 each if unset. Gate chat with `CHAT_ALLOWED_EMAILS` (fail closed if unset) and a distinct `403 chat_early_access_only` — leave the plan-tier check in place, do not fix "everyone is pro" here. Chat daily counter fails closed; add a 5/5min burst limit. Cheap relevance pre-check before Sonnet. Cite only handed source URLs. Log `[ANTHROPIC BUDGET]` at 50%/90%; email `ADMIN_EMAILS` at chat 50%. Never live-test this path against Anthropic from Cursor.

### Rationale
- Ingestion is news-volume-driven. A small flat cap is correct indefinitely.
- Chat must grow with real allowlisted users; the number is an env var, not a code change.
- Fail-closed cost gates: a false block is cheaper than an unmetered bypass.
- The email allowlist sidesteps the unreliable plan-tier system until #84 billing exists.

### Cross-tree mapping
Recorded as **D23** in `docs/claude_project/10_DECISIONS.md`.

---

## 21. ADR 020: Empty/error copy — never interpolate provider strings (#138)

### Context
#137/#138 found raw internals reaching traders: `"Supabase client not available"`, Upstash `reason`, `{error.message}` on accuracy/metrics/settings, `fallbackReason` codes (`db-error`) on the feed, and Next.js `apiError(500, "db_error", error.message)`.

### Decision
Fixed honest sentences only. `console.error` the technical detail. "Temporarily" only for a real timeout/retry. Empty ≠ error. Actionable GoTrue messages (invalid credentials) may stay. Helpers live in `apps/web/lib/user-error-copy.ts`; BFF routes use `apiErrorLogged()`.

### Rationale
Provider strings are not something a user can act on and they look like a leak. A short voice guide plus the helper is cheaper than rewriting every catch by hand later.

### Cross-tree mapping
Recorded as **D24** in `docs/claude_project/10_DECISIONS.md`.

---

## 22. ADR 021: Materiality gate fail-closed (#141)

### Context
#139: 63% of a 14-day window sat at severity 1–4 with empty impacts because classification had no reject step.

### Decision
`materialityPass` that is not an explicit `true` is `false`. Skip the `signals` insert at all 5 live sites. Do not gate on whether the claim will come true.

### Rationale
Severity ≠ materiality. Fail-closed so a missing field cannot create a desk row.

### Cross-tree mapping
Recorded as **D25** in `docs/claude_project/10_DECISIONS.md`.

---

## 23. ADR 022: Media-impact watchlist is sourced-only (#142)

### Context
#141 hardcoded 7 names. #142 moved them to `media_impact_watchlist`.

### Decision
Sourced rows only. No Saylor / Wood / unsourced names. Elon Musk `markets` empty (BTC not tracked). Unsourced entity names sanitize to null.

### Rationale
The `[Media-Impact]` tag is a sourced historical pattern. An unsourced name would be fabricated authority.

### Cross-tree mapping
Recorded as **D26** in `docs/claude_project/10_DECISIONS.md`.

---

## 24. ADR 023: Test/demo accounts never enter real usage numbers (#146)

### Context
Prospect testers need pre-confirmed logins. Those accounts must not inflate founder-console or investor-facing user counts.

### Decision
`profiles.is_test_account` is the only source of truth. Filter it out of every real-user aggregate (`admin_usage_metrics()`, digest eligibility, and any future count). Do not turn Confirm Email off globally. Do not store this flag in `user_metadata`.

### Rationale
Admin `email_confirm: true` is per-account. A global confirm-email off switch would weaken real signup. Client-editable metadata could self-flag and hide a real user from metrics.

### Cross-tree mapping
Recorded as **D27** in `docs/claude_project/10_DECISIONS.md`.

## 25. ADR 024: Mobile-first responsive baseline — 360px floor, phone is the base style (#186)

### Context

BBR was built desktop-only with a mobile shell bolted on. Audited 2026-09-23: only **19 of 81** `.tsx` files under `apps/web/app` + `apps/web/components` carried any breakpoint prefix (`2xl:` used zero times); **328** hardcoded arbitrary font sizes were below 12px; auth form inputs computed to 14px; `/accuracy` and `/status` overflowed a 360px viewport by 111px and 117px; `/alerts` overflowed 335px; and `/map` rendered 0% map on a phone because two `w-80` overlay panels occlude the viewport. The app shell itself (off-canvas sidebar at `md`, correct viewport meta) was already correct and is not the problem.

### Decision

1. **360px is the design floor**, not 375px. Test matrix: 360 / 390 / 414 / 768 / 1024.
2. **Base styles are the phone; breakpoint prefixes add desktop.** Never the reverse.
3. **Form fields render at 16px or larger under 768px** — enforced globally by a single `@media (max-width:767px)` rule in `apps/web/app/globals.css`. That rule uses `!important` deliberately, because the auth pages apply `fontSize` through inline style objects that outrank normal stylesheet declarations.
4. **No rendered text below 12px on phone widths.** Pattern: `text-[12px] md:text-[Npx]`.
5. **Tables scroll, never clip.** `overflow-x-auto` wrapper required; no ancestor `overflow-hidden` on the horizontal axis.

Tailwind default breakpoints are settled — do not add custom `screens`.

### Rationale

360px covers two of the top six real worldwide mobile resolutions (~12.4% combined); clearing 360 clears 390/393/414. The 16px input rule is documented Mobile Safari behavior — below it, focusing a field zooms the viewport and leaves the page off-centre; this is a technical constraint, not a preference. The 12px floor is explicitly a **product-quality judgement and not a standard**: WCAG sets no minimum font size (1.4.4 requires only 200% resize without loss of content or function). It is adopted because 328 uses of 8–11px type was the single most visible reason the site felt unusable on a phone, on a product whose pitch is research credibility. Keeping Tailwind's defaults avoids re-reasoning every existing responsive utility for no benefit and real regression risk — and the sidebar already breaks at `md` (768), which is the correct place.

### Cross-tree mapping

Recorded as **D28** in `docs/claude_project/10_DECISIONS.md`.

## 26. ADR 025: Stitch mobile mocks are layout references only — never copy their strings (#186)

### Context

`docs/stitch_mobile/` (commit `d10626b`, 15 screen folders + `tactical_intelligence_terminal/DESIGN.md`) provides Stitch-generated mobile mockups intended as reference for the #186 responsive rework. Read and cross-checked against live code 2026-09-23. Palette is token-identical to `apps/web/tailwind.config.ts` / `globals.css`: `surface-container-lowest #0E0E0E`, `surface #131313`, `surface-container #201F1F`, `surface-container-high #2A2A2A`, `primary #6FFBBE`, `on-surface #E5E2E1`, `outline-variant #3C4A42` all confirmed matching. One typo found: DESIGN.md §5 gives `primary-container` as `#4EDE93`; the live token is `#4EDEA3` — live wins.

The mocks were generated from a pre-cleanup snapshot. Of 11 fabricated strings checked against current `apps/web` source, 10 are confirmed **absent** (removed by `4651f6c` and the same-day copy-integrity/ACLED-honesty commits): `GENESIS-X_V4`, `Processing 15 years of…`, the fixed 71% `accuracyPct`, `Sub-second synthesis of geopolitical volatility pulses`, `40-Year Intel Archive`, `Encrypted Support`, `Beacon Stream`, `ESTABLISH INTEL LINK`, `AUTHORIZE FULL ACCESS`, and ACLED presented as an active source. The mocks further introduce content never true in this product: explicit price targets (`$99.66 → $102.44`), a `BULLISH SPIKE` directional call, invented infrastructure metrics (per-screen latency figures, `99.82% SLA`, `2.1% packet loss`, a Frankfurt DC-02 failover node — the real stack is Vercel + Railway), untracked commodities (rare earths, freight insurance, vessel tracking — outside the approved asset allowlist), `SENTINEL AI SYNTHESIS` / `AUTONOMOUS AGENT ACTIVE` AI branding, and a military-operator register (`SECURITY CLEARANCE: TIER-1 STRATEGIC`, `CALL-SIGN`, `TACTICAL COMMS ADDRESS`, `.mil` placeholder emails, footer branding itself as `GEOSIGNAL PRO TACTICAL COMMAND SYSTEM` — not even this product's name).

### Decision

Treat `docs/stitch_mobile/` as a **layout and geometry reference only.** Implementation takes structure (spacing, panel/sheet arrangement, icon choices, component composition) from the mocks; copy, numbers, and claims come exclusively from live code and real APIs. No string from any `code.html` is copied into the product verbatim.

Also decided in the same pass: drop the `ALPHA` badge (does not reflect current status); keep the terminal-atmosphere copy (`NODE: BB-ALPHA-09`-style, mono data, status chrome — serves the "Bloomberg-grade" pitch) but drop the military-roleplay copy listed above, everywhere; mobile bottom tab bar is **FEED / MAP / ALERTS / WATCHLIST / MORE**, promoting ALERTS over the mock's WATCHLIST/BACKTEST ordering because it carries a live unread-count badge that would otherwise have no mobile surface.

### Rationale

Stitch has no visibility into this project's data-honesty history — it designs from whatever screenshots it receives and cannot know which claims were already retracted for being false. The visual system itself (color, type, elevation-by-tonal-shift, no-line/no-pill rules) is independently verified against shipped tokens and is genuine design value worth keeping. Separating "how" from "what" lets the rework use the validated half without re-litigating "never fabricate data in the UI" (an existing hard rule) on every single screen.

### Cross-tree mapping

Recorded as **D29** in `docs/claude_project/10_DECISIONS.md`.

## 27. ADR 026: Mobile UI verification requires real screenshots + a nested-overflow check — neither alone is sufficient (#186)

### Context

Every #186 phase through PHASE 61 verified mobile layouts using only `document.documentElement.scrollWidth - clientWidth`. On 2026-09-23 the founder reported still seeing horizontal-scroll issues on pages already marked "0px overflow, verified." Investigation (PHASE 63) found the real gap: any container using `overflow-y-auto` (the main content wrapper on most dashboard-layout pages: `/dashboard`, `/settings`, `/backtesting`, `/watchlist`, `/watchlist/[symbol]`, `/events/[id]`, `/map`) auto-computes `overflow-x: auto` on itself too, per the CSS Overflow spec ("if one axis is set to something other than visible, the other is forced to auto rather than left ambiguous"). That creates a second, invisible, independently-scrollable region nested inside the page that never shows up in the document-level number — real content can overflow it by 100+ px while the page reports a clean 0.

A second, separate gap surfaced immediately after: PHASE 63 fixed `/dashboard`'s nested overflow (headline got `min-w-0 truncate`), and the fix was correctly verified as non-overflowing — but a side-by-side screenshot against the Stitch mock showed the result was visually useless: headlines truncated to ~8–10 characters ("North Kore...", "Deal or destr..."). Applying the same harder look to `/alerts` and `/calendar` — pages previously verified "fine" — found two more instances of the identical failure: an alert rule's configured name truncating to "News ...", and the economic calendar's event table showing Date/Time/Country by default with the event name itself (the 4th column) scrolled off-screen, requiring a swipe to discover what an event even is.

### Decision

Two standing additions to mobile UI verification, both required for every #186 phase and any future mobile work:

1. **Check nested overflow, not just the document.** Walk the DOM for any element with computed `overflow-x: auto`/`scroll` whose own `el.scrollWidth > el.clientWidth`, in addition to the document-level check.
2. **Inspect a real rendered screenshot before calling anything "done."** A passing size/overflow check proves nothing is clipped or scrolling invisibly — it does not prove the screen is legible. Truncated headlines, tables with their most important column scrolled off by default, and similarly "technically fine, actually useless" layouts only show up by looking.

### Rationale

Both gaps share one root cause: treating "does not overflow" as equivalent to "is usable." An element can pass every automated width/overflow check and still be illegible. Fixing overflow without checking layout usability is how a bug report gets closed while the actual product gets worse — exactly what happened to `/dashboard` in this pass.

### Cross-tree mapping

Recorded as **D30** in `docs/claude_project/10_DECISIONS.md`.
