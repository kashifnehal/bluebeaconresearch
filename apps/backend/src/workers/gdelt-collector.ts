import axios from "axios";

import { buildQueues } from "../queues.js";
import { getSupabaseAdmin } from "../clients/supabase.js";

type GdeltEvent = {
  GLOBALEVENTID?: string;
  SQLDATE?: string;
  EventCode?: string;
  GoldsteinScale?: string | number;
  SOURCEURL?: string;
  ActionGeo_CountryCode?: string;
  ActionGeo_Lat?: string | number;
  ActionGeo_Long?: string | number;
  // plus many more…
};

const ALLOWED_PREFIXES = ["18", "19", "190", "191", "192", "193", "194", "195", "196", "14", "20"];

function isAllowedCameo(code?: string) {
  if (!code) return false;
  return ALLOWED_PREFIXES.some((p) => code === p || code.startsWith(p));
}

function parseLatLng(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseGdeltDate(sqlDate?: string) {
  if (!sqlDate || sqlDate.length !== 8) return new Date().toISOString();
  const yyyy = sqlDate.slice(0, 4);
  const mm = sqlDate.slice(4, 6);
  const dd = sqlDate.slice(6, 8);
  return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`).toISOString();
}

export async function runGdeltCollectorOnce() {
  const supabase = getSupabaseAdmin();
  const queues = buildQueues();

  const url =
    "https://api.gdeltproject.org/api/v2/events/search?query=conflict+violence&mode=artlist&maxrecords=250&timespan=15m&format=json";
  const res = await axios.get(url, { timeout: 20_000 });
  const events: GdeltEvent[] = res.data?.events ?? res.data?.articles ?? [];

  let fetched = events.length;
  let inserted = 0;
  let duplicates = 0;

  for (const e of events) {
    const externalId = e.GLOBALEVENTID ? String(e.GLOBALEVENTID) : null;
    if (!externalId) continue;
    if (!isAllowedCameo(e.EventCode ? String(e.EventCode) : undefined)) continue;

    const existing = await supabase.from("raw_events").select("id").eq("external_id", externalId).maybeSingle();
    if (existing.data?.id) {
      duplicates += 1;
      continue;
    }

    const title = e.SOURCEURL ? String(e.SOURCEURL).slice(0, 280) : "GDELT event";
    const insert = await supabase
      .from("raw_events")
      .insert({
        source: "gdelt",
        external_id: externalId,
        title,
        summary: null,
        country: e.ActionGeo_CountryCode ?? null,
        lat: parseLatLng(e.ActionGeo_Lat),
        lng: parseLatLng(e.ActionGeo_Long),
        event_type: e.EventCode ?? null,
        event_date: parseGdeltDate(e.SQLDATE),
        raw_data: e,
      })
      .select("id")
      .maybeSingle();

    if (insert.error || !insert.data?.id) continue;
    inserted += 1;

    const priority = 1;
    await queues.aiClassification.add(
      "classify",
      { rawEventId: insert.data.id },
      { priority, attempts: 3, backoff: { type: "exponential", delay: 1000 } },
    );
  }

  return { fetched, inserted, duplicates };
}

