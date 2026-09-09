-- #42 Service Health Dashboard, Phase 1.
-- Append-only operational health log: one row per collector/service success or
-- failure. Service-role writes only (recordServiceHealth in the backend); RLS is
-- enabled with no policies, same fail-closed pattern as raw_events / backtest_cache.
create table if not exists public.service_health_events (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  status text not null,
  detail text,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists service_health_events_service_created_idx
  on public.service_health_events (service, created_at desc);

alter table public.service_health_events enable row level security;

comment on table public.service_health_events is
  '#42 Phase 1 — append-only per-service health log (status: ok | error | rate_limited). Service-role write only.';
