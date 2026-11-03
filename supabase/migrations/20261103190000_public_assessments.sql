-- Public, stable-URL research assessments for logged-out readers and share
-- cards. Service-only: written by an internal publishing flow, never by
-- anon/authenticated. Stores BBR-written text only — never a news article's
-- own text, since the news feed licence is non-commercial.

create table if not exists public.public_assessments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  headline text not null,
  summary text not null check (char_length(summary) <= 400),
  event_time timestamptz,
  assessed_at timestamptz not null,
  markets text[] not null default '{}',
  body jsonb not null,
  sources jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.public_assessments enable row level security;
-- No policies — service_role only.

revoke all on public.public_assessments from anon, authenticated;
grant select, insert, update on public.public_assessments to service_role;
