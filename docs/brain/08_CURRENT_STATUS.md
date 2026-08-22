# 08_CURRENT_STATUS.md — Repository Status & System Audit Matrix

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

Last updated: 2026-08-22 (QA-batch UI fixes — `0ed90c0`, `4146e48`, `58fde68` — see `14_CHANGELOG.md` v0.28.2)

---

## QA-Batch UI Fixes: Markdown Rendering, Error Leak, Status Copy (2026-08-22)

Four items from an external QA pass, worked as a batch:

- **Backtesting Region/Commodity dropdowns — re-verified, no regression.** The QA doc's premise (regressed to free text) didn't hold: `apps/web/app/(dashboard)/backtesting/page.tsx` still renders both as `<select>` sourced from `REGIONS`/`COMMODITIES` in `@blue-beacon-research/shared`, unchanged since a March 2026 refactor (current formatting last touched `a2ddaab4`, 2026-08-16). No code change made. **Real gap found in the process, still open**: `COMMODITIES` has `CORN` where `01_PRODUCT.md` §2.13 specifies `COPPER`, and `REGIONS` is missing the spec's "Global" option. Not fixed here — `COMMODITIES`/`REGIONS` are also consumed by `watchlist/WatchlistClient.tsx`, so this is a shared-constant change, not a single-page one.
- **Full Analyst Briefing rendered raw markdown as literal text** (`events/[id]/page.tsx`) — `signal.aiAnalysis` (an LLM completion that can contain `**bold**`, lists, etc.) was dropped into a plain `whitespace-pre-line` `<p>`. Fixed (`4146e48`) with `react-markdown` (new dep, `apps/web/package.json`), `allowedElements` restricted to paragraphs/bold/italic/lists — no `rehype-raw`, so raw HTML in the LLM output is never rendered, only shown as inert text.
- **Alert creation leaked the raw Postgres constraint name to the toast** (`alerts/page.tsx`) — `toast.error(err.message)` on a failed `alert_rules` insert surfaced `alert_rules_min_severity_check` verbatim. Confirmed the real constraint via direct query against the live DB (`CHECK (min_severity >= 1 AND min_severity <= 10)`, matches `000_init_schema.sql`). Fixed (`58fde68`): client-side range check before the insert, plus a fallback that swaps any Postgres check-constraint violation (code `23514`) for a generic message. **Same raw-error-to-toast pattern also exists in `events/[id]/page.tsx`'s own alert-creation catch block** (`toast.error(err?.message ...)`) — not fixed, out of scope for this pass, flagged for a follow-up.
- **`/status` mislabeled the map engine as "Mapbox GL"** — stack has been MapLibre GL since the map migration (see the 2026-08-15 "Map Markers" entry below); copy hadn't been updated. Fixed (`0ed90c0`), copy-only. Separately confirmed live: every "Operational" status and the "100% UPTIME" banner on `/status` is a hardcoded `SYSTEMS` constant with no real health check behind it — matches the already-deferred `claude/32_SERVICE_HEALTH_DASHBOARD_SPEC.md` scope, not touched here.
- **Live-verification note**: `/alerts` and `/events/[id]` are auth-gated (`middleware.ts` `PROTECTED`); a temp QA signup (`bluebeaconresearch+qa20260822@gmail.com`) hit real email confirmation (Resend SMTP is live, per the 2026-08-19 entry below) with no inbox access in this session, and both a direct `auth.users` write and an Admin-API `generate_link` call (the method the 2026-08-19 Phase-1 QA pass used successfully) were blocked by this session's sandbox permission layer. The unconfirmed test row was deleted both times, no residue left. Points 2 and 3 above are verified by code review + a clean `tsc --noEmit`/targeted lint pass only, not a live screenshot.

---

## Escalation Re-Alerts, Phase-1 Launch QA, Sonnet Temperature Bug (2026-08-19)

Committed as `4421205` (escalation re-alerts). The launch QA pass and the Sonnet fix it surfaced were never committed at time of writing. Full detail: `14_CHANGELOG.md` v0.28.0, `10_DECISIONS.md` ADR 010 addendum.

- **Escalation re-alerts shipped** (`4421205`, Prompt J.6) — founder decision: a signal that escalates past a real threshold should re-notify already-alerted users ("a trader who acted on a severity-5 signal needs to know it's now a 9"), gated so minor refinements (7→8) don't spam. Fires on new severity crossing >=7 for the first time, OR a jump of >=2 points in one update. Reuses `dispatchAlertsForSignal` (extended with an optional escalation-context param, default template byte-unchanged) rather than a parallel send path; distinctly labeled "UPDATED: severity X → Y" so it's never confusable with a first-time alert. Live-verified against real DB rows: small escalation → no re-alert; threshold-crossing escalation → exactly one re-alert with the distinct template; duplicate and new-signal paths confirmed unaffected.
- **Phase-1 launch readiness QA, done live against production** (`bluebeaconresearch.com`, real signup, real Resend send, real DB writes) — 5 of 7 checks passed cleanly: real signup → confirm-email click-through → session → `/onboarding` (verified via the Admin API's `generateLink`, not inbox-polling — same real token GoTrue would have emailed); onboarding tour fires on a fresh account; event detail page renders real live price-at-signal data (not a stub); alert rule creation works end-to-end from both the event page and the Alerts page, confirmed via direct DB read (not just UI); zero remaining "AI"-labeled UI copy across dashboard/event/alerts/watchlist.
- **Real finding from that QA pass: Sonnet briefings were completely broken despite funded credits.** See the "Claude AI Classifier" status row below for the full fix — this was the one genuine NO-GO blocker the pass found (a second item, Security Advisor, couldn't be checked at the time for lack of a token; checked afterward, see below).
- **Security Advisor checked after a Supabase MCP connection became available** — no CRITICAL/ERROR findings (the actual pre-launch gate). One real actionable WARN (leaked-password protection disabled, cheap dashboard fix, not yet done); the OTP-expiry WARN is the expected, already-documented consequence of the deliberate 24h extension from the earlier Auth UX Audit, not new; three "RLS enabled, no policy" INFOs are correct-by-design for service-role-only tables (`backtest_cache`, `raw_events`, `sanctions_entities`), not a gap.

---

## Cross-Source Signal Merge, Cost Audit, Railway Backend Sleep Fix, Anthropic Model/Key Fixes (2026-08-19)

All landed same-day as the entries below, committed as `8a775ea` (Railway), `b0a41a7` (model IDs + signal-merge feature + docs). Full detail: `14_CHANGELOG.md` v0.27.0, `10_DECISIONS.md` ADR 010.

- **Cost-scaling audit, done before funding real Anthropic credits for the first time.** Traced every call site of `ClaudeService.classifyEvent()`/`generateAnalysis()` across the whole repo. Confirmed: **no code path lets a user request trigger a Claude call** — every call originates from cron-scheduled ingestion, never from an `apps/web` route/page/button. This means Claude spend scales with news ingestion volume (fixed, cron-driven), not with signup count — a real, load-bearing architectural property worth having confirmed rather than assumed before spending money.
- **Real cost gap found by that audit, now fixed: cross-source duplicate classification.** GNews, GDELT, and RSS each build their own `external_id`, so the same real-world event covered by multiple sources produced multiple separate `signals` rows and multiple separate Sonnet briefing calls for what's really one event — confirmed live against real production data (120 exact-duplicate-text signal pairs found in a 500-row sample). Fixed via a new post-classification cross-source merge step — see ADR 010 in `10_DECISIONS.md` for the full design (classification itself is never skipped; only the Sonnet briefing call can be skipped, and only after independent classification confirms two articles describe the same event at the same or lower severity — a genuine escalation still updates severity and regenerates the briefing).
- **Retired Claude model IDs fixed.** `claude-3-5-haiku-20241022` (retired 2026-02-19) → `claude-haiku-4-5-20251001`; `claude-3-5-sonnet-20241022` (retired 2025-10-28) → `claude-sonnet-5`. Both had been non-functional on the Anthropic API for months — even once credits were funded, classification would have failed on a different error (model not found) instead of the billing error. Verified against live Anthropic docs, not just the prompt's claimed strings.
- **Anthropic key mismatch found and fixed** — see the "Claude AI Classifier" and "Anthropic API credit exhausted" rows below for detail.
- **Backend Railway service sleep risk fixed, mirroring the workers-service fix.** `apps/backend/railway.json` (the backend service's config, confirmed via `12_DEPLOYMENT.md`'s documented service→config mapping) was missing `sleepApplication: false` — Railway's own docs warn the *first* request to a slept service can `502`, not just add latency. Added the same override plus `restartPolicyType`/`restartPolicyMaxRetries`/`numReplicas` already used in `railway.workers.json`, healthcheck untouched. Low urgency today (founder-only traffic) but cheap insurance before real API customers or Telegram webhooks depend on first-hit reliability.

---

## Auth Flow Foundations, Confirmation Page & Enumeration-Safe Copy (2026-08-19)

Three commits (`05831e2`, `9113ff7`, `e8b9600`) plus one uncommitted change landed the same day as the Upstash pass above but were never written into this doc — backfilled here from the actual diffs, not memory. Full detail: `14_CHANGELOG.md` v0.25.0.

- **Password-recovery/signup-confirmation client pattern generalized, and a real sender/receiver mismatch fixed.** The PKCE-vs-implicit-flow issue was already noted below (Aug 18 entry) as "worked around with a page-scoped client" — `05831e2` found that workaround was incomplete: `forgot-password/page.tsx` (the *sender*, calling `resetPasswordForEmail`) was still using the shared PKCE client while `reset-password/page.tsx` (the *receiver*) expected implicit-flow hash tokens. Since GoTrue puts whichever flow type the *sending* client used into the email link, this was a real mismatch, not just an inconsistency — extracted into a shared `getSupabaseRecoveryClient()` (`lib/supabase-recovery.ts`) used by both ends. See ADR 009 below.
- **Signup confirmation landing page (`/confirm`) built for the first time** (`9113ff7`) — receiving end of the signup confirmation email link, using the same implicit-flow pattern generalized into a new `lib/supabase-email-auth.ts` client. Bridges the confirmed session into the shared cookie-based client so the very next request is recognized as authenticated (same pattern as the recovery auto-sign-in fix).
- **`resolvePostAuthRedirect()` added to `lib/profile.ts`** — single source of truth for post-auth destination (`/` if gated, `/onboarding`/`/dashboard` otherwise), now shared by login, password reset, and signup confirmation so the logic can't drift between callers.
- **Middleware gated-route allowlist widened**: `/verify`, `/confirm`, `/forgot-password`, `/reset-password` added — previously a pre-launch-gated visitor could get stuck unable to reach these routes at all.
- **`waitlist.user_id` FK changed from `ON DELETE SET NULL` to `ON DELETE CASCADE`** (`supabase/migrations/007_waitlist.sql`) — a `SET NULL`'d row survived user deletion and, since `email` is `UNIQUE`, permanently blocked that address from ever re-appearing in the waitlist (surfaced by a deleted test account failing re-signup with a confusing unrelated unique-constraint error).
- **Homepage nav now shows "Dashboard" instead of "Sign in"/"Start Free" for an already-logged-in visitor** (`apps/web/app/page.tsx`).
- **Auth Flow UX Audit** (`e8b9600`) — the CTO-directed pass covering bugs A–E and edge cases 1–8 (use_case migration gap, OAuth/signup post-launch-gate misrouting, "email not confirmed" dead-end on login, expired/reused confirm-link messaging, 24h OTP expiry). Full findings were reported in-session but never written here — see `14_CHANGELOG.md` v0.25.0 for the complete backfilled writeup, since it's substantial.
- **Confirmation screen copy made non-conditional, enumeration-safety re-verified live** (uncommitted at time of writing) — `VerifyClient.tsx`'s message changed to a single non-conditional string shown to every submitter regardless of whether the email was new or already registered; GoTrue's distinguishable anti-enumeration response (`identities: []` for an existing confirmed account) confirmed live via real Admin API calls to still never leak into the UI (`signup/page.tsx`'s redirect check only looks at `session`/`email_confirmed_at`, both falsy in both cases).
- **Not yet independently verified**: `SUPABASE_ACCESS_TOKEN`/Management API access was available in earlier sessions this cycle but is not present in this environment as of this pass — the live "Confirm Email" toggle state was instead verified by observed `signUp()` behavior (no session returned for a fresh signup ⇒ still ON), not by reading the config directly.

## Upstash Redis Quota Exhaustion — Root-Caused & Fixed (2026-08-19)

Upstash's 500,000-command quota was fully exhausted (`Usage: 500003`, confirmed live), causing a `ReplyError` storm severe enough that Railway started dropping its own log messages. Root cause was **three compounding sources**, not one — fixed all three rather than just raising the ceiling. Full detail: `14_CHANGELOG.md` v0.24.0.

1. **`@fastify/rate-limit` (`apps/backend/src/app.ts`) was Redis-backed and ran a Lua `eval`/`evalsha` on every single incoming backend request — including Railway's own unauthenticated `/health` probe.** This was almost certainly the single largest driver: constant, request-volume-scaling load with no relation to real users, and worse, when Redis failed, `@fastify/rate-limit` propagated the error instead of failing open, 500ing the *entire* API on every request until Redis recovered. Switched to the plugin's default in-memory store (correct today at Railway's `numReplicas: 1`; would under-count per-instance if this service is ever horizontally scaled — revisit then).
2. **Three BullMQ `Worker`s (`ai-classifier.ts`, `signal-generator.ts`, `alert-dispatcher.ts`) polled Redis continuously with nothing ever feeding them jobs** (per ADR 006, collectors classify+insert directly, bypassing BullMQ). Flat, constant cost regardless of user count. Gated behind `ENABLE_BULLMQ_WORKERS` (default off); dormant code preserved, not deleted.
3. **`apps/web/lib/ratelimit.ts`'s local fast-path had the logic backwards** — it only skipped the Upstash REST call once a key was *already over* its limit, so normal traffic (the common case) round-tripped to Upstash on every request. Inverted: now resolves entirely from local memory unless a key is near its limit or due for a periodic reconcile (every 10 requests or 5s per key) — sub-linear in request volume, not zero-Upstash (documented trade-off, see `10_DECISIONS.md`).

Also added: a bounded reconnect backoff + circuit breaker in the shared ioredis client (`apps/backend/src/clients/redis.ts`) so a sustained failure can't compound into a retry storm again, and a reactive quota-usage check piggybacked on the existing `workers:heartbeat` cron (logs a greppable `[REDIS QUOTA]` warning at 70%/90%, parsed from Upstash's own error string — true *proactive* percentage checks need `UPSTASH_API_KEY`/`UPSTASH_EMAIL` for Upstash's account-level Management API, not present in this project's env; founder action item if wanted).

**Rough post-fix command budget** (reasoned estimate from actual call patterns, not measured): fixed/cron cost ≈ **~1,000 Redis commands/day** at near-zero traffic (mostly price-syncer's Redis cache writes on the 15-min ingestion cron, ~768/day, plus pipeline-status bookkeeping, ~192/day). Per-active-user cost ≈ **~10–40 commands/day**, dominated by the web rate-limiter's periodic reconcile touches across `/api/signals`, `/api/prices`, `/api/prices/history`, `/api/backtesting` (a dashboard kept open and polling most of a day). At that rate, **the current 500K/day quota supports on the order of 10,000+ active users/day** before needing a plan upgrade — assuming per-user usage stays similar to the founder's own testing pattern (mostly dashboard polling, not heavy API-tier usage). Sanity-check this against real numbers once there's real traffic; this is a planning estimate, not a measurement.

## Reliability, Observability & DB Cleanup Pass (2026-08-18)

Sentry + PostHog wired on web (previously zero wiring despite installed deps); `error.tsx`/`global-error.tsx`/`(dashboard)/error.tsx` added; CI workflow added (`type-check` on push/PR, was empty); Supabase CLI scaffolded but not linked (needs interactive login — decision point);
> ⚠️ UPDATED 2026-08-19 — Now linked, via a Supabase Personal Access Token rather than interactive login. Management API works (used for Advisors); direct-Postgres CLI commands (`db push`, `migration list`) still fail with a permission error, cause not yet diagnosed — see `16_MIGRATION_CHECKLIST.md`.
dashboard stale-data banner wired, price staleness surfaced, two routes' DB-error states now distinct from empty/unconfigured, orphaned-`raw_events` reconciliation job added, pipeline zero-yield alerting added, cold-start signal-feed state distinguished; `production_schema.sql` deleted (was describing 4 of 17 real tables) and a new migration adds missing indexes + consolidates `user_channels` RLS + a duplicate-signal guard (**applied to live DB 2026-08-19, verified via Security/Performance Advisors + a live unique-constraint test — see `16_MIGRATION_CHECKLIST.md`**); shared `getRouteSupabaseClients()` + standardized API error shape replace 4x copy-pasted auth boilerplate; backend CORS now fails closed; backend's live-called `/v1/backtesting` had its fabricated-dates bug fixed to match the web version; onboarding brief (`docs/claude_project/21_PROJECT_BRIEFING.md`) corrected (wrong Supabase project ref, wrong port, stale migration count, stale Mapbox→MapLibre claim). Full detail: `14_CHANGELOG.md` v0.21.0.

## Alert Pipeline Actually Wired, Password Reset Built, Auth/Tailwind Fixes (2026-08-18, commit `97b7c4b`)

- **The alert pipeline had never fired a single notification, ever** — confirmed `alerts_sent` was 0 rows before this fix. Root cause: the real collectors classify+insert inline, bypassing the BullMQ queue whose consumer (`ai-classifier.ts`) was the only code that enqueued a dispatch job. Nothing fed that queue, so dispatch never triggered — a wiring gap upstream of credentials, not a config problem. Fixed: collectors now call `dispatchAlertsForSignal()` inline after every insert. Dormant BullMQ queue/worker kept in place (commented, not deleted) as a reserved future option. N+1 query pattern batched in the same pass. Full detail: `14_CHANGELOG.md` v0.20.0.
- **`/api/alerts/recent` no longer fabricates delivered alerts** from raw signals when `alerts_sent` is empty — returns honest empty state instead.
- **`/reset-password` built and verified live end-to-end** (was a dead-end route before today). Also fixed a deeper pre-existing bug this surfaced: the shared browser Supabase client can't process password-recovery links at all (hardcoded `flowType: "pkce"` vs. recovery's hash-token flow) — worked around with a page-scoped client, shared client untouched.
> ⚠️ UPDATED 2026-08-19 — That page-scoped workaround was incomplete: `forgot-password/page.tsx` (the sender) was still using the shared PKCE client while `reset-password/page.tsx` (the receiver) expected implicit-flow tokens, a real sender/receiver mismatch. Extracted into a shared `getSupabaseRecoveryClient()` (`lib/supabase-recovery.ts`) used by both ends — see the "Auth Flow Foundations" entry above and ADR 009 in `10_DECISIONS.md`.
- **Login/logout full-navigation bug fixed** (same family as the already-fixed signup bug) — `login/page.tsx` and a new shared `signOutAndRedirect()` helper.
- **Tailwind token fixes on 7 files** (SignalCard, SeverityBadge, CommodityChip, PriceTicker, Logo, forgot-password, verify) — broken classes compiling to nothing, fixed the default/low-severity card styling app-wide. Same bug pattern still present in `events/[id]/page.tsx`, `privacy/page.tsx`, and the shadcn `ui/*` primitives — not fixed yet, flagged below.
- **Still open, found but not fixed this pass**: `signal-generation` (severity ≥7 briefings) has the identical dormant-queue bug alert-dispatch just had.
> ⚠️ UPDATED 2026-08-19 — Fixed. Confirmed live before the fix that 0 of 423 severity≥7 signals had a populated `ai_analysis` field, ever. Fixed the same way as alert-dispatch: extracted `generateSignalAnalysis()`, wired inline into all three collectors (rss/gnews/gdelt) and the reconciliation worker, gated on `severity >= 7`. Verified live — now actually populates.

---

## RLS Remediation, GNews Constraint Fix, Signup Root-Cause Found (2026-08-17)

- **RLS now enabled on all 7 previously-exposed tables** (`sanctions_entities`, `raw_events`, `alerts_sent`, `backtest_cache`, `webhook_endpoints`, `webhook_deliveries`, `subscriptions`) — Security Advisor's "RLS Disabled in Public" criticals confirmed cleared. `handle_new_user()` hardened (pinned `search_path`, EXECUTE revoked from public/anon/authenticated). All already-RLS'd tables' policies now use the perf-recommended `(select auth.uid())` pattern.
- **Known follow-up**: Security Advisor now shows a new (lower-severity) "Multiple Permissive Policies" warning on `user_channels` — pre-existing redundant policies (4 overlapping names from migrations 003+006) preserved as-is per this task's scope; needs a founder decision on whether to consolidate.
- **GNews collector was silently losing every insert in production** — the constraint fix that was supposed to allow `source='gnews'` (migration 008, dated 2026-08-15) had never actually been applied to the live DB despite the changelog claiming otherwise. Re-applied and verified live; GNews ingestion should recover going forward.
- **Signup 400 "email address is invalid" — resolved, root cause was `Confirm email` + mailer coupling, not a code bug.** GoTrue rolls back the entire signup transaction if it can't send the confirmation email; the shared mailer's 2-emails/hour quota was chronically exhausted from testing, silently blocking all real signups regardless of email address validity. Founder turned off `Confirm email` (Authentication → Sign In/Providers → Email) — signups work immediately now, no code changes required.
- **Founder action still open**: configure custom SMTP (Resend) — needed again once `Confirm email` is re-enabled, and for password-reset emails today regardless.
> ⚠️ UPDATED 2026-08-19 — Done, and this supersedes the 2026-08-17 decision above. Custom SMTP is live: Resend domain `send.bluebeaconresearch.com` (status Verified, DNS via Cloudflare, region North Virginia/us-east-1), configured directly in Supabase Auth's dashboard (`/auth/smtp`) — a Supabase project setting, not an application env var; confirmed no app code calls Resend's API directly (`RESEND_API_KEY` isn't needed in Railway/Vercel for this flow). Independent proof it's genuinely active: Authentication → Rate Limits now shows 30 emails/hour, up from the shared-mailer default of 2/hour that caused this whole incident. With the root cause fixed, `Confirm email` is back **ON** — verified live: real signup → real email delivered (Resend logs: `POST /emails`, 200) → real click-through confirmation completed successfully. Separately, `VerifyClient.tsx`'s confirmation-screen copy was made non-conditional and the GoTrue enumeration difference (`identities: []` on existing accounts) was traced and confirmed to never reach the UI — see `14_CHANGELOG.md` v0.26.0 for full detail on both.

---

## First-Time User Onboarding: Dashboard Product Tour (2026-08-16)

- **New skippable 6-step `react-joyride` tour** (pinned to `2.9.3` — the `3.x` default install has a breaking-changed API) fires once for first-time users on `/dashboard`, then continues onto that user's featured event's detail page for the last 2 steps (alert action + sidebar nav), matching the "dashboard/single event page combination" scope.
- **New `profiles.product_tour_completed` column**, deliberately separate from the existing `onboarding_completed` (which gates the unrelated `/onboarding` wizard). Migration applied manually via Supabase SQL editor (no CLI/DB access from this environment) — confirmed applied before shipping, since the shared `fetchMyProfile()` query would otherwise 400 on the unknown column and break the *existing* login onboarding-gate too.
- **"Replay product tour"** added to the Help modal — resets the tour and navigates to `/dashboard` if needed, no full page reload.
- **Two bugs found and fixed during live Playwright verification** (not visible from code): (1) the auto-start effect re-triggered itself right after skip/finish, racing the async DB write and restarting the tour it just ended — fixed with a one-shot ref guard; (2) the event-page tour step mounted before the async signal fetch resolved, silently failing to find its target — fixed by polling for the DOM target before running.
- **Verified live**: fresh signup → auto-fires correctly with right copy/styling on all 6 steps (screenshotted each) → phase transition navigates to the correct real event → completion and skip both persist to the DB and survive reload → replay works from both the dashboard and another page.

---

## Security & Cost Follow-Up: Hardcoded Key + Shadow Ingestion Path (2026-08-16)

- **Hardcoded GNews key removed from source** — was a live-key fallback literal in `auto-ingest.ts`. **Resolved 2026-08-22**: key rotated at gnews.io, old value dead. Env var also standardized to `GNEWS_API_KEY` everywhere (was split across `NEWS_API_KEY`/`GNEWS_API_KEY`); `apps/backend/src/env.ts` now keeps `NEWS_API_KEY` only as a legacy fallback.
- **`auto-ingest.ts` deleted** — a second, independent ingestion path triggered from page loads on Vercel, separate from and undermining the Railway workers cron interval control added in v0.17.0. No documented rationale found for keeping it; workers are confirmed operational, so removed rather than hardened.
- **`/api/prices`, `/api/prices/history`, `/api/backtesting`** now rate-limited (previously had zero limit, unlike every other route) — verified live, 429s kick in correctly after 60 req/min.

---

## Auth Flow, GDELT Language Filter & Dropdown Consistency Fixes (2026-08-15)

- **Auth fixes, verified via Playwright**: email now persists between Login ↔ Signup (`?email=` param), login tab order fixed (Forgot-password link no longer interrupts Email→Password→Submit), signup redirect now uses `window.location.href` (was `router.push`, violating the SSR-cookie decision), resend-confirmation button has a 60s cooldown.
- **Two premises from the source prompt didn't hold up against live evidence**: no Gmail-only restriction exists in code (if real, it's a Supabase dashboard setting — founder action); the search bar was already correctly scoped to authenticated pages only (`TopBar` only lives in `(dashboard)/layout.tsx`), confirmed via Playwright on `/`, `/status`, `/login`, `/signup`.
- **Non-English signal titles root-caused to GDELT** — its global query had no language filter (GNews and RSS were already English-only). Fixed with `sourcelang:eng` + a per-article language check. Old non-English rows already in the DB aren't purged, and this only affects the deployed Railway worker once it redeploys — not confirmed live from this session.
- **Dropdown visual consistency**: all 7 `<select>` elements across Map, Watchlist, Backtesting, and Settings now share one Tailwind class constant (`SELECT_CLASSES`), kept as native selects (not swapped to the unused `components/ui/select.tsx`) to avoid risking existing filter behavior.
- **Map Live Intelligence** items now keep a persistent highlight after being clicked, not just on hover — verified live.
- **Watchlist**: added "Select All" to the commodity add-dropdown; fixed the `Math.random()` fake sparkline — now real recent `commodity_prices` history via a new `/api/prices/history` route.
- **Not verified**: Watchlist/Backtesting/Settings pages and authenticated Map states remain unverified visually — behind real Supabase auth, founder opted to skip credential sharing.

## Map Markers Were Completely Broken Since v0.13.0 — Now Fixed (2026-08-15)

- **Map has never shown a single marker**, in any state, since the original MapLibre setup — invisible from code review (no console errors, all layers/paint correctly configured, data valid). Only surfaced via live Playwright interaction + JS introspection of the actual MapLibre instance.
- **Root cause**: MapLibre's internal Web Worker (used for all GeoJSON source processing) silently fails to load under this app's Next.js/Turbopack bundling of the dynamic `import("maplibre-gl")` — worker URL resolves empty, construction fails with no thrown/logged error.
- **Fixed**: explicit `setWorkerUrl()` pointing at the CDN-hosted worker bundle (same pattern as the existing MapLibre CSS CDN workaround), applied both in `/map` and the event detail page's embedded map.
- **Now visually + interactively confirmed working**: markers render, clicking a signal eases the map to it with a working popup, severity filter genuinely narrows visible markers.
- **Takeaway**: this class of bug (silently-failing Worker, zero console signal) is exactly why UI-rendering claims need a real browser check, not just a clean build + code read.

## Recent Map, Watchlist & Backtesting Fixes (2026-08-15)

- **Map Filters Actually Work Now**: Fixed a `ref`/`useState` race between two competing effects that made severity/region/window filters appear to do nothing — both the map markers and the Live Intelligence stream list now share one filtered source of truth.
- **Map Coordinate Fallback Gap**: India (and ~45 other countries) were missing from the frontend's country-name fallback dictionary, causing known-country signals with no stored lat/lng to mis-pin at a generic Sahara centroid. Dictionary expanded. Root ingestion-side geocoding gap (raw_events/signals lat/lng not populated for RSS articles) is still open.
> ⚠️ UPDATED 2026-08-19 — Re-investigated and confirmed still not implemented, now explicitly deferred (not forgotten) by founder decision. `resolveGeoCoords()` (`apps/backend/src/lib/geo-resolver.ts`) uses hardcoded title keywords, a country-name lookup, and a 6-bucket region-centroid lookup with deterministic jitter — not a real geocoding API call. Confirmed via live DB query that RSS-sourced signals cluster tightly around region centroids, not real article locations. A real fix needs either a geocoding API call per article or a much larger gazetteer.
- **Fake Tension Index Number Removed**: "Global Tension Index" was showing a hardcoded 74.8/▲2.4 instead of the real computed score.
- **Watchlist Dead Globe Shell Removed**; unsupported `EURUSD`/`USDRUB` removed from the addable commodity list (were permanently stuck at flat 0.00%).
- **Backtesting Date Realism**: Mock results no longer show real-looking calendar dates for fabricated events — relabeled "Sample Case #N". Demo-mode disclaimer confirmed correct and unchanged.
- **Open**: Watchlist sparkline bars still use `Math.random()` per render (fabricated), not yet fixed — flagged for a future pass.
- **Verification caveat**: No browser/Playwright tool was available this session; fixes verified via build + direct API calls, not visual walkthrough.

## Recent Event Detail Page Rebuild & Alert Fix (2026-08-15)

- **Event Page Was Showing Wrong Signals**: Root cause of the empty "Projected Impact" box — `/events/[id]` fetched only the newest 20 signals and fell back to `signals[0]` when the requested ID wasn't in that batch. Fixed with a dedicated `/api/signals/[id]` route that fetches the exact signal.
- **Alert Creation Crash Fixed**: `alert_rules.name` NOT NULL violation on "Save Rule" — was happening in both the event page and Alerts page modals. Now auto-generated (e.g. "Middle East — Severity 5+").
- **Event Page Tabs Now Real**: HISTORICAL, MAP, and SOURCES tabs pull from the DB (`signals`, `raw_events`, `commodity_prices`) instead of showing placeholder content.
- **Price-at-Signal Added**: Event page now shows "{asset} was $X when this fired. Now: $Y (±Z%)" using existing `commodity_prices` data — no new API/AI dependency.
- **Verification Nodes Removed**: No real 3-part confidence model existed behind the three progress bars; replaced with one honest "Confirmed by N source(s)" line.
- **Terminology Sweep**: Removed "AI" labeling from 7 user-facing spots (event page, Alerts, Watchlist, HelpModal, landing page, dashboard sidebar) per the research-platform positioning rule.
- **Build Verification**: `pnpm build --filter web` passes with 0 errors.

## Recent System Stability & Reliability Fixes (2026-08-15)

- **SSE 401 Authentication Fix**: Resolved HTTP 401 stream disconnects in `apps/web/app/api/events/stream/route.ts` by allowing preview/dev connections and service role fallback, eliminating the persistent stream error loop.
- **SSE Primary & Exponential Backoff**: Enhanced `useSignalFeed.ts` with clean `1s → 2s → 4s` (up to `30s`) reconnect backoff and jittered polling fallback (`90s ±10s`) to prevent synchronized client request spikes.
- **Upstash REST Quota Optimization**: Added an in-memory process-level token bucket (`_localBuckets`) in `apps/web/lib/ratelimit.ts`. **Correction (2026-08-18)**: this claim was inaccurate — the local bucket only short-circuits the Upstash REST call once a key is *already over* its limit (`bucket.count > limit`); every request under the limit, i.e. essentially all normal traffic, still round-trips to Upstash on every single request. The actual savings only apply to a client that's already being rate-limited and hammering the endpoint past its cap — not a 95%+ reduction in the general case. The code isn't dangerous, just was described inaccurately. ⚠️ UPDATED 2026-08-19 — genuinely fixed as part of the Redis-quota-exhaustion root-cause pass: the logic is now inverted (local-first, periodic reconciliation against Upstash), not just re-described. See `14_CHANGELOG.md` v0.24.0 and `10_DECISIONS.md` ADR 008.
- **`RATE_LIMIT_SAFE_MODE` Feature Flag**: Implemented env flag support in `lib/ratelimit.ts` to bypass external REST checks gracefully during emergency quota pressure with loud console logging.
- **In-Memory Server Caching**: Added 60s server-side in-memory caching (`_cachedPrices`) to `/api/prices` to lower DB and Redis load from watchlist polling.
- **UI Chrome Audit Completed**: Executed comprehensive UI audit across all 8 page sections (A1–H5). All buttons, modals, dropdowns, scope tabs, filters, and drawers are fully functional with zero fake data.
- **Monorepo Build Status**: Turborepo build (`pnpm build --filter web`) passes with zero compilation or type-check errors.
  | :---------------------------------- | :------------------ | :------------------------------------------------------------------------ |
  | **Turborepo Monorepo Architecture** | ✅ Operational | Clean monorepo structure |
  | **Next.js 16 Web App (Vercel)** | ✅ Operational | `/api/signals` force-dynamic; needs `SUPABASE_SERVICE_ROLE_KEY` on Vercel |
  | **PostgreSQL Schema (Supabase)** | ✅ Operational | 9 migrations applied (including 009 event_date index) |
  > ⚠️ UPDATED 2026-08-19 — Stale count. Migrations now run 000–012; `012_reliability_indexes_and_cleanup.sql` was applied to the live DB 2026-08-19 and Advisor-verified (see top-of-file summary and `04_DATABASE.md` §4).
  | **Railway Workers (Cron)** | ✅ Operational | `sleepApplication: false`, heartbeat every 5m, collectors every 15m |
  | **Railway Backend (HTTP API)** | ✅ Operational | `api.bluebeaconresearch.com` healthcheck passing |
  | **RSS Real-Time Collector** | ⚠️ Partial | BBC, Al Jazeera, Guardian, NPR, UN News work; Reuters feed returns 404 |
  | **GNews Ingestion** | ⚠️ Degraded | Free tier — 1 query/run; mostly duplicates after initial ingest |
  | **GDELT Ingestion** | ⚠️ Degraded | HTTP 429 rate limits (GDELT is keyless, no auth tier exists); exponential backoff (60s/120s + jitter, 3 attempts) added 2026-08-22, replacing a flat 30s retry that often landed inside GDELT's own ~15min IP block window |
  | **Price Syncer (Yahoo Finance)** | ✅ Operational | 8 commodity prices every 15 min |
  | **Claude AI Classifier** | ⚠️ Degraded | Zero Anthropic credit — heuristic fallback active |
  > ⚠️ UPDATED 2026-08-19 — Two separate issues found and resolved, one billing-only issue remains. (1) Both model IDs were retired by Anthropic (`claude-3-5-haiku-20241022` retired 2026-02-19, `claude-3-5-sonnet-20241022` retired 2025-10-28) — updated to `claude-haiku-4-5-20251001` and `claude-sonnet-5`, verified against live Anthropic docs. (2) `.env.local` (repo root, the one `apps/backend` actually reads) held a stale/invalid key while `apps/web/.env.local` had the correct one — a real cross-file mismatch, not just a funding issue; synced, verified live (error changed from `401 authentication_error: "API key is invalid"` to `400 invalid_request_error: "Your credit balance is too low"` — same error Railway's workers service already showed, confirming the key now matches everywhere). Remaining blocker is purely billing — see `14_CHANGELOG.md` v0.27.0.
  > ⚠️ UPDATED 2026-08-19 (later same day) — **Status upgraded: ✅ Operational.** Credits were funded ($5). Live Phase-1 launch QA (real signup, real API calls, not a code read) confirmed Haiku classification is genuinely live and high-quality — real `"type":"message"` response, real token usage, real AI-written summary, not the heuristic template. That same QA pass found Sonnet briefings were still 100% failing despite funded credits: `400 invalid_request_error: "temperature is deprecated for this model"` — `claude-sonnet-5` rejects the `temperature` param `generateAnalysis()` was still sending, so every severity≥7 signal silently fell through to the generic fallback text. Fixed by removing `temperature` from the one `claude-sonnet-5` call site (grepped the whole backend, confirmed only one exists); re-verified live with a real, clearly non-templated multi-paragraph briefing. **Not yet committed** — sitting in the working tree, same as any other change this session, for manual review/commit. Full detail: `14_CHANGELOG.md` v0.28.0.
  | **Heuristic Fallback Classifier** | ✅ Operational | Dynamic confidence scoring (55%–90%) + word-boundary filtering |
  | **Upstash Redis / BullMQ** | ✅ Operational | Fixed `rediss://` TLS protocol |
  | **Interactive UI Controls** | ✅ 100% Operational | All buttons, filters, modals, FABs, and CSV downloads active |
  | **Multi-Channel Alert Dispatch (Telegram/Slack/Webhook/Push)** | ⚠️ Partial | Trigger wiring fixed 2026-08-18 (commit `97b7c4b`) — fires inline on every signal insert, live-verified against a real signal. No real Telegram/Slack destinations configured to confirm live delivery; Telegram additionally blocked on missing `TELEGRAM_BOT_TOKEN`. `signal-generation` (severity ≥7 briefings) has the same still-unfixed dormant-queue gap. |
  > ⚠️ UPDATED 2026-08-19 — `signal-generation` was fixed 2026-08-19 (inline `generateSignalAnalysis()` call, same pattern as alert-dispatch), no longer an open gap.

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
| Backend service (`api.bluebeaconresearch.com`) same sleep risk | Fixed (2026-08-19) | Mirrored the fix into `railway.json`: added `sleepApplication: false`, `restartPolicyType: ON_FAILURE`, `restartPolicyMaxRetries: 10`, `numReplicas: 1`. Low urgency pre-launch (founder-only traffic) but the failure mode is a real `502` on first request after 10 min idle, not just latency — cheap to close before real API customers or Telegram webhooks depend on it. Healthcheck path/settings untouched. Live "stayed Active after 10+ min idle" confirmation is a post-deploy follow-up, not verifiable synchronously. |
| Wrong start command on workers service | Fixed     | `railway.workers.json` → `pnpm run start:workers`                |
| UI timestamps look stale vs ingestion  | Explained | By design — shows `event_date`, not `created_at`                 |
| Reuters RSS feed 404 on Railway        | Open      | `reutersagency.com` feed URL returns 404; other feeds compensate |
| GDELT HTTP 429 rate limiting           | Open      | Exponential backoff added 2026-08-22 (60s/120s+jitter, 3 attempts); still open since GDELT offers no way to eliminate 429s outright (keyless, no paid tier) — may still fail during sustained blocks |
| GNews free tier quota                  | Open      | 1 query/run; mostly returns duplicates after initial ingest      |
| Anthropic API credit exhausted         | High      | Heuristic fallback active                                        |
| ⚠️ UPDATED 2026-08-19 | Narrowed | Retired model IDs fixed + key mismatch fixed (see Claude AI Classifier row above) — remaining blocker is purely funding the account, not a code/config problem anymore. |
| ⚠️ UPDATED 2026-08-19 (later) | Resolved | Credits funded, Haiku confirmed live via real QA. Sonnet briefings were still broken (`temperature` param rejected by `claude-sonnet-5`) — fixed, verified live, not yet committed. See Claude AI Classifier row above and `14_CHANGELOG.md` v0.28.0. |
| Sonnet briefings failing on every severity≥7 signal (`temperature` param) | Fixed (2026-08-19, uncommitted) | `claude-sonnet-5` rejects `temperature` — removed from the one call site in `claude.service.ts`; real non-templated briefing confirmed live |
| Security Advisor — no CRITICAL findings, one real actionable WARN | Checked 2026-08-19 | Leaked-password protection disabled (Auth) — cheap fix, not yet done. OTP-expiry WARN is the expected result of the deliberate 24h extension (Bug E, already documented). Three "RLS enabled, no policy" INFOs on `backtest_cache`/`raw_events`/`sanctions_entities` are correct-by-design (service-role-only tables) |
| ACLED collector requires credentials   | Open      | Set `ACLED_EMAIL` + `ACLED_PASSWORD` in Railway                  |
| `SUPABASE_SERVICE_ROLE_KEY` on Vercel  | Open      | Required for reliable `/api/signals` server reads                |
| Alert dispatch never triggered (any channel) | Fixed (2026-08-18, `97b7c4b`) | Was a wiring gap upstream of credentials, not a config problem — see v0.20.0 in `14_CHANGELOG.md` |
| Telegram alerts not working            | Open (narrowed) | Wiring fixed 2026-08-18; blocker now is only `TELEGRAM_BOT_TOKEN` not set in Railway |
| Password reset dead-end route          | Fixed (2026-08-18, `97b7c4b`) | `/reset-password` built and live-verified end-to-end |
| `signal-generation` queue never triggered (severity ≥7 briefings) | Open | Same dormant-queue root cause as alert-dispatch had; found 2026-08-18, not yet fixed |
| ⚠️ UPDATED 2026-08-19 | Fixed | The row above is stale — fixed 2026-08-19 via inline `generateSignalAnalysis()` call in all three collectors + reconciliation worker, verified live |
| Broken Tailwind tokens in shadcn `ui/*` primitives (button, badge, card, dropdown-menu, select, separator) | Open | Different, deeper issue than the 7-file rename fixed 2026-08-18 — needs a `@theme`/CSS-variable mapping, not a rename |
| Broken Tailwind tokens in `events/[id]/page.tsx`, `privacy/page.tsx` | Open | Same broken-token pattern as the 7 files fixed 2026-08-18, just not in the named scope of that pass |
| `COMMODITIES`/`REGIONS` don't match `01_PRODUCT.md` §2.13 (`CORN` vs spec's `COPPER`; `REGIONS` missing "Global") | Open (2026-08-22) | Shared constant (`packages/shared`), also used by `watchlist/WatchlistClient.tsx` — needs a decision on blast radius before fixing, not done in the 2026-08-22 QA-batch pass |
| Raw Postgres error surfaced in `events/[id]/page.tsx` alert-creation catch block | Open (2026-08-22) | Same pattern fixed in `alerts/page.tsx` (`58fde68`) but not mirrored here — flagged, not fixed, in the 2026-08-22 QA-batch pass |

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
