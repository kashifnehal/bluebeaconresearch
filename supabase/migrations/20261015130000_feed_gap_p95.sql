-- Read-only p95 inter-arrival gap per RSS feed over the last 14 days.
-- Feed name is raw_data->>'source', the same column feed_yield_daily calls feed_name.
-- Gaps are consecutive created_at differences (lag) in hours. The first row in
-- each feed has no previous row, so its gap is null and percentile_cont skips it.
-- rows_14d still counts that row. No INSERT/UPDATE/DELETE. security_invoker so
-- the view uses the caller's privileges and does not bypass RLS on raw_events.
-- SELECT is granted to service_role only.

create or replace view public.feed_gap_p95
with (security_invoker = true) as
with rss as (
  select
    re.raw_data->>'source' as feed_name,
    re.created_at,
    extract(
      epoch from (
        re.created_at - lag(re.created_at) over (
          partition by re.raw_data->>'source'
          order by re.created_at
        )
      )
    ) / 3600.0 as gap_hours
  from public.raw_events re
  where re.source = 'rss'
    and re.created_at >= now() - interval '14 days'
    and re.raw_data->>'source' is not null
)
select
  feed_name,
  count(*)::bigint as rows_14d,
  max(created_at) as last_seen,
  percentile_cont(0.95) within group (order by gap_hours) as p95_gap_hours
from rss
group by feed_name;

comment on view public.feed_gap_p95 is
  'Per RSS feed (raw_events.source = rss, feed name raw_data->>''source''): rows saved in the last 14 days, latest created_at, and the 95th percentile of consecutive created_at gaps in hours. Read-only. security_invoker. SELECT for service_role only.';

comment on column public.feed_gap_p95.feed_name is
  'RSS feed name from raw_data->>''source''. Same naming as feed_yield_daily.feed_name.';

comment on column public.feed_gap_p95.rows_14d is
  'Count of rss raw_events for this feed with created_at in the last 14 days.';

comment on column public.feed_gap_p95.last_seen is
  'Max raw_events.created_at for this feed in the last 14 days.';

comment on column public.feed_gap_p95.p95_gap_hours is
  'percentile_cont(0.95) of hours between consecutive created_at values. Null gaps (the first row per feed) are ignored.';

-- New public relations pick up privileges from Supabase defaults.
-- Strip those, then allow SELECT for service_role only.
revoke all on table public.feed_gap_p95 from public;
revoke all on table public.feed_gap_p95 from anon, authenticated;
revoke all on table public.feed_gap_p95 from service_role;
grant select on table public.feed_gap_p95 to service_role;
