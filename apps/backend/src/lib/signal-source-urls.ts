import { getSupabaseAdmin } from "../clients/supabase.js";

const MAX_SOURCE_URLS = 10;

function urlFromRawData(rawData: unknown): string | null {
  if (!rawData || typeof rawData !== "object") return null;
  const url = (rawData as { url?: unknown }).url;
  if (typeof url === "string" && /^https?:\/\//i.test(url.trim())) return url.trim();
  return null;
}

/** Real source URLs already stored on this signal's raw_events — never invented. */
export async function sourceUrlsForSignal(signal: {
  raw_event_ids?: unknown;
}): Promise<string[]> {
  const ids = Array.isArray(signal.raw_event_ids)
    ? signal.raw_event_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  if (ids.length === 0) return [];

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("raw_events").select("id, raw_data").in("id", ids);
  if (error) {
    console.warn(`[signal-chat] source URL lookup failed: ${error.message}`);
    return [];
  }

  const byId = new Map<string, string>();
  for (const row of data ?? []) {
    const url = urlFromRawData((row as { raw_data?: unknown }).raw_data);
    if (url) byId.set(String((row as { id: string }).id), url);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const url = byId.get(id);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= MAX_SOURCE_URLS) break;
  }
  return out;
}
