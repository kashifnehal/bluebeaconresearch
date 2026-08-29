-- Migration 009: Add event_date to signals table
-- Signals need to track when the underlying event/article was published,
-- separate from when we ingested it (created_at). Without this, the UI
-- shows "2 hours ago" based on ingestion time, not article publish time.

ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS event_date timestamptz;

-- Backfill from raw_events for existing signals (best-effort)
UPDATE public.signals s
SET event_date = re.event_date
FROM public.raw_events re
WHERE re.id = (s.raw_event_ids[1])::uuid
  AND s.event_date IS NULL;

-- Create index for time-sorted queries
CREATE INDEX IF NOT EXISTS idx_signals_event_date ON public.signals (event_date DESC NULLS LAST);
