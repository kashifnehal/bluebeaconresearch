-- 2026-11-09 — Supabase advisor: function_search_path_mutable
-- Pins search_path on the two functions the advisor flagged:
-- internal_ops.set_updated_at and public.suppress_redundant_updates_trigger.
-- WRITTEN, NOT APPLIED — review only, apply on founder go-ahead.
-- No trigger is changed by this migration.

-- public.suppress_redundant_updates_trigger: current body only reads/writes
-- NEW/OLD record fields (new.name, old.name, etc.) — no schema object
-- references at all, qualified or not — so no rewrite is needed. Pinning an
-- empty search_path is a plain ALTER.
alter function public.suppress_redundant_updates_trigger() set search_path = '';

-- internal_ops.set_updated_at: current body calls unqualified now(). Rewritten
-- here to call pg_catalog.now() explicitly so the function does not rely on
-- the implicit pg_catalog search-path entry once search_path is pinned empty.
create or replace function internal_ops.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;
