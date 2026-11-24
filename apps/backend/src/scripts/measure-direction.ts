/**
 * TASK NQW3-FILTER1 Part 4.2 — read-only (SELECT only) measurement of whether
 * the classifier's per-asset `direction` call (and, once it exists,
 * `direction_shown`) carries any usable information for oil. Written
 * 2026-11-24 in response to the production audit cited in claude.service.ts's
 * CLASSIFIER_DIRECTION_V3 comments: 52% of scored signal-asset rows since
 * 2026-09-15 were armed-conflict news, labelled "up" 76% of the time, while
 * WTI fell 19.6% over the same window.
 *
 * Never writes to the database. Never calls the Anthropic API. Reads
 * `signals` (for event_date + commodity_impacts, to find direction_shown when
 * present) and `signal_outcomes` (for predicted_direction/actual_pct_change)
 * only.
 *
 * Usage (from apps/backend):
 *   pnpm measure:direction                  # default --since = 30 days ago
 *   pnpm measure:direction --since 2026-10-01
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { FLAT_THRESHOLD_PCT, actualDirectionFromPct } from "../lib/outcome-threshold.js";

export const CHECKPOINT_HOURS = [24, 48] as const;
// The two oil benchmarks the task's same-day test is defined over.
export const OIL_ASSETS = ["USOIL", "UKOIL"] as const;
const PAGE_SIZE = 1000;
const SIGNAL_ID_CHUNK = 300;

const OUTPUT_PATH = fileURLToPath(new URL("../../.tmp/measure-direction.md", import.meta.url));

// ── CLI args ────────────────────────────────────────────────────────────

export function parseMeasureDirectionArgs(args: string[], now: Date = new Date()): { sinceIso: string } {
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

// ── Row shapes ──────────────────────────────────────────────────────────

export type OutcomeRow = {
  signalId: string;
  asset: string;
  checkpointHours: number;
  predictedDirection: string;
  actualPctChange: number;
  eventDate: string;
  directionShown: "up" | "down" | "none" | null;
};

type SignalMeta = { eventDate: string; directionShownByAsset: Map<string, "up" | "down" | "none"> };

/** Only well-formed {asset, direction_shown} entries are read; anything else is ignored, never thrown on. */
function readDirectionShownByAsset(impacts: unknown): Map<string, "up" | "down" | "none"> {
  const out = new Map<string, "up" | "down" | "none">();
  if (!Array.isArray(impacts)) return out;
  for (const item of impacts) {
    if (!item || typeof item !== "object") continue;
    const asset = (item as { asset?: unknown }).asset;
    const directionShown = (item as { direction_shown?: unknown }).direction_shown;
    if (
      typeof asset === "string" &&
      (directionShown === "up" || directionShown === "down" || directionShown === "none")
    ) {
      out.set(asset, directionShown);
    }
  }
  return out;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ── IO (SELECT only) ────────────────────────────────────────────────────

async function fetchOutcomeRows(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sinceIso: string,
): Promise<OutcomeRow[]> {
  const signalMeta = new Map<string, SignalMeta>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("signals")
      .select("id, event_date, commodity_impacts")
      .gte("event_date", sinceIso)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`signals select failed: ${error.message}`);
    const page = (data ?? []) as { id: string; event_date: string; commodity_impacts: unknown }[];
    for (const row of page) {
      signalMeta.set(row.id, {
        eventDate: row.event_date,
        directionShownByAsset: readDirectionShownByAsset(row.commodity_impacts),
      });
    }
    if (page.length < PAGE_SIZE) break;
  }

  const signalIds = [...signalMeta.keys()];
  const rows: OutcomeRow[] = [];
  for (const idChunk of chunk(signalIds, SIGNAL_ID_CHUNK)) {
    if (idChunk.length === 0) continue;
    const { data, error } = await supabase
      .from("signal_outcomes")
      .select("signal_id, asset, predicted_direction, actual_pct_change, checkpoint_hours")
      .in("signal_id", idChunk)
      .in("checkpoint_hours", CHECKPOINT_HOURS as readonly number[]);
    if (error) throw new Error(`signal_outcomes select failed: ${error.message}`);
    for (const row of (data ?? []) as {
      signal_id: string;
      asset: string;
      predicted_direction: string;
      actual_pct_change: number;
      checkpoint_hours: number;
    }[]) {
      const meta = signalMeta.get(row.signal_id);
      if (!meta) continue;
      rows.push({
        signalId: row.signal_id,
        asset: row.asset,
        checkpointHours: row.checkpoint_hours,
        predictedDirection: row.predicted_direction,
        actualPctChange: row.actual_pct_change,
        eventDate: meta.eventDate,
        directionShown: meta.directionShownByAsset.get(row.asset) ?? null,
      });
    }
  }
  return rows;
}

// ── Pure aggregates (tested with fixed data) ───────────────────────────

export type AssetDirectionRow = {
  asset: string;
  checkpointHours: number;
  nUp: number;
  nDown: number;
  predictedUpSharePct: number | null;
  predictedDownSharePct: number | null;
  actualUpSharePct: number | null;
  actualDownSharePct: number | null;
  meanMoveUpPct: number | null;
  meanMoveDownPct: number | null;
};

function mean(values: number[]): number | null {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/**
 * Per-asset, per-checkpoint table. `directionOf(row)` selects which field to
 * read the predicted direction from — `predicted_direction` (always present)
 * or `direction_shown` (only once CLASSIFIER_DIRECTION_V3 has written rows).
 * Rows whose selected direction is not exactly "up" or "down" (volatile,
 * neutral, "none", null) are excluded from the up/down tallies, matching the
 * live /accuracy page's existing "scored calls" convention.
 */
export function computeAssetDirectionTable(
  rows: OutcomeRow[],
  checkpointHours: number,
  directionOf: (row: OutcomeRow) => string | null,
): AssetDirectionRow[] {
  const byAsset = new Map<string, OutcomeRow[]>();
  for (const row of rows) {
    if (row.checkpointHours !== checkpointHours) continue;
    if (!byAsset.has(row.asset)) byAsset.set(row.asset, []);
    byAsset.get(row.asset)!.push(row);
  }

  const out: AssetDirectionRow[] = [];
  for (const [asset, assetRows] of [...byAsset.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const upRows = assetRows.filter((r) => directionOf(r) === "up");
    const downRows = assetRows.filter((r) => directionOf(r) === "down");
    const scored = upRows.length + downRows.length;
    const actualUp = assetRows.filter(
      (r) => actualDirectionFromPct(r.actualPctChange, FLAT_THRESHOLD_PCT) === "up",
    ).length;
    const actualDown = assetRows.filter(
      (r) => actualDirectionFromPct(r.actualPctChange, FLAT_THRESHOLD_PCT) === "down",
    ).length;
    out.push({
      asset,
      checkpointHours,
      nUp: upRows.length,
      nDown: downRows.length,
      predictedUpSharePct: scored > 0 ? (upRows.length / scored) * 100 : null,
      predictedDownSharePct: scored > 0 ? (downRows.length / scored) * 100 : null,
      actualUpSharePct: assetRows.length > 0 ? (actualUp / assetRows.length) * 100 : null,
      actualDownSharePct: assetRows.length > 0 ? (actualDown / assetRows.length) * 100 : null,
      meanMoveUpPct: mean(upRows.map((r) => r.actualPctChange)),
      meanMoveDownPct: mean(downRows.map((r) => r.actualPctChange)),
    });
  }
  return out;
}

export type DayPairing = {
  day: string;
  meanMoveUpPct: number;
  meanMoveDownPct: number;
  upHigher: boolean;
};

/**
 * Groups OIL_ASSETS rows at one checkpoint by UTC day (from `eventDate`).
 * Only days with at least one qualifying "up" row AND at least one
 * qualifying "down" row (per `directionOf`) are returned — exactly the "days
 * with both up and down calls" the task's same-day test is defined over.
 */
export function pairDaysWithBothDirections(
  rows: OutcomeRow[],
  checkpointHours: number,
  directionOf: (row: OutcomeRow) => string | null,
): DayPairing[] {
  const oilRows = rows.filter(
    (r) => r.checkpointHours === checkpointHours && (OIL_ASSETS as readonly string[]).includes(r.asset),
  );
  const byDay = new Map<string, OutcomeRow[]>();
  for (const row of oilRows) {
    const day = row.eventDate.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(row);
  }

  const out: DayPairing[] = [];
  for (const [day, dayRows] of [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const upMoves = dayRows.filter((r) => directionOf(r) === "up").map((r) => r.actualPctChange);
    const downMoves = dayRows.filter((r) => directionOf(r) === "down").map((r) => r.actualPctChange);
    if (upMoves.length === 0 || downMoves.length === 0) continue;
    const meanUp = mean(upMoves)!;
    const meanDown = mean(downMoves)!;
    out.push({ day, meanMoveUpPct: meanUp, meanMoveDownPct: meanDown, upHigher: meanUp > meanDown });
  }
  return out;
}

/** log(n!) via a simple accumulating sum — n is always small here (day counts), exactness over speed. */
function logFactorial(n: number): number {
  let sum = 0;
  for (let i = 2; i <= n; i++) sum += Math.log(i);
  return sum;
}

function logBinomialPmf(k: number, n: number, p: number): number {
  const logCoeff = logFactorial(n) - logFactorial(k) - logFactorial(n - k);
  const logP = k === 0 ? 0 : k * Math.log(p);
  const logQ = n - k === 0 ? 0 : (n - k) * Math.log(1 - p);
  return logCoeff + logP + logQ;
}

/**
 * Exact two-sided binomial test p-value for k successes out of n trials under
 * H0: p = 0.5 (by default) — sums the probability of every outcome at most as
 * likely as the observed k (the standard exact two-sided test), not the
 * 2*min(one-sided) approximation, which can exceed 1 and double-counts the
 * observed outcome itself on symmetric distributions.
 */
export function exactBinomialTwoSidedP(k: number, n: number, p = 0.5): number {
  if (n === 0) return 1;
  if (k < 0 || k > n) throw new RangeError(`k=${k} out of range for n=${n}`);
  const pmfs: number[] = [];
  for (let i = 0; i <= n; i++) pmfs.push(Math.exp(logBinomialPmf(i, n, p)));
  const observed = pmfs[k];
  // A small epsilon guards against floating-point noise excluding the
  // observed outcome (and its symmetric twin) from its own sum.
  const epsilon = observed * 1e-7;
  let total = 0;
  for (const pmf of pmfs) {
    if (pmf <= observed + epsilon) total += pmf;
  }
  return Math.min(1, total);
}

export type SameDayTestResult = {
  nQualifyingDays: number;
  kUpHigher: number;
  pValue: number | null;
};

export function sameDayTest(
  rows: OutcomeRow[],
  checkpointHours: number,
  directionOf: (row: OutcomeRow) => string | null,
): SameDayTestResult {
  const pairings = pairDaysWithBothDirections(rows, checkpointHours, directionOf);
  const n = pairings.length;
  const k = pairings.filter((p) => p.upHigher).length;
  return { nQualifyingDays: n, kUpHigher: k, pValue: n > 0 ? exactBinomialTwoSidedP(k, n) : null };
}

// ── Markdown rendering ──────────────────────────────────────────────────

function fmtPct(value: number | null, digits = 1): string {
  return value === null ? "—" : `${value.toFixed(digits)}%`;
}

function renderAssetTable(title: string, assetRows: AssetDirectionRow[]): string[] {
  const lines = [
    `### ${title}`,
    "",
    "| Asset | Checkpoint | n up | n down | Predicted up share | Predicted down share | Actual up share | Actual down share | Mean move (up calls) | Mean move (down calls) |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const r of assetRows) {
    lines.push(
      `| ${r.asset} | ${r.checkpointHours}h | ${r.nUp} | ${r.nDown} | ${fmtPct(r.predictedUpSharePct)} | ${fmtPct(r.predictedDownSharePct)} | ${fmtPct(r.actualUpSharePct)} | ${fmtPct(r.actualDownSharePct)} | ${fmtPct(r.meanMoveUpPct, 2)} | ${fmtPct(r.meanMoveDownPct, 2)} |`,
    );
  }
  lines.push("");
  return lines;
}

function renderSameDaySection(title: string, results: Record<number, SameDayTestResult>): string[] {
  const lines = [
    `### ${title} — same-day test (USOIL+UKOIL combined)`,
    "",
    "On days with at least one qualifying up call and one qualifying down call for USOIL+UKOIL: count of days where the mean move of up calls exceeds the mean move of down calls, out of all qualifying days, with an exact two-sided binomial p-value (H0: p=0.5).",
    "",
    "| Checkpoint | Qualifying days | Days up-mean > down-mean | Exact binomial p-value |",
    "|---|---|---|---|",
  ];
  for (const hours of CHECKPOINT_HOURS) {
    const r = results[hours];
    lines.push(
      `| ${hours}h | ${r.nQualifyingDays} | ${r.kUpHigher} | ${r.pValue === null ? "—" : r.pValue.toFixed(4)} |`,
    );
  }
  lines.push("");
  return lines;
}

export function renderMeasureDirectionReport(params: {
  sinceIso: string;
  generatedAtIso: string;
  rows: OutcomeRow[];
}): string {
  const { sinceIso, generatedAtIso, rows } = params;
  const predictedOf = (r: OutcomeRow) => r.predictedDirection;
  const directionShownOf = (r: OutcomeRow) => r.directionShown;
  const hasAnyDirectionShown = rows.some((r) => r.directionShown !== null);

  const lines = [
    "# Direction-label measurement",
    "",
    `Generated: ${generatedAtIso}`,
    `Since: ${sinceIso}`,
    `Read-only. Source: signals + signal_outcomes (service client). Flat threshold: ${FLAT_THRESHOLD_PCT}%. Checkpoints: ${CHECKPOINT_HOURS.join("h, ")}h.`,
    "",
    "## predicted_direction (the model's own up/down call, always present)",
    "",
  ];
  for (const hours of CHECKPOINT_HOURS) {
    lines.push(...renderAssetTable(`${hours}h`, computeAssetDirectionTable(rows, hours, predictedOf)));
  }
  const predictedSameDay: Record<number, SameDayTestResult> = {};
  for (const hours of CHECKPOINT_HOURS) predictedSameDay[hours] = sameDayTest(rows, hours, predictedOf);
  lines.push(...renderSameDaySection("predicted_direction", predictedSameDay));

  if (hasAnyDirectionShown) {
    lines.push("## direction_shown (CLASSIFIER_DIRECTION_V3 — only shown when the channel/basis/direction line up)", "");
    for (const hours of CHECKPOINT_HOURS) {
      lines.push(...renderAssetTable(`${hours}h`, computeAssetDirectionTable(rows, hours, directionShownOf)));
    }
    const shownSameDay: Record<number, SameDayTestResult> = {};
    for (const hours of CHECKPOINT_HOURS) shownSameDay[hours] = sameDayTest(rows, hours, directionShownOf);
    lines.push(...renderSameDaySection("direction_shown", shownSameDay));
  } else {
    lines.push(
      "## direction_shown",
      "",
      "No signal_outcomes row in this window has a direction_shown value on its asset's commodity_impacts entry — CLASSIFIER_DIRECTION_V3 has not written any rows yet in this window. Section skipped.",
      "",
    );
  }

  return lines.join("\n");
}

// ── Entry point ──────────────────────────────────────────────────────────

export async function measureDirection(argv: string[]): Promise<void> {
  const { sinceIso } = parseMeasureDirectionArgs(argv);
  const supabase = getSupabaseAdmin();
  const rows = await fetchOutcomeRows(supabase, sinceIso);
  const report = renderMeasureDirectionReport({ sinceIso, generatedAtIso: new Date().toISOString(), rows });

  mkdirSync(new URL("../../.tmp/", import.meta.url), { recursive: true });
  writeFileSync(OUTPUT_PATH, report, "utf8");

  console.log(`[measure-direction] since=${sinceIso} outcome rows=${rows.length}`);
  console.log(`[measure-direction] wrote ${OUTPUT_PATH}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  measureDirection(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
