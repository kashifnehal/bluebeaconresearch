-- 1. Add missing 'use_case' column to user_preferences
alter table if exists public.user_preferences 
add column if not exists use_case text;

-- 2. Create missing 'user_channels' table
create table if not exists public.user_channels (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  telegram_chat_id text,
  slack_webhook_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

-- 3. Enable RLS (if not already enabled)
alter table public.user_channels enable row level security;

-- 4. Add RLS policies for user_channels (to be safe)
drop policy if exists "user_channels_all_own" on public.user_channels;
create policy "user_channels_all_own"
on public.user_channels
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
