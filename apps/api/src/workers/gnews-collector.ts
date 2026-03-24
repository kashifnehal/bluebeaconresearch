import axios from "axios";
import { buildQueues } from "../queues";
import { getSupabaseAdmin } from "../clients/supabase";
import { getEnv } from "../env";

export async function runGnewsCollectorOnce() {
  const env = getEnv();
  if (!env.NEWS_API_KEY) return { error: "NEWS_API_KEY missing" };

  const supabase = getSupabaseAdmin();
  const queues = buildQueues();

  // Search for conflict and geopolitical event keywords
  const url = `https://gnews.io/api/v4/search?q=conflict+OR+geopolitics+OR+sanctions&lang=en&max=10&token=${env.NEWS_API_KEY}`;
  const res = await axios.get(url, { timeout: 20_000 });
  const articles = res.data?.articles ?? [];

  let fetched = articles.length;
  let inserted = 0;
  let duplicates = 0;

  for (const a of articles) {
    const externalId = a.url ? `gnews-${Buffer.from(a.url).toString("base64").slice(0, 32)}` : null;
    if (!externalId) continue;

    const existing = await supabase.from("raw_events").select("id").eq("external_id", externalId).maybeSingle();
    if (existing.data?.id) {
      duplicates += 1;
      continue;
    }

    const insert = await supabase
      .from("raw_events")
      .insert({
        source: "gnews",
        external_id: externalId,
        title: a.title?.slice(0, 280) ?? "GNews article",
        summary: a.description?.slice(0, 1000) ?? null,
        country: null, // GNews doesn't provide structured country code easily
        lat: null,
        lng: null,
        event_type: "news",
        event_date: a.publishedAt ?? new Date().toISOString(),
        raw_data: a,
      })
      .select("id")
      .maybeSingle();

    if (insert.error || !insert.data?.id) continue;
    inserted += 1;

    await queues.aiClassification.add(
      "classify",
      { rawEventId: insert.data.id },
      { priority: 1, attempts: 3, backoff: { type: "exponential", delay: 1000 } },
    );
  }

  return { fetched, inserted, duplicates };
}
