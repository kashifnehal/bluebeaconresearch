-- Tracks completion of the first-login dashboard product tour (react-joyride).
-- Deliberately a separate column from onboarding_completed, which already
-- gates the unrelated /onboarding wizard redirect (see login/page.tsx,
-- auth/callback/route.ts) — reusing it would break that flow.
alter table if exists public.profiles
add column if not exists product_tour_completed boolean not null default false;
