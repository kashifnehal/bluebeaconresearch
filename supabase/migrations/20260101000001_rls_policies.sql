-- Phase 2: Row Level Security policies (Supabase)

-- Enable RLS
alter table if exists public.profiles enable row level security;
alter table if exists public.user_preferences enable row level security;
alter table if exists public.alert_rules enable row level security;
alter table if exists public.watchlist_entries enable row level security;
alter table if exists public.saved_signals enable row level security;
alter table if exists public.api_keys enable row level security;
alter table if exists public.signals enable row level security;
alter table if exists public.commodity_prices enable row level security;
alter table if exists public.user_channels enable row level security;

-- profiles: users can only read/update their own profile
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- user_preferences: users can only read/update their own
drop policy if exists "user_preferences_select_own" on public.user_preferences;
create policy "user_preferences_select_own"
on public.user_preferences
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "user_preferences_upsert_own" on public.user_preferences;
create policy "user_preferences_upsert_own"
on public.user_preferences
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "user_preferences_update_own" on public.user_preferences;
create policy "user_preferences_update_own"
on public.user_preferences
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- alert_rules: users can only CRUD their own
drop policy if exists "alert_rules_crud_own" on public.alert_rules;
create policy "alert_rules_crud_own"
on public.alert_rules
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- watchlist_entries: users can only CRUD their own
drop policy if exists "watchlist_entries_crud_own" on public.watchlist_entries;
create policy "watchlist_entries_crud_own"
on public.watchlist_entries
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- saved_signals: users can only CRUD their own
drop policy if exists "saved_signals_crud_own" on public.saved_signals;
create policy "saved_signals_crud_own"
on public.saved_signals
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- api_keys: users can only CRUD their own
drop policy if exists "api_keys_crud_own" on public.api_keys;
create policy "api_keys_crud_own"
on public.api_keys
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- signals: all authenticated users can read
drop policy if exists "signals_select_authenticated" on public.signals;
create policy "signals_select_authenticated"
on public.signals
for select
to authenticated
using (true);

-- commodity_prices: all authenticated users can read
drop policy if exists "commodity_prices_select_authenticated" on public.commodity_prices;
create policy "commodity_prices_select_authenticated"
on public.commodity_prices
for select
to authenticated
using (true);

-- user_channels: users can only read/update their own
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

