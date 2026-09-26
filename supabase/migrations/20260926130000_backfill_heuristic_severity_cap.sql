-- Backlog #240: backfill the severity-6 cap for pre-existing heuristic rows.
-- heuristicClassify() has capped new heuristic classifications at severity 6
-- since 2026-09-12 (see the comment above `severity = Math.min(severity, 6)`
-- in apps/backend/src/services/claude.service.ts — two confirmed keyword-only
-- false positives, e.g. a military-radar permitting story scored severity 8
-- purely for matching "military"). That fix was never backfilled to rows
-- classified before the cap existed. is_breaking is derived from
-- `severity >= 8` at write time, so any row being capped down to 6 must also
-- lose its is_breaking flag.
update signals
set severity = 6,
    is_breaking = false
where classification_method = 'heuristic'
  and severity > 6;

-- raw_events has no severity/materiality score column of its own (only a
-- `materiality_checked_at` timestamp marker added in
-- 20260926053739_raw_events_materiality_checked_at.sql) — nothing to cap there.
