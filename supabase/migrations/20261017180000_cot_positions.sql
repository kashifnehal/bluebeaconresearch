-- Weekly CFTC Commitments of Traders (Disaggregated Futures Only) positioning.
-- WRITTEN, NOT APPLIED — 2026-10-17. Do not run until a founder applies it.
-- public schema: service_role has no USAGE on internal_ops.

create table if not exists public.cot_positions (
  report_date date not null,
  contract_market_code text not null,
  market_name text,
  symbol text,
  open_interest bigint,
  mm_long bigint,
  mm_short bigint,
  mm_spread bigint,
  swap_long bigint,
  swap_short bigint,
  prod_long bigint,
  prod_short bigint,
  nonrept_long bigint,
  nonrept_short bigint,
  change_mm_long bigint,
  change_mm_short bigint,
  traders_total integer,
  contract_units text,
  fetched_at timestamptz not null default now(),
  primary key (report_date, contract_market_code)
);

comment on table public.cot_positions is
  'CFTC Disaggregated Futures Only Commitments of Traders. One row per report_date and contract_market_code. Filled by the weekly COT collector.';

alter table public.cot_positions enable row level security;
-- No policies — service role (which bypasses RLS) only.

revoke all on public.cot_positions from anon, authenticated;
grant select, insert, update on public.cot_positions to service_role;
