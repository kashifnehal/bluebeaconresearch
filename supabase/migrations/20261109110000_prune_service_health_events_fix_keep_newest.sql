-- Written 2026-11-09. Already applied to production (as migration
-- prune_service_health_events_fix_keep_newest, via the Supabase tool); this
-- file is added so the repo matches.
--
-- supabase/migrations/20261109090000_prune_service_health_events.sql has a
-- logic error in public.prune_service_health_events: both eligibility blocks
-- (the dry-run count and the "eligible" CTE) negated the "a newer row of the
-- same (service, status) pair is present" subquery, which selects only the
-- newest row of each (service, status) pair -- the opposite of the intended
-- rule (keep the newest row of each pair, delete the older ones). A dry run
-- on production returned 0 instead of 17,438. The corrected rule, applied
-- below: a row is eligible when it is older than p_cutoff, its service is
-- not on the keep list, and a newer row of the same (service, status) pair
-- exists. Running the corrected function pruned 17,480 rows.

create or replace function public.prune_service_health_events(
  p_cutoff timestamptz,
  p_batch integer default 2000,
  p_dry_run boolean default false
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_deleted integer;
  v_upserted integer;
begin
  -- A row is eligible when it is older than the cutoff, its service is not on
  -- the keep list below, and it is not the newest row of its (service, status)
  -- pair (some readers need only the newest row of a service).
  if p_dry_run then
    select count(*)::integer
    into v_deleted
    from public.service_health_events e
    where e.created_at < p_cutoff
      and e.service not in (
        'materiality_gate', 'gate-drift', 'feed-volume',
        'category-guard', 'anthropic-monthly', 'sanctions_sync'
      )
      and exists (
        select 1
        from public.service_health_events newer
        where newer.service = e.service
          and newer.status = e.status
          and newer.created_at > e.created_at
      );
    return coalesce(v_deleted, 0);
  end if;

  with eligible as (
    select e.id, e.service, e.status, e.detail, e.created_at
    from public.service_health_events e
    where e.created_at < p_cutoff
      and e.service not in (
        'materiality_gate', 'gate-drift', 'feed-volume',
        'category-guard', 'anthropic-monthly', 'sanctions_sync'
      )
      and exists (
        select 1
        from public.service_health_events newer
        where newer.service = e.service
          and newer.status = e.status
          and newer.created_at > e.created_at
      )
    order by e.created_at
    limit p_batch
    for update skip locked
  ),
  deleted as (
    delete from public.service_health_events e
    using eligible
    where e.id = eligible.id
    returning eligible.service, eligible.status, eligible.detail, eligible.created_at
  ),
  grouped as (
    select
      (created_at at time zone 'utc')::date as day,
      service,
      status,
      count(*)::integer as event_count,
      min(created_at) as first_at,
      max(created_at) as last_at,
      (array_agg(detail order by created_at desc))[1] as newest_detail
    from deleted
    group by 1, 2, 3
  ),
  upsert as (
    insert into public.service_health_daily (day, service, status, event_count, first_at, last_at, sample_detail)
    select day, service, status, event_count, first_at, last_at, left(newest_detail, 300)
    from grouped
    on conflict (day, service, status) do update
      set event_count = public.service_health_daily.event_count + excluded.event_count,
          first_at = least(public.service_health_daily.first_at, excluded.first_at),
          last_at = greatest(public.service_health_daily.last_at, excluded.last_at),
          sample_detail = coalesce(public.service_health_daily.sample_detail, excluded.sample_detail)
    returning 1
  )
  select (select count(*) from deleted), (select count(*) from upsert)
  into v_deleted, v_upserted;

  return coalesce(v_deleted, 0);
end;
$$;

revoke all on function public.prune_service_health_events(timestamptz, integer, boolean) from public, anon, authenticated;
grant execute on function public.prune_service_health_events(timestamptz, integer, boolean) to service_role;
