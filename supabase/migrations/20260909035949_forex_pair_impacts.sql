-- 20260909035949_forex_pair_impacts.sql
-- Forex pair taxonomy, phase 1 of 3 (#87, cleared by ADR 013 forex-only softening).
--
-- Adds a dedicated jsonb column for currency-pair (forex) market impacts on
-- signals, mirroring the existing commodity_impacts column. Until now the two
-- forex pairs the classifier recognised (EURUSD, USDRUB) were incorrectly written
-- into commodity_impacts — this column is where forex impacts land going forward.
--
-- Additive only. commodity_impacts / sanctions_matches / every other existing
-- column is untouched, and historical commodity_impacts rows that already contain
-- EURUSD/USDRUB are intentionally left as-is (no backfill).

alter table public.signals
  add column if not exists currency_pair_impacts jsonb not null default '[]'::jsonb;

comment on column public.signals.currency_pair_impacts is
  'Forex-pair market impacts [{asset,direction,confidence}]; asset is one of EURUSD|GBPUSD|USDJPY|USDCHF|USDRUB|USDCNY (#87).';
