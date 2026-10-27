-- Weekly/periodic economic series values (EIA petroleum stocks, EIA natural gas
-- storage, and similar). WRITTEN, NOT APPLIED — 2026-10-27. Do not run until a
-- founder applies it.
-- public schema: service_role has no USAGE on internal_ops.

create table if not exists public.economic_event_values (
  id uuid primary key default gen_random_uuid(),
  series_id text not null,
  period date not null,
  value numeric not null,
  unit text not null,
  source_url text not null,
  released_at timestamptz,
  fetched_at timestamptz not null default now(),
  unique (series_id, period)
);

comment on table public.economic_event_values is
  'Periodic economic series values (e.g. EIA weekly petroleum/natural-gas storage). One row per series_id and period. Filled by the EIA weekly collector.';

alter table public.economic_event_values enable row level security;
-- No policies — service role (which bypasses RLS) only.

revoke all on public.economic_event_values from anon, authenticated;
grant select, insert, update on public.economic_event_values to service_role;
