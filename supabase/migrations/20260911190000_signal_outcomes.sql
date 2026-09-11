-- #121 backend half — permanent, never-live-recomputed outcome tracking.
--
-- commodity_prices only retains 90 days (see retention.ts), so an /accuracy page
-- cannot recompute historical accuracy on demand — it must read stored results.
-- outcome-tracker.ts (daily worker) writes one row per (signal, asset) pair once
-- the signal is >=48h old, comparing the price at event_date to the price ~48h
-- later for every commodity_impacts asset on that signal.
create table if not exists public.signal_outcomes (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid not null references public.signals(id) on delete cascade,
  asset text not null,
  predicted_direction text not null check (predicted_direction in ('up', 'down', 'volatile', 'neutral')),
  predicted_confidence numeric,
  price_at_event numeric not null,
  price_at_checkpoint numeric not null,
  checkpoint_hours int not null default 48,
  actual_pct_change numeric not null,
  actual_direction text not null check (actual_direction in ('up', 'down', 'flat')),
  -- NULL (not scored) for 'volatile'/'neutral' predictions — only 'up'/'down'
  -- predictions are compared against actual_direction for the headline accuracy #.
  is_directionally_correct boolean,
  computed_at timestamptz not null default now(),
  unique (signal_id, asset)
);

create index if not exists signal_outcomes_signal_id_idx
  on public.signal_outcomes (signal_id);

alter table public.signal_outcomes enable row level security;

-- Public read: this table backs a public /accuracy page showing aggregate,
-- factual track-record data (no per-user scoping — it's not personal data).
-- Writes only ever happen via the service-role client in outcome-tracker.ts
-- (same convention as service_health_events / commodity_prices sync), so no
-- insert/update/delete policy is added for anon/authenticated — RLS blocks both
-- roles from writing while the service-role key bypasses RLS entirely.
drop policy if exists "signal_outcomes_select_public" on public.signal_outcomes;
create policy "signal_outcomes_select_public"
on public.signal_outcomes
for select
to anon, authenticated
using (true);

comment on table public.signal_outcomes is
  '#121 — permanent per-(signal,asset) outcome record (predicted vs actual commodity direction, checkpoint_hours after event_date). Written once by outcome-tracker.ts; never live-recomputed. Public read (aggregate/factual), service-role write only.';
