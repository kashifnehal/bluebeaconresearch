-- One row per daily digest run so later we can see whether a run happened
-- and what it sent. About 365 rows a year; no retention job.

create table if not exists public.digest_send_log (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  eligible integer not null,
  sent integer not null,
  skipped_no_signals integer not null,
  failed integer not null,
  sender_enabled boolean not null,
  error text
);

alter table public.digest_send_log enable row level security;
-- No policies — service_role only.

revoke all on public.digest_send_log from anon, authenticated;
grant select, insert on public.digest_send_log to service_role;
