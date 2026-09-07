-- #83 Personalized daily digest — opt-out flag.
--
-- Adds digest_enabled to the pre-existing user_preferences table (see
-- 20260907004803_user_preferences_personalization.sql for the table's history).
-- Purely additive: default true so every already-onboarded user is opted in, and
-- the account-settings toggle writes this column to opt out. Does not touch
-- min_severity, onboarding_completed_at, RLS, or the key layout.

alter table public.user_preferences
  add column if not exists digest_enabled boolean not null default true;

comment on column public.user_preferences.digest_enabled is
  'When true (default), the user receives the once-daily personalized signal digest (#83). Toggled from account settings.';
