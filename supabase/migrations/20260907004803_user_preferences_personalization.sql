-- #81 Personalization core — extend the pre-existing user_preferences table.
--
-- user_preferences ALREADY EXISTS (created in 20260101000000_init_schema.sql) with
-- user_id (unique, FK profiles ON DELETE CASCADE), commodities text[], regions
-- text[], min_severity int default 7 CHECK (1..10), plus timezone/theme/quiet_*/
-- email_frequency/use_case, and RLS enabled with per-user SELECT/INSERT/UPDATE
-- policies (user_preferences_select_own / _upsert_own / _update_own).
--
-- This migration is purely additive: it adds the columns personalization (#81)
-- and future forex/equity gating (#87) need, and backfills onboarding_completed_at
-- for users who already finished the /onboarding wizard so they are not re-prompted.
-- It does NOT change min_severity's default, the id/user_id key layout, or RLS.

alter table public.user_preferences
  add column if not exists forex_pairs text[] not null default '{}',
  add column if not exists equity_tickers text[] not null default '{}',
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

comment on column public.user_preferences.forex_pairs is 'Reserved — unused until forex data is enabled (#87)';
comment on column public.user_preferences.equity_tickers is 'Reserved — unused; equity stays gated separately';
comment on column public.user_preferences.onboarding_completed_at is 'Set when the user finishes onboarding preference capture (#81)';

-- Backfill: users who already completed the /onboarding wizard (profiles.onboarding_completed)
-- get a non-null onboarding_completed_at so the "have they told us what they care about"
-- check treats them as already-onboarded rather than re-prompting.
update public.user_preferences up
set onboarding_completed_at = coalesce(up.updated_at, now())
from public.profiles p
where p.id = up.user_id
  and p.onboarding_completed is true
  and up.onboarding_completed_at is null;
