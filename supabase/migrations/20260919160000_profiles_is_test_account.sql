-- 20260919160000_profiles_is_test_account.sql
-- #146 — prospect/demo accounts that must never enter founder-console usage
-- numbers (or any other real-user count). Boolean NOT NULL DEFAULT false matches
-- the existing profiles flag pattern (onboarding_completed, product_tour_completed).
-- This is not a privilege flag; it only excludes the row from aggregates.
-- Stored on profiles (not user_metadata): user_metadata is client-editable.

alter table public.profiles
  add column if not exists is_test_account boolean not null default false;

comment on column public.profiles.is_test_account is
  'Prospect/demo accounts. Excluded from usage metrics. Not a privilege flag. Set only via service role / handle_new_user from app_metadata.';

-- Authenticated clients can UPDATE their own profiles row (profiles_update_own).
-- They must not be able to flip this flag (hide themselves from metrics, or
-- un-hide a demo account). Column-level revoke + trigger.
revoke update (is_test_account) on table public.profiles from anon, authenticated;

create or replace function public.protect_profiles_is_test_account()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_test_account is distinct from old.is_test_account
     and coalesce(auth.role(), '') in ('authenticated', 'anon') then
    raise exception 'is_test_account is not user-editable';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profiles_is_test_account on public.profiles;
create trigger protect_profiles_is_test_account
  before update of is_test_account on public.profiles
  for each row
  execute procedure public.protect_profiles_is_test_account();

-- Copy from raw_app_meta_data only (service-role Admin API). Never from
-- raw_user_meta_data — that is user-editable and must not self-flag an account.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, plan_tier, onboarding_completed, is_test_account)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    coalesce(new.raw_user_meta_data->>'plan_tier', 'free'),
    false,
    coalesce(new.raw_app_meta_data->>'is_test_account', 'false') = 'true'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- Shared predicate for any future investor-facing count: missing profile => real
-- (don't hide unknown users); flagged profile => excluded.
create or replace function public.is_real_user(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select not is_test_account from public.profiles where id = uid),
    true
  );
$$;

revoke all on function public.is_real_user(uuid) from public;
revoke all on function public.is_real_user(uuid) from anon;
revoke all on function public.is_real_user(uuid) from authenticated;

-- Replace 20260904000003 definition: every displayed usage number excludes
-- is_test_account = true. events.user_id and waitlist.user_id both reference
-- auth.users; join through profiles via is_real_user().
create or replace function public.admin_usage_metrics()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'signups', jsonb_build_object(
      'all_time', (
        select count(*) from public.events
        where event_type = 'signup_completed'
          and public.is_real_user(user_id)
      ),
      'last_7d', (
        select count(*) from public.events
        where event_type = 'signup_completed'
          and created_at >= now() - interval '7 days'
          and public.is_real_user(user_id)
      )
    ),
    'auth_users_all_time', (
      select count(*) from auth.users u
      where public.is_real_user(u.id)
    ),
    'dau', (
      select count(distinct user_id) from public.events
      where created_at >= date_trunc('day', now())
        and public.is_real_user(user_id)
    ),
    'wau', (
      select count(distinct user_id) from public.events
      where created_at >= now() - interval '7 days'
        and public.is_real_user(user_id)
    ),
    'waitlist_count', (
      select count(*) from public.waitlist w
      where public.is_real_user(w.user_id)
    ),
    'events_last_7d', coalesce((
      select jsonb_agg(
        jsonb_build_object('event_type', event_type, 'count', c) order by c desc
      )
      from (
        select event_type, count(*) c
        from public.events
        where created_at >= now() - interval '7 days'
          and public.is_real_user(user_id)
        group by event_type
      ) s
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_usage_metrics() from public;
revoke all on function public.admin_usage_metrics() from anon;
revoke all on function public.admin_usage_metrics() from authenticated;
