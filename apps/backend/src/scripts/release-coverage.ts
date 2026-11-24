/**
 * TASK NQW3-FILTER1 Part 9 — read-only (SELECT only) release-coverage report.
 * Written 2026-11-24 in response to real evidence (checked against official
 * sources, 2026-11-24): BBR missed the Bank of Japan rate rise of
 * 2026-09-18 (no raw item stored) and the Bank of England rise of 2026-11-05
 * (2 raw items stored, no signal). US releases were slow: September CPI
 * reached a signal 694 minutes after the 08:30 ET release; October PPI about
 * 41 hours after.
 *
 * Scheduled-release source: `apps/backend/src/data/economic-calendar.json`
 * (the static, manually-curated calendar `apps/web`'s own Calendar page and
 * `week-ahead.ts` both already read — see `data/economic-calendar.json`'s
 * own `_meta.description` for its sourcing). That file does NOT contain any
 * Bank of England or US PPI (Producer Price Index) entries at all — checked
 * directly, not assumed (see `hasStoredSchedule` below). This report is
 * built entirely from what IS stored: it never invents a release date for
 * BoE or PPI. Where neither release has a scheduled instance in the window,
 * the table says so explicitly rather than silently omitting the row.
 *
 * Never writes to the database. Never calls any external API.
 *
 * Usage (from apps/backend):
 *   pnpm report:release-coverage                  # default --since = 30 days ago
 *   pnpm report:release-coverage --since 2026-10-01
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getSupabaseAdmin } from "../clients/supabase.js";

const CALENDAR_PATH = fileURLToPath(new URL("../data/economic-calendar.json", import.meta.url));
const OUTPUT_PATH = fileURLToPath(new URL("../../.tmp/release-coverage.md", import.meta.url));
// How long after the scheduled release time to look for a raw item / signal.
const COVERAGE_WINDOW_HOURS = 48;

// ── CLI args ────────────────────────────────────────────────────────────

export function parseReleaseCoverageArgs(args: string[], now: Date = new Date()): { sinceIso: string } {
  const idx = args.findIndex((a) => a === "--since" || a.startsWith("--since="));
  let sinceRaw: string | undefined;
  if (idx !== -1) {
    const arg = args[idx];
    sinceRaw = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : args[idx + 1];
  }
  if (sinceRaw) {
    const parsed = new Date(sinceRaw);
    if (!Number.isNaN(parsed.getTime())) return { sinceIso: parsed.toISOString() };
  }
  const defaultSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { sinceIso: defaultSince.toISOString() };
}

// ── Calendar reading ────────────────────────────────────────────────────

export type CalendarEvent = {
  id: string;
  date: string;
  time: string | null;
  event: string;
};

export function loadCalendarEvents(path: string = CALENDAR_PATH): CalendarEvent[] {
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as { events?: unknown };
    if (!Array.isArray(parsed.events)) return [];
    return parsed.events as CalendarEvent[];
  } catch {
    return [];
  }
}

/** Combines a calendar row's date + time (both UTC, per the file's own convention) into one ISO instant. Null time defaults to 00:00 UTC. */
export function calendarEventIso(ev: Pick<CalendarEvent, "date" | "time">): string | null {
  if (!ev.date) return null;
  const time = ev.time ?? "00:00";
  const iso = `${ev.date}T${time}:00Z`;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? iso : null;
}

// ── Release definitions ────────────────────────────────────────────────
// Each release the task names (Fed, ECB, BoE, BoJ, RBI, BLS CPI, PPI, EIA
// weekly), as its own constant: `calendarEventMatch` finds this release's
// scheduled instances in economic-calendar.json's `event` field;
// `titleKeywords` finds raw_events/signals whose title names this release.

/** Fed/FOMC interest rate decisions. */
export const RELEASE_FOMC = {
  name: "Federal Reserve (FOMC)",
  calendarEventMatch: /FOMC/i,
  titleKeywords: ["FOMC", "Federal Reserve", "Fed "],
};

/** ECB Governing Council rate decisions. */
export const RELEASE_ECB = {
  name: "European Central Bank (ECB)",
  calendarEventMatch: /ECB/i,
  titleKeywords: ["ECB", "European Central Bank"],
};

/** Bank of England — NOT in economic-calendar.json (checked, zero rows match this pattern). */
export const RELEASE_BOE = {
  name: "Bank of England (BoE)",
  calendarEventMatch: /Bank of England|\bBoE\b/i,
  titleKeywords: ["Bank of England", "BoE"],
};

/** Bank of Japan monetary policy statements. */
export const RELEASE_BOJ = {
  name: "Bank of Japan (BoJ)",
  calendarEventMatch: /BOJ|Bank of Japan/i,
  titleKeywords: ["Bank of Japan", "BOJ"],
};

/** Reserve Bank of India MPC decisions. */
export const RELEASE_RBI = {
  name: "Reserve Bank of India (RBI)",
  calendarEventMatch: /RBI/i,
  titleKeywords: ["Reserve Bank of India", "RBI"],
};

/** US Bureau of Labor Statistics Consumer Price Index. */
export const RELEASE_CPI = {
  name: "US CPI (BLS)",
  calendarEventMatch: /Consumer Price Index/i,
  titleKeywords: ["Consumer Price Index", "CPI"],
};

/** US Bureau of Labor Statistics Producer Price Index — NOT in economic-calendar.json (checked, zero rows match this pattern). */
export const RELEASE_PPI = {
  name: "US PPI (BLS)",
  calendarEventMatch: /Producer Price Index|\bPPI\b/i,
  titleKeywords: ["Producer Price Index", "PPI"],
};

/** EIA Weekly Petroleum Status Report. */
export const RELEASE_EIA_WEEKLY = {
  name: "EIA Weekly Petroleum Status Report",
  calendarEventMatch: /EIA Weekly Petroleum/i,
  titleKeywords: ["Petroleum Status Report", "EIA"],
};

export const RELEASES = [
  RELEASE_FOMC,
  RELEASE_ECB,
  RELEASE_BOE,
  RELEASE_BOJ,
  RELEASE_RBI,
  RELEASE_CPI,
  RELEASE_PPI,
  RELEASE_EIA_WEEKLY,
];

export type ReleaseDef = (typeof RELEASES)[number];

/** True when at least one calendar row (any date) matches this release — distinguishes "none scheduled in this window" from "not in stored data at all". */
export function hasStoredSchedule(release: ReleaseDef, allEvents: CalendarEvent[]): boolean {
  return allEvents.some((ev) => release.calendarEventMatch.test(ev.event));
}

/** Scheduled instances of this release within [sinceIso, now], sorted earliest-first. */
export function scheduledInstancesInWindow(
  release: ReleaseDef,
  allEvents: CalendarEvent[],
  sinceIso: string,
  nowIso: string,
): Array<{ scheduledAtIso: string; label: string }> {
  const sinceMs = new Date(sinceIso).getTime();
  const nowMs = new Date(nowIso).getTime();
  const out: Array<{ scheduledAtIso: string; label: string }> = [];
  for (const ev of allEvents) {
    if (!release.calendarEventMatch.test(ev.event)) continue;
    const iso = calendarEventIso(ev);
    if (!iso) continue;
    const t = new Date(iso).getTime();
    if (t < sinceMs || t > nowMs) continue;
    out.push({ scheduledAtIso: iso, label: ev.event });
  }
  return out.sort((a, b) => new Date(a.scheduledAtIso).getTime() - new Date(b.scheduledAtIso).getTime());
}

// ── Matching + minutes calculation (tested with fixed data) ──────────────

export type TitledRow = { title: string | null; created_at: string };

/** Case-insensitive substring match against any of the release's titleKeywords. */
export function titleMatchesRelease(title: string | null | undefined, release: ReleaseDef): boolean {
  if (!title) return false;
  const lower = title.toLowerCase();
  return release.titleKeywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/** Earliest row (by created_at) from `rows` whose title matches `release` and whose created_at is within [scheduledAtIso, scheduledAtIso + windowHours]. Null if none. */
export function earliestMatchInWindow(
  rows: TitledRow[],
  release: ReleaseDef,
  scheduledAtIso: string,
  windowHours: number = COVERAGE_WINDOW_HOURS,
): TitledRow | null {
  const scheduledMs = new Date(scheduledAtIso).getTime();
  const endMs = scheduledMs + windowHours * 3_600_000;
  let best: TitledRow | null = null;
  let bestMs = Infinity;
  for (const row of rows) {
    if (!titleMatchesRelease(row.title, release)) continue;
    const t = new Date(row.created_at).getTime();
    if (!Number.isFinite(t) || t < scheduledMs || t > endMs) continue;
    if (t < bestMs) {
      bestMs = t;
      best = row;
    }
  }
  return best;
}

/** Whole minutes from the scheduled release time to `row.created_at`. Negative never happens by construction (earliestMatchInWindow already excludes earlier rows); exported for direct testing anyway. */
export function minutesFromRelease(scheduledAtIso: string, row: TitledRow): number {
  const scheduledMs = new Date(scheduledAtIso).getTime();
  const rowMs = new Date(row.created_at).getTime();
  return Math.round((rowMs - scheduledMs) / 60_000);
}

// ── Markdown rendering ──────────────────────────────────────────────────

export type CoverageRow = {
  release: string;
  scheduledAtIso: string | null;
  scheduledLabel: string | null;
  firstRawEventIso: string | null;
  firstSignalIso: string | null;
  minutesToRaw: number | null;
  minutesToSignal: number | null;
  note: string | null;
};

export function renderReleaseCoverageMarkdown(rows: CoverageRow[], generatedAtIso: string, sinceIso: string): string {
  const lines = [
    "# Release coverage report",
    "",
    `Generated: ${generatedAtIso}`,
    `Since: ${sinceIso}`,
    `Read-only. Scheduled-release source: apps/backend/src/data/economic-calendar.json. Coverage window: ${COVERAGE_WINDOW_HOURS}h from the scheduled release time. "none" means no raw_events/signals row with a matching title was found in that window.`,
    "",
    "| Release | Scheduled (UTC) | First raw item | Minutes to raw | First signal | Minutes to signal |",
    "|---|---|---|---|---|---|",
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.release} | ${r.scheduledAtIso ?? r.note ?? "none scheduled in window"} | ${r.firstRawEventIso ?? "none"} | ${r.minutesToRaw ?? "—"} | ${r.firstSignalIso ?? "none"} | ${r.minutesToSignal ?? "—"} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

// ── IO (SELECT only) ────────────────────────────────────────────────────

async function fetchTitledRows(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: "raw_events" | "signals",
  sinceIso: string,
): Promise<TitledRow[]> {
  const PAGE_SIZE = 1000;
  const rows: TitledRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select("title, created_at")
      .gte("created_at", sinceIso)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table} select failed: ${error.message}`);
    const page = (data ?? []) as TitledRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

// ── Entry point ──────────────────────────────────────────────────────────

export async function reportReleaseCoverage(argv: string[]): Promise<void> {
  const { sinceIso } = parseReleaseCoverageArgs(argv);
  const nowIso = new Date().toISOString();
  const allEvents = loadCalendarEvents();
  const supabase = getSupabaseAdmin();
  const [rawEvents, signals] = await Promise.all([
    fetchTitledRows(supabase, "raw_events", sinceIso),
    fetchTitledRows(supabase, "signals", sinceIso),
  ]);

  const coverageRows: CoverageRow[] = [];
  for (const release of RELEASES) {
    const instances = scheduledInstancesInWindow(release, allEvents, sinceIso, nowIso);
    if (instances.length === 0) {
      coverageRows.push({
        release: release.name,
        scheduledAtIso: null,
        scheduledLabel: null,
        firstRawEventIso: null,
        firstSignalIso: null,
        minutesToRaw: null,
        minutesToSignal: null,
        note: hasStoredSchedule(release, allEvents)
          ? "none scheduled in window"
          : "not in stored calendar data (no BoE/PPI rows in economic-calendar.json)",
      });
      continue;
    }
    for (const instance of instances) {
      const firstRaw = earliestMatchInWindow(rawEvents, release, instance.scheduledAtIso);
      const firstSignal = earliestMatchInWindow(signals, release, instance.scheduledAtIso);
      coverageRows.push({
        release: release.name,
        scheduledAtIso: instance.scheduledAtIso,
        scheduledLabel: instance.label,
        firstRawEventIso: firstRaw?.created_at ?? null,
        firstSignalIso: firstSignal?.created_at ?? null,
        minutesToRaw: firstRaw ? minutesFromRelease(instance.scheduledAtIso, firstRaw) : null,
        minutesToSignal: firstSignal ? minutesFromRelease(instance.scheduledAtIso, firstSignal) : null,
        note: null,
      });
    }
  }

  const report = renderReleaseCoverageMarkdown(coverageRows, new Date().toISOString(), sinceIso);
  mkdirSync(new URL("../../.tmp/", import.meta.url), { recursive: true });
  writeFileSync(OUTPUT_PATH, report, "utf8");

  console.log(`[release-coverage] since=${sinceIso} rows=${coverageRows.length}`);
  console.log(`[release-coverage] wrote ${OUTPUT_PATH}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  reportReleaseCoverage(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
