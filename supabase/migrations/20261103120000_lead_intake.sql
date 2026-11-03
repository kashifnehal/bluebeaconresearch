-- Public-site newsletter sign-up and sales-lead intake. Both tables are
-- written only by service-role routes (apps/web/app/api/subscribe,
-- /api/subscribe/confirm, /api/unsubscribe, /api/leads) — no anon/authenticated
-- access, same convention as digest_send_log and cot_positions above.

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'unsubscribed')),
  consent_text text not null,
  consent_version text not null,
  consent_at timestamptz not null default now(),
  confirm_token_hash text,
  unsubscribe_token text not null,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  -- Page path and first-touch UTM fields only. Never an IP address.
  source jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create unique index if not exists newsletter_subscribers_email_idx
  on public.newsletter_subscribers (lower(email));

alter table public.newsletter_subscribers enable row level security;
-- No policies — service_role only.

revoke all on public.newsletter_subscribers from anon, authenticated;
grant select, insert, update on public.newsletter_subscribers to service_role;

create table if not exists public.lead_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('walkthrough', 'professional_access')),
  name text not null,
  work_email text not null,
  organisation text,
  role text,
  markets text[] not null default '{}',
  message text,
  consent_contact boolean not null,
  consent_text text not null,
  consent_version text not null,
  -- Page path and first-touch UTM fields only. Never an IP address.
  source jsonb not null default '{}',
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create index if not exists lead_requests_email_created_idx
  on public.lead_requests (lower(work_email), created_at);

alter table public.lead_requests enable row level security;
-- No policies — service_role only.

revoke all on public.lead_requests from anon, authenticated;
grant select, insert, update on public.lead_requests to service_role;
