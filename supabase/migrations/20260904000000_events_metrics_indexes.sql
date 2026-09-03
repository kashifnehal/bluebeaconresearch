-- 20260904000000_events_metrics_indexes.sql
-- Usage-metrics support (2026-09-04). The funnel-event table (public.events,
-- created in 20260827133332_events_table / local 013_events_table.sql) already
-- accepts any event_type with no check constraint — so the new recurring event
-- types added in this batch (dashboard_viewed, watchlist_viewed,
-- signal_detail_opened, alert_rule_created) need NO schema change to be logged.
--
-- What this migration adds is purely additive indexes to keep the new
-- GET /v1/admin/metrics aggregation (DAU/WAU, per-event-type counts over a
-- rolling 7-day window, all-time vs last-7d signup counts) from sequential-
-- scanning the table as it grows. Same rationale as
-- 20260817220714_reliability_indexes_parts_2_4.sql.

-- Time-window scans: "events since <timestamp>", optionally grouped by type.
create index if not exists idx_events_created_at
  on public.events (created_at);

-- Per-event-type counts within a time window (the metrics route's GROUP BY).
create index if not exists idx_events_event_type_created_at
  on public.events (event_type, created_at);
