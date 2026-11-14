-- Already applied to production 2026-11-14 (via the Supabase tool). This file makes the
-- repo match. (a) ON CONFLICT DO UPDATE ... WHERE locks every conflicting row even when
-- that WHERE evaluates false, so the daily sanctions sync (~19,563 rows, usually 0 changed)
-- dirtied the whole table and wrote ~0.7-1.9 KB of WAL per row. This filters out unchanged
-- rows before the insert so no-op rows never reach ON CONFLICT. (b) autovacuum tuning for
-- service_health_events so its high write/prune churn gets vacuumed sooner.

create or replace function public.upsert_sanctions_entities(p_rows jsonb)
returns integer
language sql
set search_path to 'public'
as $function$
  with incoming as (
    select r.name, r.list, r.source_url, r.raw_data, r.updated_at
    from jsonb_to_recordset(p_rows) as r(
      name text,
      list text,
      source_url text,
      raw_data jsonb,
      updated_at timestamptz
    )
  ),
  changed as (
    insert into public.sanctions_entities (name, list, source_url, raw_data, updated_at)
    select i.name, i.list, i.source_url, i.raw_data, i.updated_at
    from incoming i
    where not exists (
      select 1
      from public.sanctions_entities s
      where s.name = i.name
        and s.list = i.list
        and s.raw_data is not distinct from i.raw_data
        and s.source_url is not distinct from i.source_url
    )
    on conflict (name, list) do update
      set source_url = excluded.source_url,
          raw_data = excluded.raw_data,
          updated_at = excluded.updated_at
      where public.sanctions_entities.raw_data is distinct from excluded.raw_data
         or public.sanctions_entities.source_url is distinct from excluded.source_url
    returning 1
  )
  select count(*)::integer from changed;
$function$;

alter table public.service_health_events set (autovacuum_vacuum_scale_factor = 0.05, autovacuum_vacuum_threshold = 500);
