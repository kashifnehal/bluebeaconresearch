import { buildQueues } from "../queues";
import { getSupabaseAdmin } from "../clients/supabase";
import { AcledService } from "../services/acled.service";

export async function runAcledCollectorOnce() {
  const supabase = getSupabaseAdmin();
  const queues = buildQueues();
  const acled = new AcledService();

  const events = await acled.fetchRecentEvents();
  
  let fetched = events.length;
  let inserted = 0;
  let duplicates = 0;

  for (const e of events) {
    const externalId = e.data_id ? `acled-${e.data_id}` : null;
    if (!externalId) continue;

    const existing = await supabase.from("raw_events").select("id").eq("external_id", externalId).maybeSingle();
    if (existing.data?.id) {
      duplicates += 1;
      continue;
    }

    const title = e.sub_event_type || e.event_type || "ACLED event";
    const insert = await supabase
      .from("raw_events")
      .insert({
        source: "acled",
        external_id: externalId,
        title,
        summary: e.notes || null,
        country: e.country ?? null,
        lat: parseFloat(e.latitude) || null,
        lng: parseFloat(e.longitude) || null,
        event_type: e.event_type ?? null,
        event_date: e.event_date ? new Date(e.event_date).toISOString() : new Date().toISOString(),
        raw_data: e,
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
