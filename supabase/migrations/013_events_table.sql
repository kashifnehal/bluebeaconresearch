-- 013_events_table.sql
-- Minimal funnel-tracking events table (2026-08-27). Additive alongside Vercel
-- Analytics (apps/web/app/layout.tsx's <Analytics/>) — this table exists for the
-- funnel events that need to survive longer than Vercel Analytics' retention
-- window. Does NOT touch or replace the existing PostHog wiring
-- (apps/web/lib/analytics.ts / providers.tsx) — different tooling, additive.
--
-- Exactly four event_type values are written by the app today:
--   signup_started            -- Vercel Analytics only, no row here (fires before
--                                 the auth user exists — see lib/funnel-events.ts).
--   signup_completed          -- fire-once per user.
--   first_signal_viewed       -- fire-once per user.
--   first_alert_rule_created  -- fire-once per user.
-- The table itself does not enforce that only these four values are ever inserted
-- (no check constraint) — deliberately, so this can be reused for future funnel
-- events without another migration; today's app code is what constrains it to four.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  created_at timestamptz not null default now(),
  metadata jsonb
);

-- Every current and expected read filters by (user_id, event_type) — the app's
-- own once-per-user dedup check does exactly this lookup before inserting.
create index if not exists idx_events_user_id_event_type
  on public.events (user_id, event_type);

-- Once-per-user events: a check-then-insert race in application code (two
-- near-simultaneous requests both pass the "does a row already exist" check before
-- either inserts) is possible but very unlikely for these three specifically —
-- these partial unique indexes are the DB-level backstop, same reasoning as
-- idx_signals_raw_event_ids_unique in 012_reliability_indexes_and_cleanup.sql. The
-- app's insert path treats the resulting 23505 unique-violation as an expected
-- "already logged" outcome, not an error.
create unique index if not exists idx_events_signup_completed_once
  on public.events (user_id) where event_type = 'signup_completed';
create unique index if not exists idx_events_first_signal_viewed_once
  on public.events (user_id) where event_type = 'first_signal_viewed';
create unique index if not exists idx_events_first_alert_rule_created_once
  on public.events (user_id) where event_type = 'first_alert_rule_created';

alter table public.events enable row level security;

-- Insert-own only. No SELECT policy for `authenticated` — there is no reporting UI
-- yet (out of scope for this pass) and the app's own once-per-user dedup check
-- reads via apps/web/lib/supabase-server.ts's getRouteSupabaseClients(), which
-- prefers the service-role client (bypasses RLS) whenever SUPABASE_SERVICE_ROLE_KEY
-- is configured. Service-role-only reads are simpler and sufficient for now;
-- revisit (add an events_select_own policy, same shape as alert_rules_crud_own in
-- 011_rls_remediation.sql) if/when a user-facing view of this data is built. In the
-- rare fallback where service-role isn't configured, getRouteSupabaseClients() falls
-- back to the RLS-scoped session client — the dedup check then always sees zero
-- rows, but the partial unique indexes above still guarantee at most one row per
-- user per fire-once event_type.
drop policy if exists "events_insert_own" on public.events;
create policy "events_insert_own"
on public.events
for insert
to authenticated
with check (user_id = (select auth.uid()));
