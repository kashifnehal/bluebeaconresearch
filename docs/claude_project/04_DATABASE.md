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

> ⚠️ UPDATED 2026-08-19 — this check constraint is stale; migration `008_fix_source_constraint.sql` added `gnews` and `manual` to the allowed list (the original constraint was silently rejecting all GNews collector inserts).
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

> ⚠️ UPDATED 2026-08-19 — this migration list is stale; `supabase/migrations/` now goes through 012: `008_fix_source_constraint.sql`, `009_signals_event_date.sql`, `010_add_product_tour_flag.sql`, `011_rls_remediation.sql`, and `012_reliability_indexes_and_cleanup.sql` (applied to the live DB 2026-08-19, verified via Supabase Advisors) have since landed. Also, `production_schema.sql` (a separate, inaccurate schema doc that only described 4 of 17 real tables) was deleted 2026-08-19 — `supabase/migrations/*.sql` is now the only accurate schema source.
