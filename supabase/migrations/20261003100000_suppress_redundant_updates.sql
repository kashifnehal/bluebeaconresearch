-- W7-IO-FIX-v2 — sanctions_entities has ~502k lifetime updates for ~19.5k rows
-- (~26 full-table rewrites), because runSanctionsSyncOnce()'s upsert() writes a
-- new row version every run even when OFAC's SDN list hasn't actually changed
-- (updated_at alone always differs). This is a general write-suppression guard,
-- not sanctions-specific logic: if none of the meaningful columns (name, list,
-- source_url, raw_data, added_at) actually changed, cancel the update entirely
-- instead of writing a no-op new row version. Named with a leading "z" so it
-- fires after any other BEFORE UPDATE trigger on this table, per Postgres's
-- alphabetical-by-name trigger firing order within the same timing/event.
--
-- added_at (date, nullable, see 20260101000002_sanctions.sql) is included below
-- (W8-LAND-IO-FIX) so a real change to that column alone is not silently
-- suppressed as a no-op.
--
-- NOT applied by this task — see W7-IO-FIX-v2 report / LIVE_TODO.md.

create or replace function public.suppress_redundant_updates_trigger()
returns trigger
language plpgsql
as $$
begin
  if new.name is distinct from old.name
     or new.list is distinct from old.list
     or new.source_url is distinct from old.source_url
     or new.raw_data is distinct from old.raw_data
     or new.added_at is distinct from old.added_at
  then
    return new;
  end if;

  -- No meaningful column changed (only updated_at would differ) — cancel the
  -- update outright so no new row version is written.
  return null;
end;
$$;

comment on function public.suppress_redundant_updates_trigger() is
  'W7-IO-FIX-v2/W8-LAND-IO-FIX: BEFORE UPDATE guard that cancels the update (returns null) when name/list/source_url/raw_data/added_at are unchanged, so a same-data re-sync (e.g. sanctions_entities daily upsert) does not write a redundant row version just to bump updated_at.';

drop trigger if exists z_min_update_sanctions on public.sanctions_entities;

create trigger z_min_update_sanctions
  before update on public.sanctions_entities
  for each row
  execute function public.suppress_redundant_updates_trigger();
