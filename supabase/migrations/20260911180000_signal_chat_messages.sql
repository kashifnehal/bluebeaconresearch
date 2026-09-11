-- #111 (backend half) — per-signal AI chat, grounded only in that signal's own data.
--
-- signal_chat_messages stores the conversation turns for a user asking follow-up
-- questions about a specific signal's briefing. Scoped by (signal_id, user_id) so
-- each user's chat with a given signal is private and independent of other users'.

create table if not exists public.signal_chat_messages (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid not null references public.signals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists signal_chat_messages_signal_user_created_idx
  on public.signal_chat_messages (signal_id, user_id, created_at);

-- RLS: same "user can only see/insert their own rows" convention as
-- alert_rules_crud_own / watchlist_entries_crud_own / saved_signals_crud_own
-- in 20260101000001_rls_policies.sql. Chat rows are select+insert only from the
-- client's perspective (the backend, using the service-role key, does all the
-- actual reads/writes here) — this policy exists so RLS is correct if this table
-- is ever queried with a user-scoped (anon/authenticated) key instead.
alter table public.signal_chat_messages enable row level security;

drop policy if exists "signal_chat_messages_select_own" on public.signal_chat_messages;
create policy "signal_chat_messages_select_own"
on public.signal_chat_messages
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "signal_chat_messages_insert_own" on public.signal_chat_messages;
create policy "signal_chat_messages_insert_own"
on public.signal_chat_messages
for insert
to authenticated
with check (user_id = auth.uid());

comment on table public.signal_chat_messages is
  'Per-user, per-signal AI chat turns (#111). Grounded only in the signal''s own data — see ClaudeService.chatAboutSignal.';
