-- Written 2026-11-09. Not applied here.
--
-- The weekly service_health_events prune (runServiceHealthRetentionOnce) has been
-- failing with "Bad Request" since it was added (Railway workers log,
-- 2026-11-08 03:00:06 UTC): it selected up to 5,000 ids and called
-- delete().in("id", ids), which puts roughly 185,000 characters of ids into one
-- request URL. Nothing has been deleted since the job was added; the table holds
-- about 104,000 rows today. This migration adds a server-side prune function
-- that deletes in small batches by id (no giant id list in a request), and rolls
-- every deleted row up into a daily per-service/per-status count table first, so
-- the history is not simply discarded.

create table if not exists public.service_health_daily (
  day date not null,
  service text not null,
  status text not null,
  event_count integer not null,
  first_at timestamptz,
  last_at timestamptz,
  sample_detail text,
  primary key (day, service, status)
);

alter table public.service_health_daily enable row level security;

revoke all on public.service_health_daily from anon, authenticated;
grant select, insert, update on public.service_health_daily to service_role;

comment on table public.service_health_daily is
  'Daily per-service/per-status roll-up of pruned service_health_events rows, written 2026-11-09 by prune_service_health_events(). Service-role only.';

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
      and not exists (
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
      and not exists (
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

comment on function public.prune_service_health_events(timestamptz, integer, boolean) is
  'Deletes up to p_batch eligible service_health_events rows older than p_cutoff and rolls them into service_health_daily; p_dry_run true counts every eligible row and changes nothing. Keep list and reasons: materiality_gate (the only stored copy of rejection reasons, read by the replay script and the audit samples), gate-drift/feed-volume/category-guard/anthropic-monthly/sanctions_sync (tiny audit or status rows). A row is also kept, regardless of service, while it is the newest row of its (service, status) pair, because some readers need only the newest row of a service.';
