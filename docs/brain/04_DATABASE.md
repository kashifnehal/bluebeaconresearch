# 04_DATABASE.md — PostgreSQL Database Schema & Migration Architecture

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

This document provides a comprehensive specification of the Supabase PostgreSQL database schema, table structures, Row Level Security (RLS) policies, foreign key relationships, performance indexes, constraint enums, and sequential migrations.

---

## 1. Relational Entity-Relationship Diagram (ERD)

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  auth.users     │       │   raw_events    │       │commodity_prices │
└────────┬────────┘       └────────┬────────┘       └─────────────────┘
         │ 1:1                     │ 1:N
         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│    profiles     ├──────►│     signals     │       │ backtest_cache  │
└────┬──┬──┬──┬───┘       └────┬──┬──┬──┬───┘       └─────────────────┘
     │  │  │  │                │  │  │  │
     │  │  │  └──────────┐     │  │  │  └─────────────────┐
     │  │  └───────┐     │     │  │  └───────────┐     │
     ▼  ▼          ▼     ▼     ▼  ▼              ▼     ▼
┌──────────────┐ ┌───────────┐ ┌──────────────┐ ┌───────────────┐
│ alert_rules  │ │  api_keys │ │ alerts_sent  │ │webhook_deliver│
└──────┬───────┘ └───────────┘ └──────────────┘ └───────────────┘
       │ 1:N
       ▼
┌──────────────┐
│user_channels │
└──────────────┘
```

---

## 2. Comprehensive Table Definitions

> **📍 Regenerated 2026-08-27 directly from the live database** (`information_schema.columns` + `pg_constraint` against project `evavcgfmemwryggdkjmx`), not hand-maintained. The previous version of this section documented 8 of the 17 real public tables and had drifted from the live schema in several places — see the "Known drift corrected" note at the end of this section for exactly what was wrong, since some of those wrong values may have been copied into other docs.
>
> All 17 public tables are listed below. Regenerate this section the same way after any migration rather than editing entries by hand.

### Table 1: `profiles`
Extends `auth.users(id)` with billing tier and user settings.
- `id` (`uuid`, PK, FK `auth.users.id` ON DELETE CASCADE)
- `full_name` (`text`, nullable)
- `avatar_url` (`text`, nullable)
- `plan_tier` (`text`, NOT NULL, default `'free'`, check: `free`, `analyst`, `pro`, `api`)
- `stripe_customer_id` (`text`, nullable)
- `onboarding_completed` (`boolean`, NOT NULL, default `false`)
- `push_tokens` (`text[]`, NOT NULL, default `'{}'`)
- `created_at` / `updated_at` (`timestamptz`, NOT NULL, default `now()`)
- `product_tour_completed` (`boolean`, NOT NULL, default `false`) — added by `010_add_product_tour_flag.sql`; deliberately separate from `onboarding_completed`, which gates the unrelated `/onboarding` wizard

### Table 2: `signals`
Stores LLM-synthesized geopolitical intelligence and asset impact data.
- `id` (`uuid`, PK, default `uuid_generate_v4()`)
- `raw_event_ids` (`uuid[]`, NOT NULL, default `'{}'`)
- `title` (`text`, NOT NULL)
- `summary` (`text`, NOT NULL)
- `ai_analysis` (`text`, nullable) — severity ≥7 Sonnet briefing, populated by `generateSignalAnalysis()`
- `severity` (`int`, NOT NULL, check `1 <= severity <= 10`)
- `confidence` (`double precision`, NOT NULL, check `0 <= confidence <= 1`)
- `event_type` (`text`, nullable)
- `country` / `region` (`text`, nullable)
- `lat` / `lng` (`double precision`, nullable)
- `sources_count` (`int`, NOT NULL, default `1`)
- `commodity_impacts` (`jsonb`, NOT NULL, default `'[]'::jsonb`) — array of `{asset, ...}`; `asset` holds ticker symbols (`USOIL`, `UKOIL`, `XAUUSD`, `NGAS`, `WHEAT`, `CORN`, …), not display names
- `sanctions_matches` (`jsonb`, NOT NULL, default `'[]'::jsonb`)
- `shipping_proximity` (`jsonb`, nullable)
- `is_breaking` (`boolean`, NOT NULL, default `false`)
- `is_active` (`boolean`, NOT NULL, default `true`)
- `created_at` / `updated_at` (`timestamptz`, NOT NULL, default `now()`)
- `event_date` (`timestamptz`, nullable) — source article publish time; this, not `created_at`, is what the feed renders as "X hours ago"

### Table 3: `raw_events`
Ingested news articles and incident logs before classification.
- `id` (`uuid`, PK, default `uuid_generate_v4()`)
- `source` (`text`, NOT NULL, check: `gdelt`, `acled`, `newsapi`, `gnews`, `manual`) — live constraint value, verified 2026-08-27; `gnews` was added by `008_fix_source_constraint.sql`.
  > **Collector-vs-constraint note (observed 2026-08-27, not changed):** the allowed set has five values but only two are ever written. Live row counts are `gdelt` 1895 / `newsapi` 323, and nothing else. `rss-collector.ts:102` writes `source: "newsapi"`, and `gnews-collector.ts:81` *also* writes `source: "newsapi"` with the comment `// DB constraint allows: gdelt, acled, newsapi — gnews maps to newsapi` — a comment that predates `008_fix_source_constraint.sql` having added `gnews` for exactly this purpose. So the `gnews` value the migration went to some trouble to allow is still unused, and RSS and GNews articles are currently indistinguishable by `source` in the DB. Not changed here: `source` is half of the `UNIQUE(source, external_id)` dedup key, so relabelling GNews rows would change dedup behavior and re-admit already-ingested articles. Flagged for a deliberate decision, not a silent fix. `acled` is unused pending credentials; `manual` is unused.
- `external_id` (`text`, nullable)
- `title` / `summary` / `country` (`text`, nullable)
- `lat` / `lng` (`double precision`, nullable)
- `event_type` (`text`, nullable)
- `event_date` (`timestamptz`, nullable)
- `raw_data` (`jsonb`, NOT NULL, default `'{}'::jsonb`)
- `created_at` / `updated_at` (`timestamptz`, NOT NULL, default `now()`)
- **Unique Constraint**: `UNIQUE(source, external_id)` — the dedup key every collector checks

### Table 4: `commodity_prices`
- `id` (`uuid`, PK, default `uuid_generate_v4()`)
- `symbol` (`text`, NOT NULL)
- `price` / `change_24h` / `change_pct_24h` / `high_24h` / `low_24h` (`double precision`, nullable)
- `fetched_at` (`timestamptz`, NOT NULL, default `now()`)
- `created_at` (`timestamptz`, NOT NULL, default `now()`)
- **Unique Constraint**: `UNIQUE(symbol, fetched_at)`

### Table 5: `alert_rules`
- `id` (`uuid`, PK, default `uuid_generate_v4()`)
- `user_id` (`uuid`, NOT NULL, FK `profiles.id` ON DELETE CASCADE)
- `name` (`text`, NOT NULL) — auto-generated by the UI (e.g. "Middle East — Severity 5+")
- `regions` / `commodities` (`text[]`, NOT NULL, default `'{}'`)
- `min_severity` (`int`, NOT NULL, default `8`, check `1 <= min_severity <= 10`)
- `channels` (`text[]`, NOT NULL, default `'{email}'`)
- `frequency` (`text`, NOT NULL, default `'immediate'`, check: `immediate`, `hourly`, `daily`)
- `is_active` (`boolean`, NOT NULL, default `true`)
- `created_at` / `updated_at` (`timestamptz`, NOT NULL, default `now()`)
- `last_triggered_at` (`timestamptz`, nullable)

### Table 6: `user_channels`
- `user_id` (`uuid`, PK, FK `profiles.id` ON DELETE CASCADE)
- `telegram_chat_id` (`text`, nullable)
- `telegram_connected_at` (`timestamptz`, nullable)
- `slack_webhook_url` (`text`, nullable)
- `slack_connected_at` (`timestamptz`, nullable)
- `created_at` / `updated_at` (`timestamptz`, NOT NULL, default `now()`)
- **RLS**: exactly one policy, `user_channels_all_own` (`ALL`) — consolidated from 4 overlapping policies by `012_reliability_indexes_and_cleanup.sql`; verified live 2026-08-27

### Table 7: `alerts_sent`
One row per alert actually dispatched. Written by `alert-dispatcher.ts`.
- `id` (`uuid`, PK, default `uuid_generate_v4()`)
- `user_id` (`uuid`, NOT NULL) / `rule_id` (`uuid`, nullable) / `signal_id` (`uuid`, NOT NULL)
- `channel` (`text`, nullable)
- `status` (`text`, NOT NULL, default `'queued'`, check: `queued`, `delivered`, `failed`) — `NotificationPanel.tsx` renders all three distinctly; a queued/failed row must never look delivered
- `delivered_at` (`timestamptz`, nullable)
- `outcome_direction` (`text`, nullable) / `outcome_price_change` (`double precision`, nullable)
- `created_at` (`timestamptz`, NOT NULL, default `now()`)

### Table 8: `api_keys`
Institutional developer API credentials.
- `id` (`uuid`, PK) / `user_id` (`uuid`, NOT NULL)
- `name` (`text`, nullable)
- `key_hash` (`text`, NOT NULL, **UNIQUE**) / `key_prefix` (`text`, NOT NULL)
- `last_used_at` (`timestamptz`, nullable) / `call_count` (`int`, NOT NULL, default `0`)
- `is_active` (`boolean`, NOT NULL, default `true`)
- `created_at` (`timestamptz`, NOT NULL, default `now()`)

### Table 9: `webhook_endpoints`
- `id` (`uuid`, PK) / `user_id` (`uuid`, NOT NULL)
- `url` (`text`, NOT NULL) / `name` (`text`, nullable)
- `filters` (`jsonb`, NOT NULL, default `'{}'::jsonb`)
- `is_active` (`boolean`, NOT NULL, default `true`)
- `last_success_at` (`timestamptz`, nullable)
- `created_at` (`timestamptz`, NOT NULL, default `now()`)

### Table 10: `webhook_deliveries`
- `id` (`uuid`, PK) / `endpoint_id` (`uuid`, NOT NULL) / `signal_id` (`uuid`, NOT NULL)
- `payload` (`jsonb`, NOT NULL)
- `status_code` (`int`, nullable) / `response_body` (`text`, nullable)
- `attempt_count` (`int`, NOT NULL, default `1`)
- `delivered_at` (`timestamptz`, nullable) / `created_at` (`timestamptz`, NOT NULL, default `now()`)

### Table 11: `user_preferences`
Per-user feed and notification settings, distinct from `profiles` (account/billing).
- `id` (`uuid`, PK) / `user_id` (`uuid`, NOT NULL, **UNIQUE**)
- `regions` / `commodities` (`text[]`, NOT NULL, default `'{}'`)
- `min_severity` (`int`, NOT NULL, default `7`, check `1..10`)
- `timezone` (`text`, NOT NULL, default `'UTC'`)
- `quiet_start` / `quiet_end` (`time`, nullable)
- `theme` (`text`, NOT NULL, default `'dark'`, check: `dark`, `light`, `system`)
- `email_frequency` (`text`, NOT NULL, default `'immediate'`, check: `immediate`, `hourly`, `daily`)
- `use_case` (`text`, nullable) — added by `006_onboarding_schema_fix.sql`
- `updated_at` (`timestamptz`, NOT NULL, default `now()`)

### Table 12: `watchlist_entries`
- `id` (`uuid`, PK) / `user_id` (`uuid`, NOT NULL)
- `symbol` (`text`, NOT NULL)
- `alert_enabled` (`boolean`, NOT NULL, default `false`)
- `created_at` (`timestamptz`, NOT NULL, default `now()`)
- **Unique Constraint**: `UNIQUE(user_id, symbol)`

### Table 13: `saved_signals`
- `id` (`uuid`, PK) / `user_id` (`uuid`, NOT NULL) / `signal_id` (`uuid`, NOT NULL)
- `note` (`text`, nullable) / `created_at` (`timestamptz`, NOT NULL, default `now()`)
- **Unique Constraint**: `UNIQUE(user_id, signal_id)`

### Table 14: `subscriptions`
- `id` (`uuid`, PK) / `user_id` (`uuid`, NOT NULL)
- `stripe_subscription_id` (`text`, nullable, **UNIQUE**) / `stripe_price_id` (`text`, nullable)
- `plan_tier` (`text`, NOT NULL, check: `free`, `analyst`, `pro`, `api`)
- `status` (`text`, NOT NULL, check: `active`, `canceled`, `past_due`)
- `current_period_end` (`timestamptz`, nullable)
- `created_at` / `updated_at` (`timestamptz`, NOT NULL, default `now()`)

### Table 15: `waitlist`
- `id` (`uuid`, PK) / `user_id` (`uuid`, nullable, FK ON DELETE CASCADE — changed from `SET NULL` in `007_waitlist.sql`; a `SET NULL`'d row survived user deletion and permanently blocked that address from re-signing up, since `email` is UNIQUE)
- `full_name` (`text`, nullable) / `email` (`text`, NOT NULL, **UNIQUE**)
- `joined_at` (`timestamptz`, NOT NULL, default `now()`)

### Table 16: `sanctions_entities`
Service-role only (RLS enabled, no policy — correct by design).
- `id` (`uuid`, PK) / `name` (`text`, NOT NULL) / `list` (`text`, NOT NULL)
- `source_url` (`text`, nullable) / `added_at` (`date`, nullable)
- `raw_data` (`jsonb`, NOT NULL, default `'{}'::jsonb`)
- `created_at` / `updated_at` (`timestamptz`, NOT NULL, default `now()`)
- **Unique Constraint**: `UNIQUE(name, list)`

### Table 17: `backtest_cache`
Service-role only (RLS enabled, no policy — correct by design).
- `id` (`uuid`, PK) / `cache_key` (`text`, NOT NULL, **UNIQUE**)
- `results` (`jsonb`, NOT NULL)
- `total_events` (`int`, nullable) / `accuracy_pct` / `avg_move_pct` (`double precision`, nullable)
- `computed_at` (`timestamptz`, NOT NULL, default `now()`) / `expires_at` (`timestamptz`, NOT NULL)

**Known drift corrected 2026-08-27** — the previous version of this section stated these, all of which were wrong against the live DB:
- `alert_rules.channels` default was documented as `'{telegram}'`; it is actually `'{email}'`. This is the most misleading of the set, since it describes what a newly created rule does by default.
- `profiles` was missing `product_tour_completed`; `signals` was missing both `event_date` and `shipping_proximity`; `alert_rules` was missing `frequency`, `created_at`, `updated_at`, and `last_triggered_at`.
- `raw_events.source`'s check constraint was listed as only `gdelt`/`acled`/`newsapi`, with an inline note saying the real set was "broader" without naming it. The real set is `gdelt`, `acled`, `newsapi`, `gnews`, `manual`.
- Nine tables were absent entirely: `alerts_sent`, `webhook_deliveries`, `user_preferences`, `watchlist_entries`, `saved_signals`, `subscriptions`, `waitlist`, `sanctions_entities`, `backtest_cache`.

---

## 3. Indexes & Performance Optimization

```sql
-- Indexes for low-latency signal filtering and full-text search
CREATE INDEX idx_signals_severity ON public.signals (severity DESC);
CREATE INDEX idx_signals_region ON public.signals (region);
CREATE INDEX idx_signals_created ON public.signals (created_at DESC);
CREATE INDEX idx_signals_fulltext ON public.signals USING gin (
  to_tsvector('english', coalesce(title,'') || ' ' || coalesce(summary,''))
);
CREATE INDEX idx_commodity_prices_symbol ON public.commodity_prices (symbol, fetched_at DESC);
CREATE INDEX idx_alerts_sent_user ON public.alerts_sent (user_id, created_at DESC);
CREATE INDEX idx_raw_events_dedup ON public.raw_events (external_id, source);

-- Added 2026-08-18 (012_reliability_indexes_and_cleanup.sql) — ownership columns that
-- are both application-filtered and RLS-checked on every row had no supporting index:
CREATE INDEX idx_alert_rules_user_id ON public.alert_rules (user_id);
CREATE INDEX idx_api_keys_user_id ON public.api_keys (user_id);
CREATE INDEX idx_webhook_endpoints_user_id ON public.webhook_endpoints (user_id);
CREATE INDEX idx_webhook_deliveries_endpoint_id ON public.webhook_deliveries (endpoint_id);
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions (user_id);
-- The main feed's commodity filter (`.contains("commodity_impacts", [{asset}])`) had
-- no index either, unlike the equivalent full-text search column above:
CREATE INDEX idx_signals_commodity_impacts ON public.signals USING gin (commodity_impacts jsonb_path_ops);
-- Guards against duplicate signals for the same raw_event if the dormant
-- ai-classifier.ts queue worker is ever reactivated (its duplicate check today is a
-- check-then-insert race with no DB-level backstop):
CREATE UNIQUE INDEX idx_signals_raw_event_ids_unique ON public.signals (raw_event_ids);
```

**Live verification 2026-08-27** (`pg_indexes` against the real DB, not a re-read of the migration file): all six indexes added by `012` exist on the live database, as does the unique index. Two notes worth keeping:

- `idx_signals_raw_event_ids_unique` is a unique **index**, not a table constraint, so it does not appear in `pg_constraint` — check `pg_indexes` when verifying it.
- The unique index covers the whole `raw_event_ids` array, so it only guards the single-element insert path it was written for (`[rawEventId]`). It does **not** prevent a signal with `[a]` from coexisting with a merged signal holding `[a, b]` — the cross-source merge step (`signal-merge.ts`, ADR 010) produces exactly such multi-element arrays. That is a real limit of this guard, not a regression; the merge path has its own dedup logic upstream.
- `idx_signals_commodity_impacts` was confirmed to be used by the *fixed* commodity-filter query shape (`commodity_impacts @> '[{"asset":"…"}]'`, per the `51ab7a0` serialization fix): `EXPLAIN ANALYZE` on a selective asset shows `Bitmap Index Scan on idx_signals_commodity_impacts`. For a low-selectivity asset (e.g. `USOIL`, ~9% of rows) the planner instead walks `idx_signals_event_date` in sort order and filters, which is the correct choice at the current table size (~2.2k rows) given the query's `ORDER BY event_date DESC LIMIT 20`. Both plans are healthy; the GIN index earns its keep as the table grows.

---

## 4. SQL Migration Audit History (`supabase/migrations/`)

1. **`000_init_schema.sql`**: Initial table definitions, UUID extensions, and core indexes.
2. **`001_rls_policies.sql`**: Row Level Security setup for authenticated tenant isolation.
3. **`002_sanctions.sql`**: Sanctions matches JSONB column addition.
4. **`003_user_channels.sql`**: Telegram chat ID and Slack webhook user connections table.
5. **`004_auth_triggers.sql`**: Automated profile creation trigger on `auth.users` insert.
6. **`005_fix_profiles_rls.sql`**: RLS update allowing profile creation during auth flow.
7. **`006_onboarding_schema_fix.sql`**: Onboarding wizard state column updates.
8. **`007_waitlist.sql`**: Gated waitlist submission schema.
9. **`008_fix_source_constraint.sql`**: Allowed `source='gnews'` in `raw_events` — believed applied for 2 days before it actually was (see `14_CHANGELOG.md` v0.19.0 and `16_MIGRATION_CHECKLIST.md`).
10. **`009_signals_event_date.sql`**: Added `event_date` index for publish-time ordering.
11. **`010_add_product_tour_flag.sql`**: `profiles.product_tour_completed` column.
12. **`011_rls_remediation.sql`**: Enabled RLS on 7 previously-exposed tables; hardened `handle_new_user()`.
13. **`012_reliability_indexes_and_cleanup.sql`** (2026-08-18): Consolidated `user_channels`' 4 overlapping RLS policies into 1; added the 6 indexes above; see full rationale in the migration file itself and `16_MIGRATION_CHECKLIST.md`. **Applied to the live DB 2026-08-19 (founder, via SQL editor) and verified two independent ways**: (1) Security Advisor via the Management API (`SUPABASE_ACCESS_TOKEN`, project linked 2026-08-19) confirms the `user_channels` "Multiple Permissive Policies" warning is gone, nothing new appeared; (2) Performance Advisor shows all 6 new indexes as `unused_index` findings (expected/benign for brand-new indexes — proves they exist, Postgres just hasn't recorded read traffic against them yet). Also live-tested the unique constraint directly: a duplicate `raw_event_ids` insert correctly threw `duplicate key value violates unique constraint "idx_signals_raw_event_ids_unique"`.

## 5. Data Retention & Archival — planned, not yet built

No archival or pruning strategy currently exists for `raw_events`, `signals`, or `commodity_prices` — all three grow forever. A full archival system (cold storage, partitioning, etc.) is bigger than any single task scoped so far; this section exists so the decision is a planned one, not a surprise when one of these tables eventually becomes a performance problem.

**Where volume actually stands today (measured 2026-08-27, `pg_stat_user_tables`):** `raw_events` 2,218 rows / 2.4 MB · `signals` 2,170 rows / 2.2 MB · `commodity_prices` 7,775 rows / 1.9 MB. Every other table is under 100 kB, and most are empty. Total public-schema footprint is single-digit megabytes. **Nothing here is close to a performance or cost problem**, which is the main reason this remains a documented plan rather than a built job — implementing pruning now would be optimizing against a non-problem, and would risk deleting history before the retention windows below have been confirmed against real product needs. Re-measure before acting on any of it.

**Proposed retention plan (not yet implemented — the specific windows below are a judgment call by whoever drafted this, NOT a founder decision; treat each number as a proposal to be confirmed, not settled policy):**
- `raw_events`: archive or delete rows older than ~180 days that already have a corresponding `signals` row (the source article's raw text has no ongoing product use once classified; the `signals` row is the durable artifact). Rows *without* a corresponding signal should go through the reconciliation job (`reconciliation.ts`, added 2026-08-18) first — don't archive an unprocessed orphan.
- `signals`: no deletion — these are the actual product (historical signals feed comparable events, backtesting references them). If storage becomes a real concern, consider moving `signals` older than ~2 years to a separate cold-storage table rather than deleting, since `HISTORICAL` tab comparisons (`events/[id]/page.tsx`) and backtesting both query historical signals directly.
- `commodity_prices`: prune raw per-15-minute rows older than ~90 days, keeping only a daily/weekly rollup for anything older (the watchlist sparkline and price-at-signal comparisons only need recent granularity; long-range history doesn't need 15-minute resolution).
- Whichever of the above is chosen, implement as a scheduled job in `workers.ts` (same pattern as the existing daily sanctions sync `cron.schedule("0 4 * * *", ...)`), not a one-off manual script — so it doesn't require remembering to run it.
