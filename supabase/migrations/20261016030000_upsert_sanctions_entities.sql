-- Daily sanctions sync used to rewrite every row. This writes a row only when
-- raw_data or source_url actually differs. Written 2026-10-16. Not applied here.
create or replace function public.upsert_sanctions_entities(p_rows jsonb)
returns integer
language sql
security invoker
set search_path = public
as $$
  with changed as (
    insert into public.sanctions_entities (name, list, source_url, raw_data, updated_at)
    select r.name, r.list, r.source_url, r.raw_data, r.updated_at
    from jsonb_to_recordset(p_rows) as r(
      name text,
      list text,
      source_url text,
      raw_data jsonb,
      updated_at timestamptz
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
$$;

revoke all on function public.upsert_sanctions_entities(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_sanctions_entities(jsonb) to service_role;
