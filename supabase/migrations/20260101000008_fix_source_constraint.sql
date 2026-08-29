-- Migration 008: Add 'gnews' and 'manual' to raw_events source check constraint
-- The source check constraint in 000_init_schema.sql only allowed gdelt, acled, newsapi.
-- GNews collector uses source='gnews' which violated this constraint, causing all inserts to fail silently.

ALTER TABLE public.raw_events
  DROP CONSTRAINT IF EXISTS raw_events_source_check;

ALTER TABLE public.raw_events
  ADD CONSTRAINT raw_events_source_check
  CHECK (source IN ('gdelt', 'acled', 'newsapi', 'gnews', 'manual'));
