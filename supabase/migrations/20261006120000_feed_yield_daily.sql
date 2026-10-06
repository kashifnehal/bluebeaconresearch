-- Read-only daily feed yield. One row per UTC day the raw event was saved
-- (raw_events.created_at), per raw_events.source, per RSS feed name.
-- Feed name is raw_data->>'source' only when source = 'rss'; null for every
-- other source so those collectors stay one bucket per day.
-- rows_in_signals counts raw_events ids that appear in any signals.raw_event_ids.
-- pass_percent is 100 * rows_in_signals / rows_saved. No cutoff, no minimum.
-- No INSERT/UPDATE/DELETE. security_invoker so the view uses the caller's
-- privileges and does not bypass RLS on raw_events or signals.
-- raw_events has RLS enabled and no policies (service role bypasses RLS).
-- SELECT is granted to service_role only.

create or replace view public.feed_yield_daily
with (security_invoker = true) as
with passed as materialized (
  select distinct rid as raw_event_id
  from public.signals s
  cross join lateral unnest(s.raw_event_ids) as rid
  where rid is not null
)
select
  (re.created_at at time zone 'UTC')::date as day_utc,
  re.source,
  case
    when re.source = 'rss' then re.raw_data->>'source'
    else null
  end as feed_name,
  count(*)::bigint as rows_saved,
  count(p.raw_event_id)::bigint as rows_in_signals,
  (count(p.raw_event_id)::numeric * 100) / count(*)::numeric as pass_percent
from public.raw_events re
left join passed p on p.raw_event_id = re.id
group by
  (re.created_at at time zone 'UTC')::date,
  re.source,
  case
    when re.source = 'rss' then re.raw_data->>'source'
    else null
  end;

comment on view public.feed_yield_daily is
  'Per UTC day of raw_events.created_at, per raw_events.source, per RSS feed name (raw_data->>''source'' when source is rss, otherwise null): rows saved, rows whose id appears in any signals.raw_event_ids, and pass percent (100 * rows_in_signals / rows_saved). No thresholds. Read-only. security_invoker. SELECT for service_role only.';

comment on column public.feed_yield_daily.day_utc is
  'UTC calendar date of raw_events.created_at (when the row was saved), not event_date.';

comment on column public.feed_yield_daily.source is
  'raw_events.source.';

comment on column public.feed_yield_daily.feed_name is
  'RSS feed name from raw_data->>''source'' when source is rss; null for every other source.';

comment on column public.feed_yield_daily.rows_saved is
  'Count of raw_events rows in this day, source, and feed_name bucket.';

comment on column public.feed_yield_daily.rows_in_signals is
  'How many of those raw_events ids appear in any signals.raw_event_ids array. An id in more than one signal counts once.';

comment on column public.feed_yield_daily.pass_percent is
  '100 * rows_in_signals / rows_saved, full numeric precision. No rounding cutoff and no minimum yield.';

-- New public relations pick up SELECT/INSERT/UPDATE/DELETE for anon,
-- authenticated, and service_role from Supabase default privileges.
-- Strip those, then allow SELECT for service_role only.
revoke all on table public.feed_yield_daily from public;
revoke all on table public.feed_yield_daily from anon;
revoke all on table public.feed_yield_daily from authenticated;
revoke all on table public.feed_yield_daily from service_role;
grant select on table public.feed_yield_daily to service_role;
