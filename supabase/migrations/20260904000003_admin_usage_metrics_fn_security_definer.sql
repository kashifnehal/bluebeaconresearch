-- 20260904000003_admin_usage_metrics_fn_security_definer.sql
-- Fix for 20260904000002: that version was SECURITY INVOKER, so calling it as the
-- service_role PostgREST uses raised "permission denied for table users" (42501)
-- on the auth.users count. Redefine as SECURITY DEFINER with a pinned search_path.
-- (20260904000002's file has been updated to match — this migration is only so the
-- already-migrated remote DB catches up.)

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
        select count(*) from public.events where event_type = 'signup_completed'
      ),
      'last_7d', (
        select count(*) from public.events
        where event_type = 'signup_completed'
          and created_at >= now() - interval '7 days'
      )
    ),
    'auth_users_all_time', (select count(*) from auth.users),
    'dau', (
      select count(distinct user_id) from public.events
      where created_at >= date_trunc('day', now())
    ),
    'wau', (
      select count(distinct user_id) from public.events
      where created_at >= now() - interval '7 days'
    ),
    'waitlist_count', (select count(*) from public.waitlist),
    'events_last_7d', coalesce((
      select jsonb_agg(
        jsonb_build_object('event_type', event_type, 'count', c) order by c desc
      )
      from (
        select event_type, count(*) c
        from public.events
        where created_at >= now() - interval '7 days'
        group by event_type
      ) s
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_usage_metrics() from public;
revoke all on function public.admin_usage_metrics() from anon;
revoke all on function public.admin_usage_metrics() from authenticated;
