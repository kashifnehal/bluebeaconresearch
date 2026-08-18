# 04_DATABASE.md — PostgreSQL Database Schema & Migration Architecture

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

### Table 1: `profiles`
Extends `auth.users(id)` with billing tier and user settings.
- `id` (`uuid`, PK, FK `auth.users.id` ON DELETE CASCADE)
- `full_name` (`text`, nullable)
- `avatar_url` (`text`, nullable)
- `plan_tier` (`text`, NOT NULL, default `'free'`, check: `free`, `analyst`, `pro`, `api`)
- `stripe_customer_id` (`text`, nullable)
- `onboarding_completed` (`boolean`, NOT NULL, default `false`)
- `push_tokens` (`text[]`, NOT NULL, default `'{}'`)
- `created_at` / `updated_at` (`timestamptz`, default `now()`)

### Table 2: `signals`
Stores LLM-synthesized military/geopolitical intelligence and asset impact data.
- `id` (`uuid`, PK, default `uuid_generate_v4()`)
- `raw_event_ids` (`uuid[]`, NOT NULL, default `'{}'`)
- `title` (`text`, NOT NULL)
- `summary` (`text`, NOT NULL)
- `ai_analysis` (`text`, nullable)
- `severity` (`int`, NOT NULL, check `1 <= severity <= 10`)
- `confidence` (`double precision`, NOT NULL, check `0 <= confidence <= 1`)
- `event_type` (`text`, nullable)
- `country` / `region` (`text`, nullable)
- `lat` / `lng` (`double precision`, nullable)
- `sources_count` (`int`, NOT NULL, default `1`)
- `commodity_impacts` (`jsonb`, NOT NULL, default `'[]'::jsonb`)
- `sanctions_matches` (`jsonb`, NOT NULL, default `'[]'::jsonb`)
- `is_breaking` (`boolean`, NOT NULL, default `false`)
- `is_active` (`boolean`, NOT NULL, default `true`)
- `created_at` / `updated_at` (`timestamptz`, default `now()`)

### Table 3: `raw_events`
Ingested news articles and military incident logs before AI processing.
- `id` (`uuid`, PK)
- `source` (`text`, NOT NULL, check: `gdelt`, `acled`, `newsapi`)
- `external_id` (`text`, nullable)
- `title` / `summary` / `country` (`text`)
- `lat` / `lng` (`double precision`)
- `event_type` / `event_date` (`timestamptz`)
- `raw_data` (`jsonb`, default `'{}'::jsonb`)
- **Unique Constraint**: `UNIQUE(source, external_id)`

### Table 4: `commodity_prices`
- `id` (`uuid`, PK)
- `symbol` (`text`, NOT NULL)
- `price` / `change_24h` / `change_pct_24h` / `high_24h` / `low_24h` (`double precision`)
- `fetched_at` (`timestamptz`, NOT NULL)
- **Unique Constraint**: `UNIQUE(symbol, fetched_at)`

### Table 5: `alert_rules`
- `id` (`uuid`, PK)
- `user_id` (`uuid`, FK `profiles.id` ON DELETE CASCADE)
- `name` (`text`, NOT NULL)
- `regions` / `commodities` (`text[]`)
- `min_severity` (`int`, default `8`)
- `channels` (`text[]`, default `'{telegram}'`)
- `is_active` (`boolean`, default `true`)

### Table 6: `user_channels`
- `user_id` (`uuid`, PK, FK `profiles.id` ON DELETE CASCADE)
- `telegram_chat_id` (`text`, nullable)
- `telegram_connected_at` (`timestamptz`)
- `slack_webhook_url` (`text`, nullable)
- `slack_connected_at` (`timestamptz`)

### Table 7: `api_keys` & Table 8: `webhook_endpoints`
Institutional developer API credentials and webhook subscription URLs.

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

**Proposed retention plan (not yet implemented — flagged as a decision point for the founder, not resolved unilaterally here):**
- `raw_events`: archive or delete rows older than ~180 days that already have a corresponding `signals` row (the source article's raw text has no ongoing product use once classified; the `signals` row is the durable artifact). Rows *without* a corresponding signal should go through the reconciliation job (`reconciliation.ts`, added 2026-08-18) first — don't archive an unprocessed orphan.
- `signals`: no deletion — these are the actual product (historical signals feed comparable events, backtesting references them). If storage becomes a real concern, consider moving `signals` older than ~2 years to a separate cold-storage table rather than deleting, since `HISTORICAL` tab comparisons (`events/[id]/page.tsx`) and backtesting both query historical signals directly.
- `commodity_prices`: prune raw per-15-minute rows older than ~90 days, keeping only a daily/weekly rollup for anything older (the watchlist sparkline and price-at-signal comparisons only need recent granularity; long-range history doesn't need 15-minute resolution).
- Whichever of the above is chosen, implement as a scheduled job in `workers.ts` (same pattern as the existing daily sanctions sync `cron.schedule("0 4 * * *", ...)`), not a one-off manual script — so it doesn't require remembering to run it.
