-- Migration 007: Waitlist table
-- Tracks every user who has joined the waitlist while isProjectReady = false.

create table if not exists public.waitlist (
  id          uuid primary key default uuid_generate_v4(),
  -- ON DELETE CASCADE, matching profiles.id (000_init_schema.sql). Not SET NULL:
  -- since email is UNIQUE below, a SET NULL'd row would survive user deletion and
  -- permanently block that address from ever appearing in waitlist again (real users
  -- who delete their account, and — the case that actually surfaced this — a deleted
  -- test account leaving a stale row that fails re-signup with a confusing unrelated
  -- unique-constraint error).
  user_id     uuid references auth.users(id) on delete cascade,
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
