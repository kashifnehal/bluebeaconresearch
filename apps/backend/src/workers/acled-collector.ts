import { getSupabaseAdmin } from "../clients/supabase.js";
import { AcledService } from "../services/acled.service.js";
import { ClaudeService } from "../services/claude.service.js";
import { formatCountryName } from "./ai-classifier.js";

const claude = new ClaudeService();

export async function runAcledCollectorOnce() {
  const supabase = getSupabaseAdmin();
  const acled = new AcledService();

  const events = await acled.fetchRecentEvents();

  let fetched = events.length;
  let inserted = 0;
  let duplicates = 0;
  let signals = 0;

  for (const e of events) {
    const externalId = e.data_id ? `acled-${e.data_id}` : null;
    if (!externalId) continue;

    const existing = await supabase
      .from("raw_events")
      .select("id")
      .eq("external_id", externalId)
      .maybeSingle();
    if (existing.data?.id) {
      duplicates += 1;
      continue;
    }

    const title = e.sub_event_type || e.event_type || "ACLED event";
    const eventDate = e.event_date
      ? new Date(e.event_date).toISOString()
      : new Date().toISOString();

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
        event_date: eventDate,
        raw_data: e,
      })
      .select("id")
      .maybeSingle();

    if (insert.error || !insert.data?.id) continue;
    inserted += 1;

    const rawEventId = insert.data.id as string;
    try {
      const classification = await claude.classifyEvent({
        id: rawEventId,
        title,
        summary: e.notes || "",
        country: e.country ?? null,
        event_type: e.event_type ?? "acled",
        event_date: eventDate,
      });

      const { error: sigErr } = await supabase.from("signals").insert({
        raw_event_ids: [rawEventId],
        title,
        summary: classification.summary,
        severity: classification.severity,
        confidence: classification.confidence,
        event_type: e.event_type ?? "acled",
        country: formatCountryName(e.country ?? null),
        region: classification.region,
        lat: parseFloat(e.latitude) || null,
        lng: parseFloat(e.longitude) || null,
        sources_count: 1,
        commodity_impacts: classification.commodityImpacts,
        is_breaking: classification.isBreaking,
        is_active: true,
        event_date: eventDate,
      });

      if (!sigErr) signals += 1;
      else console.error("[ACLED] Signal insert error:", sigErr.message);
    } catch (err: any) {
      console.error(
        "[ACLED] Classification/signal insert failed:",
        err.message,
      );
    }
  }

  return { fetched, inserted, duplicates, signals };
}
