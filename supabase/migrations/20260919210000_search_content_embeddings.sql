-- Cmd+K search-assist RAG index. pgvector was available on this project
-- (default_version 0.8.0) but not installed — list_extensions showed
-- installed_version null. Do not reuse `signals` or any other table.

create extension if not exists vector with schema extensions;

create table if not exists public.search_content_embeddings (
  id uuid primary key default gen_random_uuid(),
  content_key text not null unique,
  title text not null,
  url text not null,
  content text not null,
  embedding extensions.vector(256) not null,
  embedding_model text not null,
  source_kind text not null check (source_kind in ('page', 'faq')),
  content_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists search_content_embeddings_embedding_idx
  on public.search_content_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

create index if not exists search_content_embeddings_model_idx
  on public.search_content_embeddings (embedding_model);

alter table public.search_content_embeddings enable row level security;

-- Service-role only (backend indexer + /v1/search/assist). Same fail-closed
-- RLS-on / no-policies pattern as anthropic_daily_usage / service_health_events.
revoke all on table public.search_content_embeddings from anon, authenticated;

comment on table public.search_content_embeddings is
  'Small RAG index of real BBR page/FAQ copy for Cmd+K search assist. Embeddings are voyage-4-lite (256-d) when VOYAGE_API_KEY is set, else local-hash-v1. FAQ rows wait on #155.';

create or replace function public.match_search_content(
  query_embedding extensions.vector(256),
  match_threshold double precision,
  match_count integer,
  filter_model text
)
returns table (
  content_key text,
  title text,
  url text,
  content text,
  source_kind text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    s.content_key,
    s.title,
    s.url,
    s.content,
    s.source_kind,
    (1 - (s.embedding <=> query_embedding))::double precision as similarity
  from public.search_content_embeddings s
  where s.embedding_model = filter_model
    and (1 - (s.embedding <=> query_embedding)) >= match_threshold
  order by s.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 1), 5));
$$;

revoke all on function public.match_search_content(extensions.vector, double precision, integer, text)
  from public, anon, authenticated;
grant execute on function public.match_search_content(extensions.vector, double precision, integer, text)
  to service_role;

comment on function public.match_search_content(extensions.vector, double precision, integer, text) is
  'Cosine similarity lookup over search_content_embeddings for /v1/search/assist. Service-role only.';
