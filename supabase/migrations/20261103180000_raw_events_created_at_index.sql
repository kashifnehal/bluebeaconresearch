-- Newest-row lookups (stalled-collection alert, /status, ingestion status) did a full scan. Live 2026-11-03: 1.7 s for 23,329 rows.
create index if not exists idx_raw_events_created_at on public.raw_events (created_at desc);
