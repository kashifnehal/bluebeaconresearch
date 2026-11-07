-- One row per confirmed subscriber per edition of The Beacon Weekly.
-- Written only by the service-role send script. No anon or authenticated access.
-- A failed attempt stays as status 'failed' so a later run can retry it.
-- A 'sent' row is never sent again. The unique index makes that one row per edition.

create table if not exists public.weekly_send_log (
  id uuid primary key default gen_random_uuid(),
  edition integer not null,
  subscriber_id uuid not null references public.newsletter_subscribers(id) on delete cascade,
  status text not null check (status in ('sent', 'failed')),
  resend_id text,
  error text,
  created_at timestamptz not null default now()
);

create unique index if not exists weekly_send_log_edition_subscriber_idx
  on public.weekly_send_log (edition, subscriber_id);

alter table public.weekly_send_log enable row level security;
-- No policies — service_role only.

revoke all on public.weekly_send_log from anon, authenticated;
grant select, insert, update on public.weekly_send_log to service_role;
