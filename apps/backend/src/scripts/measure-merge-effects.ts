/**
 * 2026-11-14 — read-only audit of what signal-merge.ts's
 * severity-never-lowers / impacts-written-once rule looks like in the last 14
 * days of signals. Writes a markdown report to scripts/out/ (git-ignored).
 * Does not write to the database and is never run against production from
 * this task — see the label below.
 *
 * "Descriptive counts, not a validation. Merge history is not stored, so
 * severity before merging is unknown." — signals only carry their current
 * severity (signal-merge.ts's escalation branch overwrites it in place); there
 * is no stored record of what severity a merged signal had before a later
 * article raised it, so this script can only describe what exists today, not
 * validate the merge rule's effect on severity over time.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { getSupabaseAdmin } from "../clients/supabase.js";
import { buildGroups, pairBelongsTogether, type ThreadSignal } from "../lib/story-threads.js";

const LOOKBACK_DAYS = 14;
const PAGE_SIZE = 1000;
const OUT_DIR = new URL("./out/", import.meta.url);
const OUT_PATH = new URL("./merge-effects-report.md", OUT_DIR);

export type CommodityImpact = { asset: string; direction: string };

export type MergeEffectsSignalRow = {
  id: string;
  created_at: string;
  event_category: string | null;
  severity: number;
  sources_count: number | null;
  raw_event_ids: string[] | null;
  commodity_impacts: unknown;
  title: string | null;
  summary: string | null;
};

/** Only well-formed { asset: string, direction: string } entries count. */
export function parseCommodityImpacts(impacts: unknown): CommodityImpact[] {
  if (!Array.isArray(impacts)) return [];
  const out: CommodityImpact[] = [];
  for (const item of impacts) {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as { asset?: unknown }).asset === "string" &&
      typeof (item as { direction?: unknown }).direction === "string"
    ) {
      out.push({
        asset: (item as { asset: string }).asset,
        direction: (item as { direction: string }).direction,
      });
    }
  }
  return out;
}

// ── (a) per day: signals created; signals with sources_count > 1 ───────────

export type PerDayRow = { day: string; signalsCreated: number; signalsMultiSource: number };

export function computePerDay(rows: MergeEffectsSignalRow[]): PerDayRow[] {
  const map = new Map<string, { total: number; multi: number }>();
  for (const row of rows) {
    const day = row.created_at.slice(0, 10);
    const entry = map.get(day) ?? { total: 0, multi: 0 };
    entry.total += 1;
    if ((row.sources_count ?? 1) > 1) entry.multi += 1;
    map.set(day, entry);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, v]) => ({ day, signalsCreated: v.total, signalsMultiSource: v.multi }));
}

// ── (b) severity distribution for sources_count = 1 vs > 1 ─────────────────

export type SeverityDistributionGroup = {
  counts: Record<number, number>;
  total: number;
  shareSevereOrAbove: number;
};

function buildSeverityGroup(rows: MergeEffectsSignalRow[]): SeverityDistributionGroup {
  const counts: Record<number, number> = {};
  for (let s = 1; s <= 10; s++) counts[s] = 0;
  let severeCount = 0;
  for (const row of rows) {
    const sev = Math.min(10, Math.max(1, Math.round(row.severity)));
    counts[sev] = (counts[sev] ?? 0) + 1;
    if (row.severity >= 7) severeCount += 1;
  }
  return {
    counts,
    total: rows.length,
    shareSevereOrAbove: rows.length === 0 ? 0 : severeCount / rows.length,
  };
}

export function computeSeverityDistribution(rows: MergeEffectsSignalRow[]): {
  singleSource: SeverityDistributionGroup;
  multiSource: SeverityDistributionGroup;
} {
  return {
    singleSource: buildSeverityGroup(rows.filter((r) => (r.sources_count ?? 1) === 1)),
    multiSource: buildSeverityGroup(rows.filter((r) => (r.sources_count ?? 1) > 1)),
  };
}

// ── (c) story groups (buildGroups/jaccard from story-threads.ts) ───────────

export type StoryGroupStats = {
  totalGroups: number;
  groupsSize2Plus: number;
  conflictingDirectionGroups: number;
};

export function computeStoryGroupStats(rows: MergeEffectsSignalRow[]): StoryGroupStats {
  const signals: ThreadSignal[] = rows.map((row) => ({
    id: row.id,
    title: row.title ?? "",
    event_category: row.event_category,
    symbols: parseCommodityImpacts(row.commodity_impacts).map((i) => i.asset),
    created_at: row.created_at,
  }));
  const impactsById = new Map(rows.map((row) => [row.id, parseCommodityImpacts(row.commodity_impacts)]));

  const groups = buildGroups(signals, pairBelongsTogether);
  const size2Plus = groups.filter((g) => g.length >= 2);

  let conflicting = 0;
  for (const group of size2Plus) {
    let hasConflict = false;
    outer: for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const impactsA = impactsById.get(group[i].id) ?? [];
        const impactsB = impactsById.get(group[j].id) ?? [];
        for (const a of impactsA) {
          for (const b of impactsB) {
            if (
              a.asset === b.asset &&
              ((a.direction === "up" && b.direction === "down") ||
                (a.direction === "down" && b.direction === "up"))
            ) {
              hasConflict = true;
              break outer;
            }
          }
        }
      }
    }
    if (hasConflict) conflicting += 1;
  }

  return {
    totalGroups: groups.length,
    groupsSize2Plus: size2Plus.length,
    conflictingDirectionGroups: conflicting,
  };
}

// ── (d) per asset: direction counts ─────────────────────────────────────────

export type DirectionCounts = { up: number; down: number; volatile: number; neutral: number };

export function computeDirectionCountsByAsset(rows: MergeEffectsSignalRow[]): Map<string, DirectionCounts> {
  const map = new Map<string, DirectionCounts>();
  for (const row of rows) {
    for (const impact of parseCommodityImpacts(row.commodity_impacts)) {
      const entry = map.get(impact.asset) ?? { up: 0, down: 0, volatile: 0, neutral: 0 };
      if (
        impact.direction === "up" ||
        impact.direction === "down" ||
        impact.direction === "volatile" ||
        impact.direction === "neutral"
      ) {
        entry[impact.direction] += 1;
      }
      map.set(impact.asset, entry);
    }
  }
  return map;
}

// ── Report rendering ────────────────────────────────────────────────────────

function renderSeverityTable(label: string, group: SeverityDistributionGroup): string {
  const lines = [`### ${label} (n=${group.total})`, ``, `| severity | count |`, `| --- | --- |`];
  for (let s = 1; s <= 10; s++) {
    lines.push(`| ${s} | ${group.counts[s] ?? 0} |`);
  }
  lines.push(``, `share severity >= 7: ${(group.shareSevereOrAbove * 100).toFixed(1)}%`, ``);
  return lines.join("\n");
}

export function renderReport(rows: MergeEffectsSignalRow[]): string {
  const perDay = computePerDay(rows);
  const severity = computeSeverityDistribution(rows);
  const storyGroups = computeStoryGroupStats(rows);
  const directionCounts = computeDirectionCountsByAsset(rows);

  const header = [
    `# Signal-merge effects: descriptive counts, last ${LOOKBACK_DAYS} days`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    `Signals in window: ${rows.length}`,
    ``,
    `**Descriptive counts, not a validation. Merge history is not stored, so severity before merging is unknown.**`,
    ``,
  ].join("\n");

  const perDaySection = [
    `## (a) Per day`,
    ``,
    `| day | signals created | signals with sources_count > 1 |`,
    `| --- | --- | --- |`,
    ...perDay.map((r) => `| ${r.day} | ${r.signalsCreated} | ${r.signalsMultiSource} |`),
    ``,
  ].join("\n");

  const severitySection = [
    `## (b) Severity distribution: sources_count = 1 vs > 1`,
    ``,
    renderSeverityTable("sources_count = 1", severity.singleSource),
    renderSeverityTable("sources_count > 1", severity.multiSource),
  ].join("\n");

  const storyGroupSection = [
    `## (c) Story groups (story-threads.ts buildGroups/jaccard)`,
    ``,
    `- total groups: ${storyGroups.totalGroups}`,
    `- groups with 2+ signals: ${storyGroups.groupsSize2Plus}`,
    `- groups of 2+ where two signals name the same asset with opposite directions (up vs down): ${storyGroups.conflictingDirectionGroups}`,
    ``,
  ].join("\n");

  const directionRows = [...directionCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const directionSection = [
    `## (d) Per asset: direction counts`,
    ``,
    `| asset | up | down | volatile | neutral |`,
    `| --- | --- | --- | --- | --- |`,
    ...directionRows.map(
      ([asset, c]) => `| ${asset} | ${c.up} | ${c.down} | ${c.volatile} | ${c.neutral} |`,
    ),
    ``,
  ].join("\n");

  return [header, perDaySection, severitySection, storyGroupSection, directionSection].join("\n");
}

async function loadRecentSignals(): Promise<MergeEffectsSignalRow[]> {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rows: MergeEffectsSignalRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("signals")
      .select("id, created_at, event_category, severity, sources_count, raw_event_ids, commodity_impacts, title, summary")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as MergeEffectsSignalRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

export async function measureMergeEffects() {
  const rows = await loadRecentSignals();
  const report = renderReport(rows);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, report, "utf8");

  console.log(`signals in window: ${rows.length}`);
  console.log(`report written to ${OUT_PATH.pathname}`);

  return rows;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  measureMergeEffects().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
