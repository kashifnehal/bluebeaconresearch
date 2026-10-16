-- Not applied until the founder approves. Safe to re-run (create or replace).
-- One call returns the at-report, at-flag, and latest commodity_prices quote
-- for each symbol, in the same order as p_symbols. A symbol with no row
-- returns nulls. No new index: idx_commodity_prices_symbol and
-- commodity_prices_symbol_fetched_at_key already exist. Written 2026-10-16.

create or replace function public.get_event_price_bundle(
  p_symbols text[],
  p_flagged_at timestamptz,
  p_raw_event_ids uuid[],
  p_fallback_report_at timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with report as (
    select coalesce(
      (
        select min(re.event_date)
        from public.raw_events re
        where re.id = any (coalesce(p_raw_event_ids, '{}'::uuid[]))
          and re.event_date is not null
      ),
      p_fallback_report_at
    ) as report_at
  ),
  priced as (
    select
      u.ord,
      jsonb_build_object(
        'asset', u.sym,
        'priceAtSignal', at_report.price,
        'priceAtSignalDate', at_report.fetched_at,
        'priceAtFlagged', at_flag.price,
        'priceAtFlaggedDate', at_flag.fetched_at,
        'currentPrice', latest.price,
        'currentPriceDate', latest.fetched_at
      ) as item
    from unnest(coalesce(p_symbols, '{}'::text[])) with ordinality as u(sym, ord)
    cross join report
    left join lateral (
      select cp.price, cp.fetched_at
      from public.commodity_prices cp
      where cp.symbol = u.sym
        and report.report_at is not null
        and cp.fetched_at <= report.report_at
      order by cp.fetched_at desc
      limit 1
    ) at_report on true
    left join lateral (
      select cp.price, cp.fetched_at
      from public.commodity_prices cp
      where cp.symbol = u.sym
        and p_flagged_at is not null
        and cp.fetched_at <= p_flagged_at
      order by cp.fetched_at desc
      limit 1
    ) at_flag on true
    left join lateral (
      select cp.price, cp.fetched_at
      from public.commodity_prices cp
      where cp.symbol = u.sym
      order by cp.fetched_at desc
      limit 1
    ) latest on true
  )
  select coalesce(jsonb_agg(priced.item order by priced.ord), '[]'::jsonb)
  from priced;
$$;

revoke all on function public.get_event_price_bundle(text[], timestamptz, uuid[], timestamptz) from public, anon;
grant execute on function public.get_event_price_bundle(text[], timestamptz, uuid[], timestamptz) to authenticated, service_role;
