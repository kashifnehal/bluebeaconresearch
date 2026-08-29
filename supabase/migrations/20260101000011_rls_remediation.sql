-- Migration 011: RLS remediation per Supabase Security Advisor.
--
-- Three parts:
--   1. Enable RLS + correct policies on the 7 tables flagged as fully exposed.
--   2. Harden handle_new_user(): fix mutable search_path, restrict EXECUTE.
--   3. Rewrite auth.uid() -> (select auth.uid()) on the 7 already-RLS'd
--      tables' existing policies (same logic, cached per-statement instead
--      of re-evaluated per-row — standard Supabase perf recommendation).
--
-- Access patterns below were verified against actual call sites (not
-- guessed) before writing any policy:
--   - apps/backend/* and most apps/web/app/api/* routes use the SERVICE
--     ROLE client (getSupabaseAdmin() / an explicit createClient with
--     SUPABASE_SERVICE_ROLE_KEY) and always bypass RLS regardless of the
--     policies below.
--   - The one exception found: apps/web/app/api/alerts/recent/route.ts
--     uses the anon-key + session-cookie client (createServerClient) and
--     is genuinely RLS-subject — its `alerts_sent` query depends on a
--     working "select own" policy to keep working after RLS goes on.

-- =========================================================================
-- PART 1 — RLS on the 7 flagged tables
-- =========================================================================

-- sanctions_entities: no user_id column (it's a reference/lookup list of
-- sanctioned entities, not user data). Only ever touched by
-- apps/backend/src/workers/sanctions-syncer.ts via the service-role
-- client — grep confirms zero reads from any anon/authenticated-key path
-- anywhere in apps/web or apps/backend. No end-user-facing use case exists
-- yet, so: RLS on, no policies (service role bypasses RLS by default and
-- remains fully functional; anon/authenticated get default-deny until a
-- real read use case is built and a policy is added deliberately).
alter table if exists public.sanctions_entities enable row level security;
comment on table public.sanctions_entities is
  'RLS enabled, no policies: service-role-only table. No authenticated/anon read path exists in code today (see sanctions-syncer.ts, the only current caller). Add an explicit read policy if/when a user-facing sanctions view is built.';

-- raw_events: no user_id column — pre-classification ingestion data written
-- by the collectors (acled/gdelt/gnews/rss-collector.ts) and read by
-- ai-classifier.ts, all via the service-role client. The three apps/web API
-- routes that touch it (signals/route.ts, signals/[id]/route.ts,
-- ingestion/status/route.ts) all explicitly build a service-role client
-- too (SUPABASE_SERVICE_ROLE_KEY), never the anon/session client. No
-- legitimate reason for an end user's browser session to read raw,
-- pre-classification event data directly. RLS on, no policies.
alter table if exists public.raw_events enable row level security;
comment on table public.raw_events is
  'RLS enabled, no policies: service-role-only table. All current reads/writes (collectors, ai-classifier, apps/web ingestion/signals routes) go through the service-role client, which bypasses RLS. Not intended for direct anon/authenticated access.';

-- alerts_sent: has user_id. LIVE DEPENDENCY — apps/web/app/api/alerts/recent/route.ts
-- queries this table via the anon-key + session-cookie client
-- (`.from("alerts_sent").select(...).eq("user_id", user.id)`), so this is
-- the one flagged table where getting the policy wrong breaks something
-- that works today. Only a SELECT-own policy is needed: every write comes
-- from apps/backend/src/workers/alert-dispatcher.ts via service role, the
-- browser client never inserts/updates/deletes alerts_sent rows.
alter table if exists public.alerts_sent enable row level security;

drop policy if exists "alerts_sent_select_own" on public.alerts_sent;
create policy "alerts_sent_select_own"
on public.alerts_sent
for select
to authenticated
using (user_id = (select auth.uid()));

-- backtest_cache: no user_id column, and a full-repo grep found zero code
-- references to this table anywhere — apps/web/app/api/backtesting/route.ts
-- (the only backtesting endpoint) uses an in-memory Map cache, not this
-- table. Genuinely unused today. RLS on, no policies (service-role-only,
-- ready for whenever this table is actually wired up).
alter table if exists public.backtest_cache enable row level security;
comment on table public.backtest_cache is
  'RLS enabled, no policies: service-role-only table. Currently unused — apps/web/app/api/backtesting/route.ts caches in-memory, not here (confirmed via repo-wide grep, zero other references). Revisit policy once this table is actually wired into the backtesting endpoint.';

-- webhook_endpoints: has user_id. All current access is via
-- apps/backend/src/routes/webhooks.ts and alert-dispatcher.ts, both using
-- the service-role client with manual `.eq("user_id", user.id)` scoping in
-- code — no anon-key path exists today. Adding the same full-CRUD-own
-- policy shape already used for api_keys/alert_rules as defense-in-depth:
-- doesn't change current behavior (service role still bypasses), but
-- means the DB itself enforces the same ownership rule the route code
-- already enforces, in case anon-key access is ever added later.
alter table if exists public.webhook_endpoints enable row level security;

drop policy if exists "webhook_endpoints_crud_own" on public.webhook_endpoints;
create policy "webhook_endpoints_crud_own"
on public.webhook_endpoints
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- webhook_deliveries: no user_id column — ownership is one hop away via
-- endpoint_id -> webhook_endpoints.user_id. Only ever written by
-- alert-dispatcher.ts / routes/webhooks.ts via service role; no
-- anon-key read path exists today either. Read-only policy via EXISTS
-- against the parent table's ownership, matching the same
-- defense-in-depth reasoning as webhook_endpoints above.
alter table if exists public.webhook_deliveries enable row level security;

drop policy if exists "webhook_deliveries_select_own" on public.webhook_deliveries;
create policy "webhook_deliveries_select_own"
on public.webhook_deliveries
for select
to authenticated
using (
  exists (
    select 1 from public.webhook_endpoints we
    where we.id = webhook_deliveries.endpoint_id
      and we.user_id = (select auth.uid())
  )
);

-- subscriptions: has user_id. Zero code references found anywhere
-- (Stripe billing isn't wired up yet — stripe_customer_id/
-- stripe_subscription_id columns exist but nothing reads/writes this
-- table today). Structurally it's clearly meant to be user-owned billing
-- history a user should eventually be able to view but never edit
-- directly (writes belong to a future Stripe webhook via service role).
-- SELECT-own only, matching the alerts_sent shape.
alter table if exists public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
on public.subscriptions
for select
to authenticated
using (user_id = (select auth.uid()));

-- =========================================================================
-- PART 2 — handle_new_user(): fix mutable search_path, restrict EXECUTE
-- =========================================================================
-- Same body/logic as 004_auth_triggers.sql, unchanged — only adding a
-- pinned search_path (closes the mutable-search-path warning: without
-- this, a role that can create objects in a schema earlier in the caller's
-- search_path could shadow `profiles` and hijack this SECURITY DEFINER
-- function's behavior). Also revoking EXECUTE from PUBLIC (which
-- anon/authenticated inherit): this function is only ever meant to be
-- invoked by the `on_auth_user_created` trigger on auth.users, never
-- called directly. Trigger firing does not require EXECUTE privilege on
-- the trigger function for the role that caused the trigger (Postgres
-- invokes it internally via the trigger mechanism), so revoking public
-- EXECUTE does not break signup — verified this is the standard, safe
-- Supabase remediation pattern for this exact advisory.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, plan_tier, onboarding_completed)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    coalesce(new.raw_user_meta_data->>'plan_tier', 'free'),
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- =========================================================================
-- PART 3 — (select auth.uid()) perf fix on the 7 already-RLS'd tables
-- =========================================================================
-- Same access logic as 001_rls_policies.sql / 003_user_channels.sql /
-- 005_fix_profiles_rls.sql / 006_onboarding_schema_fix.sql — only the
-- auth.uid() call is wrapped in a scalar subquery so Postgres evaluates it
-- once per statement instead of once per row.

-- profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = (select auth.uid()));

-- user_preferences
drop policy if exists "user_preferences_select_own" on public.user_preferences;
create policy "user_preferences_select_own"
on public.user_preferences
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "user_preferences_upsert_own" on public.user_preferences;
create policy "user_preferences_upsert_own"
on public.user_preferences
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "user_preferences_update_own" on public.user_preferences;
create policy "user_preferences_update_own"
on public.user_preferences
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- alert_rules
drop policy if exists "alert_rules_crud_own" on public.alert_rules;
create policy "alert_rules_crud_own"
on public.alert_rules
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- watchlist_entries
drop policy if exists "watchlist_entries_crud_own" on public.watchlist_entries;
create policy "watchlist_entries_crud_own"
on public.watchlist_entries
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- saved_signals
drop policy if exists "saved_signals_crud_own" on public.saved_signals;
create policy "saved_signals_crud_own"
on public.saved_signals
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- api_keys
drop policy if exists "api_keys_crud_own" on public.api_keys;
create policy "api_keys_crud_own"
on public.api_keys
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- user_channels (4 distinct policy names accumulated across 003 + 006 —
-- all rewritten, same names, same logic)
drop policy if exists "user_channels_select_own" on public.user_channels;
create policy "user_channels_select_own"
on public.user_channels
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "user_channels_upsert_own" on public.user_channels;
create policy "user_channels_upsert_own"
on public.user_channels
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "user_channels_update_own" on public.user_channels;
create policy "user_channels_update_own"
on public.user_channels
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "user_channels_all_own" on public.user_channels;
create policy "user_channels_all_own"
on public.user_channels
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
