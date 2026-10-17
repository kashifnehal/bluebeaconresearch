import axios from "axios";

import { getSupabaseAdmin } from "../clients/supabase.js";
import { COT_CONTRACT_BY_CODE, cotContractCodes } from "../lib/cot-contracts.js";

export const COT_DATASET_URL = "https://publicreporting.cftc.gov/resource/72hh-3qpy.json";
export const COT_USER_AGENT = "Blue Beacon Research (https://bluebeaconresearch.com)";
export const COT_TIMEOUT_MS = 20_000;
export const COT_LOOKBACK_WEEKS = 156;
export const COT_UPSERT_CHUNK_SIZE = 500;

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

export type CotPositionRow = {
  report_date: string;
  contract_market_code: string;
  market_name: string | null;
  symbol: string;
  open_interest: number | null;
  mm_long: number | null;
  mm_short: number | null;
  mm_spread: number | null;
  swap_long: number | null;
  swap_short: number | null;
  prod_long: number | null;
  prod_short: number | null;
  nonrept_long: number | null;
  nonrept_short: number | null;
  change_mm_long: number | null;
  change_mm_short: number | null;
  traders_total: number | null;
  contract_units: string | null;
};

export type CotCollectorResult = {
  ok: true;
  fetched: number;
  upserted: number;
  skipped?: "disabled" | "missing_table";
};

export interface CotCollectorDeps {
  fetchCot?: (url: string) => Promise<unknown>;
  supabase?: SupabaseAdmin;
  enabled?: boolean;
}

let loggedMissingTable = false;

/** Test-only: allow the missing-table log to fire again. */
export function resetCotMissingTableLogForTests() {
  loggedMissingTable = false;
}

export function isCotCollectorEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.ENABLE_COT_COLLECTOR || "true").toLowerCase() !== "false";
}

export function isMissingCotTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (MISSING_TABLE_CODES.has(code)) return true;
  const message = (error.message ?? "").toUpperCase();
  return message.includes("42P01") || message.includes("PGRST205");
}

/** CFTC Socrata returns numeric fields as strings, including negatives. */
export function parseInteger(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : null;
  const text = String(value).trim();
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function parseReportDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

export function parseCotRow(raw: Record<string, unknown>): CotPositionRow | null {
  const code = typeof raw.cftc_contract_market_code === "string" ? raw.cftc_contract_market_code.trim() : "";
  const mapped = COT_CONTRACT_BY_CODE.get(code);
  const reportDate = parseReportDate(raw.report_date_as_yyyy_mm_dd);
  if (!mapped || !reportDate) return null;

  const marketName =
    typeof raw.market_and_exchange_names === "string" ? raw.market_and_exchange_names : null;
  const contractUnits = typeof raw.contract_units === "string" ? raw.contract_units : null;

  return {
    report_date: reportDate,
    contract_market_code: code,
    market_name: marketName,
    symbol: mapped.symbol,
    open_interest: parseInteger(raw.open_interest_all),
    mm_long: parseInteger(raw.m_money_positions_long_all),
    mm_short: parseInteger(raw.m_money_positions_short_all),
    mm_spread: parseInteger(raw.m_money_positions_spread),
    swap_long: parseInteger(raw.swap_positions_long_all),
    swap_short: parseInteger(raw.swap__positions_short_all),
    prod_long: parseInteger(raw.prod_merc_positions_long),
    prod_short: parseInteger(raw.prod_merc_positions_short),
    nonrept_long: parseInteger(raw.nonrept_positions_long_all),
    nonrept_short: parseInteger(raw.nonrept_positions_short_all),
    change_mm_long: parseInteger(raw.change_in_m_money_long_all),
    change_mm_short: parseInteger(raw.change_in_m_money_short_all),
    traders_total: parseInteger(raw.traders_tot_all),
    contract_units: contractUnits,
  };
}

export function buildCotRequestUrl(
  codes: string[] = cotContractCodes(),
  lookbackWeeks: number = COT_LOOKBACK_WEEKS,
): string {
  const inList = codes.map((c) => `'${c}'`).join(",");
  const where = encodeURIComponent(`cftc_contract_market_code in (${inList})`);
  const order = encodeURIComponent("report_date_as_yyyy_mm_dd DESC");
  const limit = String(codes.length * lookbackWeeks);
  return `${COT_DATASET_URL}?$where=${where}&$order=${order}&$limit=${limit}`;
}

async function defaultFetchCot(url: string): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await axios.get(url, {
        timeout: COT_TIMEOUT_MS,
        headers: { "User-Agent": COT_USER_AGENT, Accept: "application/json" },
      });
      return res.data;
    } catch (e) {
      lastErr = e;
      if (attempt === 0) continue;
    }
  }
  throw lastErr;
}

function asObjectRows(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return [];
  return data.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
}

export async function runCotCollectorOnce(deps: CotCollectorDeps = {}): Promise<CotCollectorResult> {
  const enabled = deps.enabled ?? isCotCollectorEnabled();
  if (!enabled) {
    return { ok: true, fetched: 0, upserted: 0, skipped: "disabled" };
  }

  const fetchCot = deps.fetchCot ?? defaultFetchCot;
  const supabase = deps.supabase ?? getSupabaseAdmin();
  const url = buildCotRequestUrl();
  const payload = await fetchCot(url);
  const parsed = asObjectRows(payload)
    .map((row) => parseCotRow(row))
    .filter((row): row is CotPositionRow => row !== null);

  const byKey = new Map<string, CotPositionRow>();
  for (const row of parsed) {
    byKey.set(`${row.report_date}|${row.contract_market_code}`, row);
  }
  const rows = [...byKey.values()];

  let upserted = 0;
  for (let i = 0; i < rows.length; i += COT_UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + COT_UPSERT_CHUNK_SIZE);
    const { error } = await supabase.from("cot_positions").upsert(chunk, {
      onConflict: "report_date,contract_market_code",
    });
    if (isMissingCotTableError(error)) {
      if (!loggedMissingTable) {
        console.warn("[COT] cot_positions table is missing; skipping until the migration is applied");
        loggedMissingTable = true;
      }
      return { ok: true, fetched: asObjectRows(payload).length, upserted: 0, skipped: "missing_table" };
    }
    if (error) throw new Error(error.message ?? "cot_positions upsert failed");
    upserted += chunk.length;
  }

  return { ok: true, fetched: asObjectRows(payload).length, upserted };
}
