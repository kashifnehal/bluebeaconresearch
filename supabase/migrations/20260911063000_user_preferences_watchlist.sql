-- Watchlist server persist — user_preferences is the source of truth.
--
-- #107 stored the list in localStorage only. A cleared cache or a new device
-- then re-seeded the generic 8 and dropped any user edits. These columns hold
-- the same list the watchlist page already wrote locally.
--
-- Purely additive. NULL watchlist_symbols means "never persisted" (first-visit
-- seed still runs). An empty array means the user cleared the list — do not
-- re-seed. Does not touch commodities / forex_pairs / regions (those stay the
-- onboarding "what I follow" prefs that seed the first-visit suggestion).

alter table public.user_preferences
  add column if not exists watchlist_symbols text[],
  add column if not exists watchlist_suggested boolean not null default false;

comment on column public.user_preferences.watchlist_symbols is
  'User-edited watchlist (commodities ∪ forex). NULL = never persisted; empty array = user cleared the list. Source of truth over the localStorage cache.';

comment on column public.user_preferences.watchlist_suggested is
  'True while the watchlist is still the first-visit suggested seed (onboarding prefs, or the generic 8). Set false on the first add/remove.';
