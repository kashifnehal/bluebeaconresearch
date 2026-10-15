/**
 * One-off region canonicalization for signals.region.
 *
 * Dry run by default (read-only). Does not select region_raw, so it runs
 * before 20261015120000_signals_region_raw.sql is applied.
 *
 *   pnpm backfill:signal-region
 *   pnpm backfill:signal-region -- --apply
 *
 * --apply, in batches of 200: set region_raw = region where region_raw is
 * null, then set region = canonicalizeRegion(region, country) only when that
 * value differs. Legacy "americas" changes only when the country maps to
 * north-america or south-america. Rows with no country keep "americas".
 */
import { pathToFileURL } from "node:url";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { canonicalizeRegion } from "../lib/region-variants.js";

const BATCH_SIZE = 200;

export type RegionBackfillRow = {
  id: string;
  region: string | null;
  country: string | null;
  region_raw?: string | null;
};

export type RegionBackfillPatch = {
  region?: string;
  region_raw?: string;
};

export type RegionBackfillClient = {
  update(id: string, patch: RegionBackfillPatch): Promise<void>;
};

function normalizeRegionKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}

function isLegacyAmericas(region: string | null): boolean {
  if (!region) return false;
  return normalizeRegionKey(region) === "americas";
}

/** Region value to store. Legacy americas stays unless the country resolves to north-america or south-america. */
export function storedRegion(region: string | null, country: string | null): string {
  const canonical = canonicalizeRegion(region, country);
  if (
    isLegacyAmericas(region) &&
    canonical !== "north-america" &&
    canonical !== "south-america"
  ) {
    return region ?? "americas";
  }
  return canonical;
}

export function planRegionBackfillPatch(row: RegionBackfillRow): RegionBackfillPatch | null {
  const patch: RegionBackfillPatch = {};
  if (row.region_raw == null && row.region != null) {
    patch.region_raw = row.region;
  }
  const next = storedRegion(row.region, row.country);
  if (next !== row.region) {
    patch.region = next;
  }
  if (patch.region === undefined && patch.region_raw === undefined) return null;
  return patch;
}

export async function applyRegionBackfillBatch(
  client: RegionBackfillClient,
  rows: RegionBackfillRow[],
  options: { apply: boolean },
): Promise<{ examined: number; updated: number }> {
  let updated = 0;
  for (const row of rows) {
    const patch = planRegionBackfillPatch(row);
    if (!patch) continue;
    updated += 1;
    if (options.apply) await client.update(row.id, patch);
  }
  return { examined: rows.length, updated };
}

type DryRunSummary = {
  total: number;
  wouldChange: number;
  perNewRegion: Record<string, number>;
  stayLegacy: number;
  topInputs: Array<{ input: string; count: number; planned: Record<string, number> }>;
};

export function summarizeRegionBackfill(rows: Array<Pick<RegionBackfillRow, "region" | "country">>): DryRunSummary {
  const perNewRegion: Record<string, number> = {};
  const byInput = new Map<string, { count: number; planned: Map<string, number> }>();
  let wouldChange = 0;
  let stayLegacy = 0;
  for (const row of rows) {
    const next = storedRegion(row.region, row.country);
    if (isLegacyAmericas(next)) stayLegacy += 1;
    if (next !== row.region) {
      wouldChange += 1;
      perNewRegion[next] = (perNewRegion[next] ?? 0) + 1;
    }
    const input = row.region ?? "(null)";
    const bucket = byInput.get(input) ?? { count: 0, planned: new Map<string, number>() };
    bucket.count += 1;
    bucket.planned.set(next, (bucket.planned.get(next) ?? 0) + 1);
    byInput.set(input, bucket);
  }
  const topInputs = [...byInput.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([input, bucket]) => ({
      input,
      count: bucket.count,
      planned: Object.fromEntries([...bucket.planned.entries()].sort((a, b) => b[1] - a[1])),
    }));
  return { total: rows.length, wouldChange, perNewRegion, stayLegacy, topInputs };
}

export function formatRegionBackfillSummary(summary: DryRunSummary): string {
  const regionLines = Object.entries(summary.perNewRegion)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([region, count]) => `  ${region}: ${count}`)
    .join("\n");
  const inputLines = summary.topInputs
    .map((row) => {
      const planned = Object.entries(row.planned)
        .map(([region, count]) => `${region} (${count})`)
        .join(", ");
      return `  ${JSON.stringify(row.input)} x${row.count} -> ${planned}`;
    })
    .join("\n");
  return [
    `rows total: ${summary.total}`,
    `rows that would change: ${summary.wouldChange}`,
    `count per new region:`,
    regionLines || "  (none)",
    `count that stay legacy: ${summary.stayLegacy}`,
    `20 most common input strings:`,
    inputLines || "  (none)",
  ].join("\n");
}

async function fetchRows(apply: boolean): Promise<RegionBackfillRow[]> {
  const supabase = getSupabaseAdmin();
  const columns = apply ? "id,region,country,region_raw" : "id,region,country";
  const pageSize = 1000;
  const rows: RegionBackfillRow[] = [];
  for (let from = 0; ; from += pageSize) {
    // region_raw is absent from the generated row type until the migration is
    // applied. Dry run selects id, region, country only. --apply adds region_raw.
    const { data, error } = await (supabase as unknown as {
      from(table: string): {
        select(columns: string): {
          order(
            column: string,
            options: { ascending: boolean },
          ): {
            range(
              from: number,
              to: number,
            ): Promise<{ data: RegionBackfillRow[] | null; error: { message: string } | null }>;
          };
        };
      };
    })
      .from("signals")
      .select(columns)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`signals select failed: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const rows = await fetchRows(apply);
  const summary = summarizeRegionBackfill(rows);
  console.log(formatRegionBackfillSummary(summary));
  if (!apply) {
    console.log("dry run: no rows written");
    return;
  }
  const supabase = getSupabaseAdmin();
  const client: RegionBackfillClient = {
    async update(id, patch) {
      const { error } = await supabase.from("signals").update(patch).eq("id", id);
      if (error) throw new Error(`signals update ${id} failed: ${error.message}`);
    },
  };
  let updated = 0;
  for (let from = 0; from < rows.length; from += BATCH_SIZE) {
    const batch = rows.slice(from, from + BATCH_SIZE);
    const result = await applyRegionBackfillBatch(client, batch, { apply: true });
    updated += result.updated;
  }
  console.log(`applied updates: ${updated}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
