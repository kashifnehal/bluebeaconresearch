-- claude/237 (BBR Claude Project) reconciliation repeat-rejection fix.
-- Nullable marker: set the first time classifyEvent() returns a confirmed
-- materiality-gate rejection for a raw_events row, so reconciliation.ts never
-- re-submits that row to Claude again regardless of its age (previously it was
-- retried every 30-min cycle for its full 12h life — 23 repeat calls/article).
alter table raw_events
  add column if not exists materiality_checked_at timestamptz;

create index if not exists idx_raw_events_materiality_checked_at
  on raw_events (materiality_checked_at)
  where materiality_checked_at is null;
