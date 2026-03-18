-- Phase 8: sanctions reference table (bootstrap)

create table if not exists public.sanctions_entities (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  list text not null,
  source_url text,
  added_at date,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(name, list)
);

create index if not exists idx_sanctions_entities_name on public.sanctions_entities (name);

