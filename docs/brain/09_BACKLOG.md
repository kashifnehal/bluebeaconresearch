# 09_BACKLOG.md — Product Backlog & Engineering Roadmap

> **📍 Doc status — historical P0–P3 list.** Live tickets: `docs/claude_project/09_BACKLOG.md`. `claude/23_TODO.md` is not in this repo.

> ⚠️ UPDATED 2026-10-16 — Feed quiet-gap alarm after a pause (`apps/backend`, `e572d62`). Silence starts at the later of last_seen and the resume check. A degraded row waits for two quiet checks.

> ⚠️ UPDATED 2026-10-15 — Eight region ids (`fc9113c`) and the region backfill script (`320453f`). `signals.region_raw` is written and not applied. `--apply` was not run.

> ⚠️ UPDATED 2026-10-15 — Collection gaps. 2026-10-11 08:00 UTC to 2026-10-14 07:30 UTC: no signals were created because the Anthropic Console monthly limit was reached; collection stored 96 rows a day; articles not stored in that window were not recovered. 2026-10-14: the $2 daily ingestion cap was reached at 12:31 UTC; collection pauses until 00:00 UTC; the dashboard and status page say so.

> ⚠️ UPDATED 2026-10-15 — Status check retry and cached homepage count (`apps/web`, `cdcccdd`). A slow database no longer drops the homepage total or leaves a timed-out check as Unknown without a retry.

> ⚠️ UPDATED 2026-10-15 — Share card (`apps/web`, `709827a`). Root metadata points at the www host for Open Graph and Twitter.

> ⚠️ UPDATED 2026-10-15 — Signup source without a cookie (`apps/web`, `9da1540`). Campaign tags and an external referrer host are saved on email signup.

> ⚠️ UPDATED 2026-10-15 — Singular count-line wording recorded (docs only, `04af752`). The wording shipped in `2c977d8`.

> ⚠️ UPDATED 2026-10-15 — Safety commits merged (`2c1406c`). Merge only.

> ⚠️ UPDATED 2026-10-15 — Materiality-gate health row (`apps/backend`, `3339434`). `service_health_events.raw_event_id` is written and not applied.

> ⚠️ UPDATED 2026-10-15 — Claude signals with no event category (`apps/backend`, `06d420d`). A missing category is guarded. A day with no Claude rows stays ok.

> ⚠️ UPDATED 2026-10-15 — Weekly materiality-gate counts (`apps/backend`, `34a5ca2`). No pass-rate target.

> ⚠️ UPDATED 2026-10-15 — RSS quiet-gap alarm (`apps/backend`, `5a04fcb`). View `public.feed_gap_p95` is written and not applied.

> ⚠️ UPDATED 2026-10-15 — Digest deferred window (`apps/backend`, `789d422`). Deferred digest signals must be created within 24 hours.

> ⚠️ UPDATED 2026-10-15 — Monthly Anthropic spend warning (`apps/backend`, `24b92ce`). Idle unless `ANTHROPIC_MONTHLY_LIMIT_USD` is set.

> ⚠️ UPDATED 2026-10-14 — Off-by-default retrieval terms (`apps/backend`, `32872dc`). `T2_PAIR_RULE`, `GNEWS_T2_QUERY`, and `GDELT_T2_QUERY` default off.

> ⚠️ UPDATED 2026-10-14 — Diagnostic tables and drop logging (`apps/backend`, `4cc10c2`). The two public diagnostic tables were applied 2026-10-14. GNews and GDELT log relevance drops. `GATE_SHADOW_ENABLED` stays off.

> ⚠️ UPDATED 2026-10-07 — the 2026-10-06 ships are recorded with their commits in the canonical backlog: `0c9b4b6`, `c468485`, `cf0711f`, `41c19ce`, `5707819`, `c0e1f60`, `a186404` (723 outcome rows written on 2026-10-06), `e51bb1e`, `6a88053`, `b4b52f1` (view `feed_yield_daily`, not applied), `48f77ce` (GDELT DOC list frozen 2026-10-05 12:00 to 2026-10-06 07:00 UTC, recovered at 10:00 UTC), `7438ec9`. GDELT `maxrecords` is 250 (`3d5e244`, 2026-09-26). A GDELT HTTP 429 gets one retry then stops (`e677efc`, 2026-09-06). Merge threshold is 0.33 on summaries since 2026-09-25 (`d67ae2b`).

This document outlines prioritized tasks, technical debt resolution, feature enhancements, and future milestones for Blue Beacon Research.

> ⚠️ UPDATED 2026-08-19 — Per `00_PROJECT.md`'s "Future Scope" framing, this entire backlog is future/deferred roadmap content, not a currently-open active work queue.

---

## 1. Critical Priority (P0 — Blockers for v1.0 Launch)

- [ ] **Stripe Self-Serve Billing**: Implement Stripe Webhook handler (`POST /api/billing/webhook`) to handle subscription upgrades/cancellations and update Supabase `profiles.plan_tier`.
- [ ] **Production Environment Variable Audit**: Ensure production deployment scripts validate all required keys via `apps/backend/src/env.ts`.
- [ ] **Worker Memory Leak Monitoring**: Add process health metrics to BullMQ workers (`workers.ts`) to monitor long-running memory usage.

---

## 2. High Priority (P1 — Core Experience & Reliability)

- [ ] **Sub-100ms WebSocket Signal Feed**: Replace REST polling on `/dashboard` with persistent Supabase Realtime / WebSocket stream.
- [ ] **Map Layer Toggles (MapLibre)**: Add maritime shipping straits (Hormuz, Bab-el-Mandeb, Malacca, Suez) overlay and crude oil pipeline maps to `/map` using MapLibre-compatible vector/raster layers.
- [ ] **Multi-Model AI Cross-Verification**: Implement parallel classification using OpenAI o3-mini alongside Claude 3.5 Sonnet to verify high-severity signals ($\ge 9$).

---

## 3. Medium Priority (P2 — Institutional Features)

- [ ] **PDF/CSV Backtest Report Exporter**: Generate downloadable PDF executive backtest summaries with equity curves and drawdowns.
- [ ] **Audio Alert Trigger**: Add web browser audio alert chime when breaking severity 9+ signals arrive.
- [ ] **SAML / SSO Enterprise Authentication**: Integrate SAML 2.0 / Okta for enterprise tier users.

---

## 4. Low Priority & Technical Debt (P3)

- [ ] **Upgrade Tailwind CSS Config**: Streamline legacy custom color variables in `apps/web/tailwind.config.ts`.
- [ ] **Unit & Integration Test Suite**: Expand Vitest / Jest coverage across Fastify routes and BullMQ worker queue handlers.
- [ ] **OpenAPI Spec Auto-Generation**: Do **not** auto-publish Swagger UI to a public `/docs` portal. Confirmed 2026-09-19: production `/docs` was already live and unauthenticated; closed by registering Swagger only in `development`/`test`. A future authenticated developer portal is a separate founder decision.
