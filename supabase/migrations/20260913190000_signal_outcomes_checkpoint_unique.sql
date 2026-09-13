-- Widen signal_outcomes unique key so multiple checkpoint_hours values can
-- coexist per (signal, asset). checkpoint_hours was already a per-row value
-- (default 48); UNIQUE (signal_id, asset) blocked 1h/4h/24h rows next to the
-- existing 48h #121 rows. Existing 48h data is not rewritten.
--
-- Applied live to evavcgfmemwryggdkjmx as signal_outcomes_checkpoint_unique.

alter table public.signal_outcomes
  drop constraint if exists signal_outcomes_signal_id_asset_key;

alter table public.signal_outcomes
  add constraint signal_outcomes_signal_id_asset_checkpoint_hours_key
  unique (signal_id, asset, checkpoint_hours);
