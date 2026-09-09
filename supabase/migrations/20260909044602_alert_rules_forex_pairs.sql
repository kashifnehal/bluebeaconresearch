-- 20260909044602_alert_rules_forex_pairs.sql
-- Forex pair taxonomy, phase 3 of 3 (#87).
--
-- Adds a dedicated text[] column for the forex pairs an alert rule follows,
-- mirroring the existing alert_rules.commodities text[] pattern exactly. A rule
-- now matches a signal if EITHER its commodities OR its forex_pairs overlap the
-- signal's impacts (same OR-of-arrays logic already used for regions/commodities
-- in apps/backend/src/workers/alert-dispatcher.ts).
--
-- Additive only. commodities / regions / channels / min_severity (and its
-- conservative default — alert-fatigue discipline, doc 53) are untouched.

alter table public.alert_rules
  add column if not exists forex_pairs text[] not null default '{}';

comment on column public.alert_rules.forex_pairs is
  'Forex pairs this rule follows; matched against signals.currency_pair_impacts[].asset. One of EURUSD|GBPUSD|USDJPY|USDCHF|USDRUB|USDCNY (#87 phase 3).';
