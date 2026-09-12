-- One-time dismissal of the in-app notification-connect prompt (#112).
-- Deliberately a separate column from onboarding_completed and
-- product_tour_completed: those gate the /onboarding wizard and the
-- first-login Joyride tour. This is a distinct, one-time UI dismissal
-- and must not reuse either.
alter table if exists public.profiles
add column if not exists notification_prompt_dismissed_at timestamptz;
