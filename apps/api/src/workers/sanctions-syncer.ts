import axios from "axios";
import { XMLParser } from "fast-xml-parser";

import { getSupabaseAdmin } from "../clients/supabase";

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

export async function runSanctionsSyncOnce() {
  const supabase = getSupabaseAdmin();
  const url = "https://www.treasury.gov/ofac/downloads/sdnlist.xml";
  const xml = (await axios.get(url, { timeout: 30_000 })).data as string;

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const doc = parser.parse(xml) as any;
  const entries = doc?.sdnList?.sdnEntry ?? [];
  const list = "OFAC SDN";

  const arr: SdnEntry[] = Array.isArray(entries) ? entries : [entries];
  let upserted = 0;

  for (const e of arr) {
    const name = normalizeName(e);
    const raw_data = e;
    const { error } = await supabase
      .from("sanctions_entities")
      .upsert(
        {
          name,
          list,
          source_url: url,
          raw_data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "name,list" },
      );
    if (!error) upserted += 1;
  }

  return { ok: true as const, list, upserted };
}

