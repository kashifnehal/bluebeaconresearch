import { recordServiceHealth, type RecordServiceHealthOptions } from "./service-health.js";

// Weekly counts for the materiality gate. No pass-rate target and no alarm.
// A week with zero judged rows still writes the row.
//
// raw_events.materiality_checked_at is stamped on gate rejections and on
// prefilter skips, not on passes. Passed is the number of signals created in
// the window (signals.created_at) that were made from at least one raw event.
// Rejected is raw events whose materiality_checked_at falls in the window and
// that match a service_health_events row with service "materiality_gate" and
// status "rejected". logMaterialityRejection writes that row and stamps the
// column. A prefilter skip stamps the column and writes no health row, so it
// is not a rejection. Each health row matches at most one raw event: by
// raw_event_id when that column is present, otherwise by the title stored on
// the row. Judged is passed plus rejected. Pass rate is passed / judged, and
// is null when judged is 0.
//
// Own data, 2026-10-07 to 2026-10-10: signals divided by gate-checked rows ran
// 13.7% to 21.6%. That span is a reference only, not a threshold. There is no
// outside source for a pass-rate cutoff, so this report does not label any value.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SAMPLE_SIZE = 20;
const TITLE_MAX = 120;
const PAGE = 200;

// Working choice, not a researched value: retry a statement-timeout (Postgres
// 57014) exactly once, 5 minutes later, in case it was transient contention
// from another job running at the same time on the small Free-plan database.
// Any other error is not retried.
export const STATEMENT_TIMEOUT_RETRY_DELAY_MS = 5 * 60 * 1000;

export type Sleep = (ms: number) => Promise<void>;
const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function isStatementTimeoutError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "57014") return true;
  return typeof error.message === "string" && error.message.toLowerCase().includes("statement timeout");
}

export async function withStatementTimeoutRetry<T>(
  label: string,
  run: () => PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>,
  sleep: Sleep,
): Promise<{ data: T | null; error: { code?: string; message?: string } | null }> {
  const first = await run();
  if (!first.error || !isStatementTimeoutError(first.error)) return first;
  await sleep(STATEMENT_TIMEOUT_RETRY_DELAY_MS);
  const second = await run();
  if (second.error && isStatementTimeoutError(second.error)) {
    console.warn(`[gate-drift] ${label}: statement timeout persisted after one retry — skipping this week's report`);
  }
  return second;
}

export const GATE_PASS_RATE_DEFINITION =
  "Passed is the number of signals created in the window that were made from at least one raw event. Rejected is the number of raw events with materiality_checked_at in the window that match a materiality_gate rejected health row. A prefilter skip stamps that column and writes no health row, so it is not counted. Judged is passed plus rejected. Pass rate is passed divided by judged, or null when judged is 0.";

export type GateDriftSupabase = {
  from: (table: string) => any;
};

export type GateWeekNumbers = {
  judged: number;
  passed: number;
  rejected: number;
  passRate: number | null;
  passByCategory: Record<string, number>;
};

export type GateWeeklyReport = {
  definition: string;
  weekEnd: string;
  currentStart: string;
  previousStart: string;
  current: GateWeekNumbers;
  previous: GateWeekNumbers;
  difference: {
    judged: number;
    passed: number;
    rejected: number;
    passRate: number | null;
  };
  rejectedSample: Array<{ title: string; reason: string }>;
};

type JudgedRow = { id: string; title: string | null };
type SignalRow = { raw_event_ids: string[] | null; event_category: string | null };
type ReasonRow = { detail: string | null; raw_event_id?: string | null };

function emptyWeek(): GateWeekNumbers {
  return { judged: 0, passed: 0, rejected: 0, passRate: null, passByCategory: {} };
}

function sampleItems<T>(items: T[], n: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j] as T;
    copy[j] = swap as T;
  }
  return copy.slice(0, n);
}

function reasonForTitle(title: string, rows: ReasonRow[]): string {
  const needle = title.slice(0, 200);
  const hit = rows.find((row) => (row.detail ?? "").includes(needle));
  if (!hit?.detail) return "";
  const match = /reasoning="([^"]*)"/.exec(hit.detail);
  return match?.[1] ?? "";
}

function titleInDetail(detail: string | null | undefined): string | null {
  if (!detail) return null;
  const match = /title="([^"]*)"/.exec(detail);
  return match?.[1] ?? null;
}

function missingRawEventIdColumn(error: { message?: string; code?: string }): boolean {
  const message = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return (
    message.includes("raw_event_id") &&
    (message.includes("column") || message.includes("schema cache") || message.includes("pgrst204"))
  );
}

function hasRawEvents(ids: string[] | null | undefined): boolean {
  return Array.isArray(ids) && ids.length > 0;
}

async function checkedIn(
  supabase: GateDriftSupabase,
  start: Date,
  end: Date,
  sleep: Sleep,
): Promise<JudgedRow[]> {
  const { data, error } = await withStatementTimeoutRetry(
    "raw_events read",
    () =>
      supabase
        .from("raw_events")
        .select("id, title")
        .gte("materiality_checked_at", start.toISOString())
        .lt("materiality_checked_at", end.toISOString()),
    sleep,
  );
  if (error) throw new Error(error.message ?? "raw_events read failed");
  return (data ?? []) as JudgedRow[];
}

async function signalsIn(
  supabase: GateDriftSupabase,
  start: Date,
  end: Date,
  sleep: Sleep,
): Promise<SignalRow[]> {
  const out: SignalRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await withStatementTimeoutRetry(
      "signals read",
      () =>
        supabase
          .from("signals")
          .select("raw_event_ids, event_category")
          .gte("created_at", start.toISOString())
          .lt("created_at", end.toISOString())
          .order("created_at", { ascending: true })
          .range(from, from + PAGE - 1),
      sleep,
    );
    if (error) throw new Error(error.message ?? "signals read failed");
    const rows = (data ?? []) as SignalRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function rejectionRows(
  supabase: GateDriftSupabase,
  start: Date,
  end: Date,
  sleep: Sleep,
): Promise<ReasonRow[]> {
  const run = (columns: string) =>
    supabase
      .from("service_health_events")
      .select(columns)
      .eq("service", "materiality_gate")
      .eq("status", "rejected")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString());

  const first = await withStatementTimeoutRetry("materiality_gate health read", () => run("detail, raw_event_id"), sleep);
  if (!first.error) return (first.data ?? []) as ReasonRow[];
  if (!missingRawEventIdColumn(first.error)) {
    throw new Error(first.error.message ?? "materiality_gate health read failed");
  }
  const second = await withStatementTimeoutRetry("materiality_gate health read (fallback columns)", () => run("detail"), sleep);
  if (second.error) throw new Error(second.error.message ?? "materiality_gate health read failed");
  return (second.data ?? []) as ReasonRow[];
}

function matchRejections(events: JudgedRow[], health: ReasonRow[]): JudgedRow[] {
  const pool = health.map((row) => ({ row, used: false }));
  const matched: JudgedRow[] = [];
  for (const event of events) {
    const title = (event.title ?? "").slice(0, 200);
    const byId = pool.findIndex(
      (item) => !item.used && item.row.raw_event_id != null && item.row.raw_event_id === event.id,
    );
    const byTitle = pool.findIndex((item) => {
      if (item.used || item.row.raw_event_id) return false;
      return titleInDetail(item.row.detail) === title;
    });
    const idx = byId >= 0 ? byId : byTitle;
    if (idx < 0) continue;
    const hit = pool[idx];
    if (!hit) continue;
    hit.used = true;
    matched.push(event);
  }
  return matched;
}

function summarize(signals: SignalRow[], rejectedRows: JudgedRow[]): GateWeekNumbers & {
  rejectedRows: JudgedRow[];
} {
  const passing = signals.filter((row) => hasRawEvents(row.raw_event_ids));
  const passByCategory: Record<string, number> = {};
  for (const signal of passing) {
    const key = signal.event_category ?? "null";
    passByCategory[key] = (passByCategory[key] ?? 0) + 1;
  }
  const passed = passing.length;
  const rejected = rejectedRows.length;
  const judged = passed + rejected;
  if (judged === 0) return { ...emptyWeek(), rejectedRows };
  return {
    judged,
    passed,
    rejected,
    passRate: passed / judged,
    passByCategory,
    rejectedRows,
  };
}

async function weekNumbers(
  supabase: GateDriftSupabase,
  start: Date,
  end: Date,
  sleep: Sleep,
): Promise<GateWeekNumbers & { rejectedRows: JudgedRow[]; reasons: ReasonRow[] }> {
  const [checked, signals, reasons] = await Promise.all([
    checkedIn(supabase, start, end, sleep),
    signalsIn(supabase, start, end, sleep),
    rejectionRows(supabase, start, end, sleep),
  ]);
  const rejectedRows = matchRejections(checked, reasons);
  return { ...summarize(signals, rejectedRows), reasons };
}

export async function buildGateWeeklyReport(
  supabase: GateDriftSupabase,
  weekEnd: Date,
  sleep: Sleep = defaultSleep,
): Promise<GateWeeklyReport> {
  const currentStart = new Date(weekEnd.getTime() - WEEK_MS);
  const previousStart = new Date(weekEnd.getTime() - 2 * WEEK_MS);

  const [current, previous] = await Promise.all([
    weekNumbers(supabase, currentStart, weekEnd, sleep),
    weekNumbers(supabase, previousStart, currentStart, sleep),
  ]);

  const rejectedSample = sampleItems(current.rejectedRows, SAMPLE_SIZE).map((row) => {
    const title = (row.title ?? "").slice(0, TITLE_MAX);
    return { title, reason: reasonForTitle(row.title ?? "", current.reasons) };
  });

  return {
    definition: GATE_PASS_RATE_DEFINITION,
    weekEnd: weekEnd.toISOString(),
    currentStart: currentStart.toISOString(),
    previousStart: previousStart.toISOString(),
    current: {
      judged: current.judged,
      passed: current.passed,
      rejected: current.rejected,
      passRate: current.passRate,
      passByCategory: current.passByCategory,
    },
    previous: {
      judged: previous.judged,
      passed: previous.passed,
      rejected: previous.rejected,
      passRate: previous.passRate,
      passByCategory: previous.passByCategory,
    },
    difference: {
      judged: current.judged - previous.judged,
      passed: current.passed - previous.passed,
      rejected: current.rejected - previous.rejected,
      passRate:
        current.passRate != null && previous.passRate != null
          ? current.passRate - previous.passRate
          : null,
    },
    rejectedSample,
  };
}

export async function runGateDriftOnce(
  supabase: GateDriftSupabase,
  weekEnd = new Date(),
  sleep: Sleep = defaultSleep,
): Promise<GateWeeklyReport> {
  const report = await buildGateWeeklyReport(supabase, weekEnd, sleep);
  await recordServiceHealth("gate-drift", "ok", JSON.stringify(report), undefined, {
    supabase: supabase as RecordServiceHealthOptions["supabase"],
  });
  return report;
}
