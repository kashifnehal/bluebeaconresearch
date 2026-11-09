/**
 * Read-only accuracy audit: honest, checkable numbers behind GET /v1/accuracy,
 * written 2026-11-09. No network calls other than the Supabase read below (the
 * service client, same as other scripts in this directory); prints aggregates
 * only — never a per-signal or per-user row. Does not insert, update, or
 * delete anything. Not wired into any cron/worker; run manually, and never
 * against production unless explicitly told to.
 *
 * For each of AUDIT_CHECKPOINT_HOURS (1h/4h/24h/48h): n rows, n distinct
 * signals, flat share, up-call share, up hit rate, down hit rate, the
 * baseline share of windows where the market rose, and the combined hit rate
 * recomputed at 0.25%/0.5%/1% flat thresholds. See lib/accuracy-audit.ts for
 * exactly what each figure counts and over what denominator.
 *
 * Writes apps/backend/scripts/out/ (git-ignored). Prints the same table.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { getSupabaseAdmin } from "../src/clients/supabase.js";
import {
  AUDIT_CHECKPOINT_HOURS,
  computeHorizonAudit,
  renderAccuracyAuditMarkdown,
  type AuditOutcomeRow,
} from "../src/lib/accuracy-audit.js";

const PAGE_SIZE = 1000;
const OUT_DIR = new URL("./out/", import.meta.url);
const OUT_PATH = new URL("./accuracy-audit.md", OUT_DIR);

async function loadAllOutcomeRows(
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<AuditOutcomeRow[]> {
  const rows: AuditOutcomeRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("signal_outcomes")
      .select("signal_id, checkpoint_hours, predicted_direction, actual_pct_change")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as AuditOutcomeRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function runAccuracyAudit(): Promise<string> {
  const supabase = getSupabaseAdmin();
  const rows = await loadAllOutcomeRows(supabase);
  const generatedAtIso = new Date().toISOString();
  const audits = AUDIT_CHECKPOINT_HOURS.map((hours) => computeHorizonAudit(rows, hours));
  const text = renderAccuracyAuditMarkdown(audits, generatedAtIso);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, text, "utf8");
  return text;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runAccuracyAudit()
    .then((text) => {
      console.log(text);
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
