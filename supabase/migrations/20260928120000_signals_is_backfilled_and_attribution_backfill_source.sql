-- Chart attribution backfill (Phase 2 of #207/#228, cb12e82/dc7dc45). When the
-- DB-first attribution lookup finds nothing, apps/backend queries GDELT's own
-- historical archive for the clicked window and classifies the top candidates,
-- writing through the normal raw_events -> materiality gate -> signals path.

-- Tags the retroactively-discovered raw_events rows distinctly from the live
-- collectors (gdelt/acled/newsapi/gnews/manual/rss).
alter table raw_events
  drop constraint if exists raw_events_source_check;

alter table raw_events
  add constraint raw_events_source_check
  check (source in ('gdelt', 'acled', 'newsapi', 'gnews', 'manual', 'rss', 'chart-attribution-backfill'));

-- Marks a signal as retroactively discovered rather than caught by a live collector
-- run. Founder decision 2026-09-28 (session live decision, no prior doc existed for
-- it despite a task prompt citing one — see 10_DECISIONS.md): backfilled rows still
-- appear in the ordinary feed and in chart attribution, but are excluded from
-- new-signal alert dispatch (see signal-merge.ts / chart-attribution-backfill.service.ts)
-- so a user isn't pushed a "new" alert about a week-old event.
alter table signals
  add column if not exists is_backfilled boolean not null default false;
