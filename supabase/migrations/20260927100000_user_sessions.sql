-- Session-cap tracking (max 2 concurrent sessions/user). Bookkeeping table only —
-- does not itself revoke a Supabase session; see apps/web/lib/session-tracking.ts
-- for the enforcement logic and its documented lazy-enforcement limitation.

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  device_label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists user_sessions_user_id_created_at_idx
  on public.user_sessions (user_id, created_at);

alter table public.user_sessions enable row level security;

-- Server routes normally use the service-role client (bypasses RLS), but these
-- policies let the same insert/evict/select logic work if service-role isn't
-- configured in a given environment (falls back to the caller's own session,
-- same pattern as getRouteSupabaseClients() in lib/supabase-server.ts).
drop policy if exists "user_sessions_select_own" on public.user_sessions;
create policy "user_sessions_select_own"
on public.user_sessions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_sessions_insert_own" on public.user_sessions;
create policy "user_sessions_insert_own"
on public.user_sessions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_sessions_delete_own" on public.user_sessions;
create policy "user_sessions_delete_own"
on public.user_sessions
for delete
to authenticated
using (auth.uid() = user_id);

comment on table public.user_sessions is
  'One row per active login, capped at MAX_SESSIONS_PER_USER (2) by apps/web/lib/session-tracking.ts. last_seen_at is only set at insert time today (no per-request touch) — the 30-day cleanup effectively bounds on time-since-login, not true idle time.';
