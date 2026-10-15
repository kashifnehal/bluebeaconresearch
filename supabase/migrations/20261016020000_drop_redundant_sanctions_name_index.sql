-- The unique index on (name, list) already serves lookups by name.
-- The single-column index was never used and costs a write on every sanctions row change.
drop index if exists public.idx_sanctions_entities_name;
