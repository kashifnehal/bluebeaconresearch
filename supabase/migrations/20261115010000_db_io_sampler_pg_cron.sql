-- 2026-11-15: already applied to production via the Supabase tool (migration name db_io_sampler_pg_cron).
-- Purpose: record write/IO counters every 5 minutes because the Supabase Free plan only keeps 24 hours
-- of its own dashboard charts, so this table is the only way to look back further than that.
-- Requires the pg_cron extension.
-- To remove: select cron.unschedule('db-io-sample'); select cron.unschedule('db-io-sample-prune');
-- then drop table public.db_io_samples;

create extension if not exists pg_cron;

create table if not exists public.db_io_samples (
  id bigint generated always as identity primary key,
  sampled_at timestamptz not null default now(),
  started_at timestamptz not null default pg_postmaster_start_time(),
  wal_bytes bigint,
  wal_fpi bigint,
  ckpt_buffers_written bigint,
  io_read_bytes bigint,
  io_write_bytes bigint,
  xact_commit bigint,
  blks_read bigint,
  blks_hit bigint,
  tup_inserted bigint,
  tup_updated bigint,
  tup_deleted bigint,
  temp_bytes bigint,
  connections integer,
  active_connections integer
);

create index if not exists db_io_samples_sampled_at_idx on public.db_io_samples (sampled_at desc);

alter table public.db_io_samples enable row level security;
revoke all on public.db_io_samples from anon, authenticated;

select cron.schedule(
  'db-io-sample',
  '*/5 * * * *',
  $$insert into public.db_io_samples
      (wal_bytes, wal_fpi, ckpt_buffers_written, io_read_bytes, io_write_bytes,
       xact_commit, blks_read, blks_hit, tup_inserted, tup_updated, tup_deleted,
       temp_bytes, connections, active_connections)
    select
      w.wal_bytes, w.wal_fpi, c.buffers_written,
      (select sum(reads * op_bytes) from pg_stat_io),
      (select sum(writes * op_bytes) from pg_stat_io),
      d.xact_commit, d.blks_read, d.blks_hit, d.tup_inserted, d.tup_updated, d.tup_deleted,
      d.temp_bytes,
      (select count(*) from pg_stat_activity where datname = current_database()),
      (select count(*) from pg_stat_activity where datname = current_database() and state = 'active')
    from pg_stat_wal w, pg_stat_checkpointer c, pg_stat_database d
    where d.datname = current_database()$$
);

select cron.schedule(
  'db-io-sample-prune',
  '15 3 * * *',
  $$delete from public.db_io_samples where sampled_at < now() - interval '14 days'$$
);
