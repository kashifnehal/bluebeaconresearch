-- Phase 8: user channel connections (telegram + slack)

create table if not exists public.user_channels (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  telegram_chat_id text,
  telegram_connected_at timestamptz,
  slack_webhook_url text,
  slack_connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.user_channels enable row level security;

drop policy if exists "user_channels_select_own" on public.user_channels;
create policy "user_channels_select_own"
on public.user_channels
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "user_channels_upsert_own" on public.user_channels;
create policy "user_channels_upsert_own"
on public.user_channels
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "user_channels_update_own" on public.user_channels;
create policy "user_channels_update_own"
on public.user_channels
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

