-- 20260904000002_admin_usage_metrics_fn.sql
-- One-round-trip aggregation for the founder-internal usage-metrics page
-- (GET /v1/admin/metrics, apps/backend/src/routes/admin.ts). Kept as a SQL
-- function rather than several supabase-js .select() calls because DAU/WAU are
-- COUNT(DISTINCT user_id) and the per-type breakdown is a GROUP BY — both awkward
-- and multi-round-trip through PostgREST.
--
-- All time windows are UTC ("today" = date_trunc('day', now()) on the DB's UTC
-- clock). Read via the service role only — execute is revoked from anon /
-- authenticated so it is never reachable through PostgREST with a user JWT.
--
-- SECURITY DEFINER: the auth.users count needs owner (postgres) rights — the
-- service_role that PostgREST runs as has no SELECT on auth.users. search_path is
-- pinned so the definer context can't be hijacked. Follow-up fix applied remotely
-- as 20260904000003 (the original 000002 was SECURITY INVOKER and 42501'd on
-- auth.users).

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
    -- True account count (public.events.signup_completed is client-fired and only
    -- since 2026-08-27, so it undercounts — this is the honest number alongside it).
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
