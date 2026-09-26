-- claude/237 (BBR Claude Project): rss-collector.ts was writing source: "newsapi"
-- for its own rows (mislabeled — 'newsapi' is GNews's ingest path), making RSS
-- and GNews rows indistinguishable in raw_events.source. Add 'rss' as its own
-- value alongside the existing set.
alter table raw_events
  drop constraint if exists raw_events_source_check;

alter table raw_events
  add constraint raw_events_source_check
  check (source in ('gdelt', 'acled', 'newsapi', 'gnews', 'manual', 'rss'));
