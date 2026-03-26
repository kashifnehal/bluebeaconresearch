-- Migration 007: Waitlist table
-- Tracks every user who has joined the waitlist while isProjectReady = false.

create table if not exists public.waitlist (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete set null,
  full_name   text,
  email       text not null unique,
  joined_at   timestamptz not null default now()
);

alter table public.waitlist enable row level security;

-- Anyone (anon / authed) can insert their own row
create policy "waitlist_insert"
  on public.waitlist
  for insert
  with check (true);

-- Users can view their own row
create policy "waitlist_select_own"
  on public.waitlist
  for select
  using (auth.uid() = user_id);

-- Index for quick lookups by email
create index if not exists idx_waitlist_email on public.waitlist (email);
create index if not exists idx_waitlist_joined_at on public.waitlist (joined_at desc);
