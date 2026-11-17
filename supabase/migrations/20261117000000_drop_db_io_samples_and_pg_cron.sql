-- Applied to production on 2026-11-17 via the Supabase tool; the sampler jobs were already
-- unscheduled; the table had 52 rows.
drop table if exists public.db_io_samples;
drop extension if exists pg_cron;
