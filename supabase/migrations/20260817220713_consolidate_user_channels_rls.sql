-- Migration 012: Consolidate user_channels RLS policies (Security Advisor
-- "Multiple Permissive Policies"). All 4 existing policies use identical
-- logic; user_channels_all_own (FOR ALL) already covers every action, so
-- the other 3 are pure redundancy. No access-logic change.

drop policy if exists "user_channels_select_own" on public.user_channels;
drop policy if exists "user_channels_upsert_own" on public.user_channels;
drop policy if exists "user_channels_update_own" on public.user_channels;

drop policy if exists "user_channels_all_own" on public.user_channels;
create policy "user_channels_all_own"
on public.user_channels
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
