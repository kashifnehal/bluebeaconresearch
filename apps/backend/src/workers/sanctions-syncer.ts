import axios from "axios";
import { XMLParser } from "fast-xml-parser";

import { getSupabaseAdmin } from "../clients/supabase.js";
import { recordServiceHealth } from "../lib/service-health.js";

type SdnEntry = {
  uid?: string;
  lastName?: string;
  firstName?: string;
  sdnType?: string;
  remarks?: string;
  // etc…
};

function normalizeName(e: any) {
  const last = typeof e?.lastName === "string" ? e.lastName.trim() : "";
  const first = typeof e?.firstName === "string" ? e.firstName.trim() : "";
  const full = `${first} ${last}`.trim();
  return full || last || first || "Unknown";
}

const UPSERT_CHUNK_SIZE = 500;

// treasury.gov/ofac/downloads/* was retired — OFAC now serves the list from the
// Sanctions List Service. SDN.XML keeps the legacy sdnList/sdnEntry schema this
// parser expects (SDN_ENHANCED.XML uses a different structure).
const SDN_URL = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML";

// W7-IO-FIX-v2: the daily 04:00 UTC cron (workers.ts) plus any ad-hoc re-run of the
// same calendar day was rewriting all ~19.5k sanctions_entities rows every time
// (~502k lifetime updates logged for 19.5k rows — ~26 full rewrites), even though
// OFAC's list rarely changes day to day. 20h (not a flat 24h) gives the cron some
// drift headroom without allowing two runs inside the same day.
export const SANCTIONS_SYNC_SERVICE = "sanctions_sync";
const MIN_HOURS_BETWEEN_RUNS = 20;

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

async function defaultGetLastSuccessfulRunAt(supabase: SupabaseAdmin): Promise<number | null> {
  const { data, error } = await supabase
    .from("service_health_events")
    .select("created_at")
    .eq("service", SANCTIONS_SYNC_SERVICE)
    .eq("status", "ok")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.created_at) return null;
  return new Date(data.created_at as string).getTime();
}

/** Injection points for tests. Production uses the defaults. */
export interface SanctionsSyncDeps {
  now?: () => number;
  fetchSdnXml?: () => Promise<string>;
  supabase?: SupabaseAdmin;
  recordHealth?: typeof recordServiceHealth;
  /** Returns the ms timestamp of the last "ok" sanctions_sync health row, or null. */
  getLastSuccessfulRunAt?: (supabase: SupabaseAdmin) => Promise<number | null>;
}

export async function runSanctionsSyncOnce(deps: SanctionsSyncDeps = {}) {
  const now = deps.now ?? Date.now;
  const supabase = deps.supabase ?? getSupabaseAdmin();
  const recordHealth = deps.recordHealth ?? recordServiceHealth;
  const getLastSuccessfulRunAt = deps.getLastSuccessfulRunAt ?? defaultGetLastSuccessfulRunAt;
  const fetchSdnXml = deps.fetchSdnXml ?? (async () => (await axios.get(SDN_URL, { timeout: 30_000 })).data as string);

  const lastSuccessAt = await getLastSuccessfulRunAt(supabase);
  if (lastSuccessAt !== null && now() - lastSuccessAt < MIN_HOURS_BETWEEN_RUNS * 60 * 60 * 1000) {
    console.log(
      `[Sanctions] skipping run — last successful sync was ${Math.round((now() - lastSuccessAt) / 60_000)}min ago (< ${MIN_HOURS_BETWEEN_RUNS}h)`,
    );
    return { ok: true as const, list: "OFAC SDN", upserted: 0, skipped: "recent_run" as const };
  }

  const startedAt = now();
  const url = SDN_URL;
  let xml: string;
  try {
    xml = await fetchSdnXml();
  } catch (e: any) {
    await recordHealth(SANCTIONS_SYNC_SERVICE, "error", e?.message ?? String(e), now() - startedAt);
    throw e;
  }

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const doc = parser.parse(xml) as any;
  const entries = doc?.sdnList?.sdnEntry ?? [];
  const list = "OFAC SDN";

  const arr: SdnEntry[] = Array.isArray(entries) ? entries : [entries];
  console.log(`[Sanctions] fetched ${arr.length} row(s) from OFAC SDN`);

  // Dedupe by conflict key first — a single upsert() batch can't touch the same
  // (name,list) row twice ("ON CONFLICT DO UPDATE cannot affect row a second time").
  // Last write wins, matching the old row-by-row loop's behaviour.
  const byKey = new Map<string, Record<string, unknown>>();
  for (const e of arr) {
    const name = normalizeName(e);
    byKey.set(name, {
      name,
      list,
      source_url: url,
      raw_data: e,
      updated_at: new Date().toISOString(),
    });
  }
  const rows = [...byKey.values()];

  // Batched upsert (chunks of 500) instead of one round-trip per entry — the SDN
  // list is ~15k rows.
  let upserted = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
    const { error } = await supabase
      .from("sanctions_entities")
      .upsert(chunk, { onConflict: "name,list" });
    if (error) {
      console.error(
        `[Sanctions] upsert chunk ${i / UPSERT_CHUNK_SIZE} (${chunk.length} rows) failed:`,
        error.message,
      );
      continue;
    }
    upserted += chunk.length;
  }

  await recordHealth(
    SANCTIONS_SYNC_SERVICE,
    "ok",
    `fetched ${arr.length}, upserted ${upserted} row(s)`,
    now() - startedAt,
  );

  return { ok: true as const, list, upserted };
}

