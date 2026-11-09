-- Written 2026-11-09. Not applied here.
--
-- outcome-tracker.ts picks the two commodity_prices rows closest to the
-- event time and the checkpoint time for each (signal, asset, checkpoint_hours)
-- outcome, using findClosestPoint()/MAX_PRICE_POINT_DISTANCE_MS (currently a
-- 24h tolerance, unchanged by this migration). Today signal_outcomes stores
-- only the two prices and the checkpoint_hours — not which real timestamps
-- those prices came from, or how far each one actually sat from the time it
-- was supposed to represent. These four nullable columns let a future read
-- (e.g. an accuracy audit) see that distance directly instead of re-deriving
-- it from commodity_prices, which only retains 90 days.
--
-- price_before_at / price_before_offset_seconds describe the price picked for
-- the event-time anchor; price_after_at / price_after_offset_seconds describe
-- the price picked for the checkpoint-time anchor. offset_seconds is
-- (actual timestamp of the picked price) minus (the target timestamp it was
-- matched to), in seconds — positive when the picked price is later than the
-- target, negative when earlier. No backfill: existing rows get NULLs in all
-- four columns until outcome-tracker.ts is deployed with the code that fills
-- them going forward.
alter table public.signal_outcomes
  add column if not exists price_before_at timestamptz,
  add column if not exists price_after_at timestamptz,
  add column if not exists price_before_offset_seconds integer,
  add column if not exists price_after_offset_seconds integer;

comment on column public.signal_outcomes.price_before_at is
  'Real fetched_at of the commodity_prices row used as price_at_event. Nullable; NULL for rows written before this column existed. Written 2026-11-09, not backfilled.';
comment on column public.signal_outcomes.price_after_at is
  'Real fetched_at of the commodity_prices row used as price_at_checkpoint. Nullable; NULL for rows written before this column existed. Written 2026-11-09, not backfilled.';
comment on column public.signal_outcomes.price_before_offset_seconds is
  'price_before_at minus the event-time target, in seconds (signed; positive = the picked price is later than the event). Nullable; NULL for rows written before this column existed.';
comment on column public.signal_outcomes.price_after_offset_seconds is
  'price_after_at minus the checkpoint-time target (event + checkpoint_hours), in seconds (signed; positive = the picked price is later than the checkpoint). Nullable; NULL for rows written before this column existed.';
