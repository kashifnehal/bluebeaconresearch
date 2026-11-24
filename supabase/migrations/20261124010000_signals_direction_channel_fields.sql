-- Adds event-level channel fields for direction display. Written 2026-11-24. Not applied by this task.
--
-- Additive, nullable columns on public.signals. No default change to existing
-- rows: every existing row keeps impact_channel/channel_basis/geo_type at NULL
-- until a future classification pass (behind CLASSIFIER_DIRECTION_V3) writes
-- them. channel_basis's 200-character cap is enforced in application code
-- (claude.service.ts), not here, per task instructions.

alter table public.signals
  add column if not exists impact_channel text
    check (impact_channel in ('supply_transit_risk', 'demand_macro', 'opec_supply_news', 'policy_other', 'unclear')),
  add column if not exists channel_basis text,
  add column if not exists geo_type text
    check (geo_type in ('threat', 'act', 'not_geopolitical'));
