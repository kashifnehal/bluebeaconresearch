import axios from "axios";
import { XMLParser } from "fast-xml-parser";

import { getSupabaseAdmin } from "../clients/supabase.js";

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

export async function runSanctionsSyncOnce() {
  const supabase = getSupabaseAdmin();
  // treasury.gov/ofac/downloads/* was retired — OFAC now serves the list from the
  // Sanctions List Service. SDN.XML keeps the legacy sdnList/sdnEntry schema this
  // parser expects (SDN_ENHANCED.XML uses a different structure).
  const url = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML";
  const xml = (await axios.get(url, { timeout: 30_000 })).data as string;

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const doc = parser.parse(xml) as any;
  const entries = doc?.sdnList?.sdnEntry ?? [];
  const list = "OFAC SDN";

  const arr: SdnEntry[] = Array.isArray(entries) ? entries : [entries];

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

  return { ok: true as const, list, upserted };
}

