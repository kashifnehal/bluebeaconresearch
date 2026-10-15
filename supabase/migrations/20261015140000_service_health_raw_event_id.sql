-- Link a service_health_events row to the raw article it describes.
-- Nullable: collector and spend rows are not about one article.
-- No foreign key, so a write still succeeds if the raw_events row is already gone.
-- Partial index: most rows leave this null.

alter table public.service_health_events
  add column if not exists raw_event_id uuid;

create index if not exists service_health_events_raw_event_id_idx
  on public.service_health_events (raw_event_id)
  where raw_event_id is not null;

comment on column public.service_health_events.raw_event_id is
  'Optional raw_events.id for a row about one article, such as a materiality-gate rejection. Null for service-level rows.';
