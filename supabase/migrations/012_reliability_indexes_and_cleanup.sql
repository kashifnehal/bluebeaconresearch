-- 012_reliability_indexes_and_cleanup.sql
-- Reliability/DB-cleanup pass (2026-08-18). See docs/brain/16_MIGRATION_CHECKLIST.md
-- for the standing verification checklist this migration should be run through —
-- do not mark this "done" in any changelog until that checklist has been followed.

-- ── PART 1 — Consolidate user_channels' 4 overlapping RLS policies into 1 ──────────
-- Migrations 003 and 006 each added policies for this table without checking what
-- already existed: 003 added 3 narrow ones (select/insert/update), 006 added a 4th,
-- broader "for all" one covering the same ground. All four use the identical
-- `user_id = auth.uid()` check — functionally harmless (they OR together, so access
-- was never wrong), but flagged by Supabase's Security Advisor as redundant. Collapse
-- to the one broad policy; access logic is unchanged.
drop policy if exists "user_channels_select_own" on public.user_channels;
drop policy if exists "user_channels_upsert_own" on public.user_channels;
drop policy if exists "user_channels_update_own" on public.user_channels;
drop policy if exists "user_channels_all_own" on public.user_channels;

create policy "user_channels_all_own"
on public.user_channels
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- ── PART 2 — Missing indexes on ownership columns filtered by RLS ──────────────────
-- Each of these tables is filtered on its owner column (both by application queries
-- and by the RLS policy itself on every row-level check), with no supporting index —
-- meaning every query against them does a sequential scan under RLS.
create index if not exists idx_alert_rules_user_id on public.alert_rules (user_id);
create index if not exists idx_api_keys_user_id on public.api_keys (user_id);
create index if not exists idx_webhook_endpoints_user_id on public.webhook_endpoints (user_id);
create index if not exists idx_webhook_deliveries_endpoint_id on public.webhook_deliveries (endpoint_id);
create index if not exists idx_subscriptions_user_id on public.subscriptions (user_id);

-- ── PART 3 — Missing index on the main feed's commodity filter ─────────────────────
-- apps/web/app/api/signals/route.ts filters with
-- `.contains("commodity_impacts", [{ asset: commodity }])` — a JSONB containment (@>)
-- query — on every commodity-filtered dashboard load, with no matching index (unlike
-- idx_signals_fulltext, which the equivalent full-text search column already has).
-- jsonb_path_ops is the right opclass here: smaller and faster than the default GIN
-- opclass specifically for `@>` containment queries, at the cost of not supporting
-- `?`/`?&`/`?|` existence operators — which this codebase doesn't use on this column.
create index if not exists idx_signals_commodity_impacts on public.signals using gin (commodity_impacts jsonb_path_ops);

-- ── PART 4 — Unique constraint to guard against duplicate signals ──────────────────
-- ai-classifier.ts's duplicate check (query for an existing signal whose
-- raw_event_ids contains this raw_event, skip insert if found) is a check-then-insert
-- race with no DB-level backstop — under concurrent execution, two processes could
-- both pass the check before either inserts. That worker's queue is currently dormant
-- (see 14_CHANGELOG.md v0.20.0), so this can't happen in the live path today, but the
-- constraint is cheap to add now while there's no real risk of it rejecting live
-- traffic, rather than adding it later once the path is reactivated and racy inserts
-- are already possible. Every current insert path (rss/gnews/gdelt collectors,
-- ai-classifier.ts, and the reconciliation job) always inserts raw_event_ids as a
-- single-element array `[rawEventId]`, so a unique index on the whole array column
-- correctly rejects a second signal for the same raw_event.
--
-- NOTE: if this fails with a uniqueness violation when applied, that means duplicate
-- signals already exist for the same raw_event_ids value — investigate before
-- retrying, don't just drop rows to force it through.
create unique index if not exists idx_signals_raw_event_ids_unique on public.signals (raw_event_ids);
