import { recordServiceHealth, type RecordServiceHealthOptions } from "./service-health.js";

// P19 — weekly counts for the materiality gate. No pass-rate target and no
// alarm. A week with zero judged rows (a provider stop) still writes the row.
// Judged rows are raw_events with materiality_checked_at in the window. Passed
// rows are those whose id appears in signals.raw_event_ids. Rejections are the
// rest. Stored reasons come from service_health_events written by
// logMaterialityRejection (service "materiality_gate", status "rejected",
// detail `title="..." reasoning="..."`).
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SAMPLE_SIZE = 20;
const TITLE_MAX = 120;

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
type ReasonRow = { detail: string | null };

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

async function judgedIn(supabase: GateDriftSupabase, start: Date, end: Date): Promise<JudgedRow[]> {
  const { data, error } = await supabase
    .from("raw_events")
    .select("id, title")
    .gte("materiality_checked_at", start.toISOString())
    .lt("materiality_checked_at", end.toISOString());
  if (error) throw new Error(error.message ?? "raw_events read failed");
  return (data ?? []) as JudgedRow[];
}

async function signalsCovering(supabase: GateDriftSupabase, ids: string[]): Promise<SignalRow[]> {
  const out: SignalRow[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200);
    const { data, error } = await supabase
      .from("signals")
      .select("raw_event_ids, event_category")
      .overlaps("raw_event_ids", slice);
    if (error) throw new Error(error.message ?? "signals read failed");
    out.push(...((data ?? []) as SignalRow[]));
  }
  return out;
}

async function rejectionReasons(
  supabase: GateDriftSupabase,
  start: Date,
  end: Date,
): Promise<ReasonRow[]> {
  const { data, error } = await supabase
    .from("service_health_events")
    .select("detail")
    .eq("service", "materiality_gate")
    .eq("status", "rejected")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());
  if (error) throw new Error(error.message ?? "materiality_gate health read failed");
  return (data ?? []) as ReasonRow[];
}

function summarize(judged: JudgedRow[], signals: SignalRow[]): GateWeekNumbers & {
  rejectedRows: JudgedRow[];
} {
  if (judged.length === 0) return { ...emptyWeek(), rejectedRows: [] };
  const judgedIds = new Set(judged.map((row) => row.id));
  const categoryById = new Map<string, string | null>();
  for (const signal of signals) {
    for (const id of signal.raw_event_ids ?? []) {
      if (!judgedIds.has(id) || categoryById.has(id)) continue;
      categoryById.set(id, signal.event_category ?? null);
    }
  }
  const passByCategory: Record<string, number> = {};
  for (const category of categoryById.values()) {
    const key = category ?? "null";
    passByCategory[key] = (passByCategory[key] ?? 0) + 1;
  }
  const passed = categoryById.size;
  const rejectedRows = judged.filter((row) => !categoryById.has(row.id));
  return {
    judged: judged.length,
    passed,
    rejected: judged.length - passed,
    passRate: passed / judged.length,
    passByCategory,
    rejectedRows,
  };
}

export async function buildGateWeeklyReport(
  supabase: GateDriftSupabase,
  weekEnd: Date,
): Promise<GateWeeklyReport> {
  const currentStart = new Date(weekEnd.getTime() - WEEK_MS);
  const previousStart = new Date(weekEnd.getTime() - 2 * WEEK_MS);

  const [currentJudged, previousJudged] = await Promise.all([
    judgedIn(supabase, currentStart, weekEnd),
    judgedIn(supabase, previousStart, currentStart),
  ]);
  const [currentSignals, previousSignals] = await Promise.all([
    currentJudged.length ? signalsCovering(supabase, currentJudged.map((row) => row.id)) : Promise.resolve([]),
    previousJudged.length
      ? signalsCovering(supabase, previousJudged.map((row) => row.id))
      : Promise.resolve([]),
  ]);

  const current = summarize(currentJudged, currentSignals);
  const previous = summarize(previousJudged, previousSignals);
  const reasons =
    current.rejectedRows.length > 0
      ? await rejectionReasons(supabase, currentStart, weekEnd)
      : [];

  const rejectedSample = sampleItems(current.rejectedRows, SAMPLE_SIZE).map((row) => {
    const title = (row.title ?? "").slice(0, TITLE_MAX);
    return { title, reason: reasonForTitle(row.title ?? "", reasons) };
  });

  return {
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
): Promise<GateWeeklyReport> {
  const report = await buildGateWeeklyReport(supabase, weekEnd);
  await recordServiceHealth("gate-drift", "ok", JSON.stringify(report), undefined, {
    supabase: supabase as RecordServiceHealthOptions["supabase"],
  });
  return report;
}
