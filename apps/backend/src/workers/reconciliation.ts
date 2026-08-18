import { getSupabaseAdmin } from "../clients/supabase.js";
import { ClaudeService } from "../services/claude.service.js";
import { formatCountryName } from "./ai-classifier.js";
import { dispatchAlertsForSignal } from "./alert-dispatcher.js";

const claude = new ClaudeService();

// A transient failure between the raw_events insert and the signals insert (both
// collector steps, not atomic) permanently orphans that news item: the next
// collector run's dedup check only looks at raw_events.external_id, so an
// already-inserted-but-never-classified raw_event is silently skipped forever.
// This periodic check finds those and re-attempts classification.
const RECONCILE_THRESHOLD_MINUTES = 30;
const BATCH_LIMIT = 200;

export async function reconcileOrphanedRawEventsOnce() {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - RECONCILE_THRESHOLD_MINUTES * 60_000).toISOString();

  const { data: candidates, error: candErr } = await supabase
    .from("raw_events")
    .select("id, title, summary, country, event_type, event_date")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(BATCH_LIMIT);

  if (candErr) {
    console.error("[Reconciliation] Failed to fetch candidate raw_events:", candErr.message);
    return { checked: 0, orphaned: 0, recovered: 0, error: candErr.message };
  }
  if (!candidates?.length) return { checked: 0, orphaned: 0, recovered: 0 };

  // Single batched lookup (not one query per candidate) — same discipline as the
  // alert-dispatcher N+1 fix. raw_event_ids is a uuid[] on signals; `.overlaps()`
  // finds every signal that covers any of this batch's candidate ids in one call.
  const candidateIds = candidates.map((c) => c.id);
  const { data: matchedSignals, error: matchErr } = await supabase
    .from("signals")
    .select("raw_event_ids")
    .overlaps("raw_event_ids", candidateIds);

  if (matchErr) {
    console.error("[Reconciliation] Failed to check existing signals:", matchErr.message);
    return { checked: candidates.length, orphaned: 0, recovered: 0, error: matchErr.message };
  }

  const coveredIds = new Set<string>(
    (matchedSignals ?? []).flatMap((s) => (s.raw_event_ids as string[]) ?? []),
  );
  const orphans = candidates.filter((c) => !coveredIds.has(c.id));

  if (orphans.length === 0) return { checked: candidates.length, orphaned: 0, recovered: 0 };

  console.warn(`[Reconciliation] Found ${orphans.length} orphaned raw_events (insert succeeded, signal never created) — re-attempting classification`);

  let recovered = 0;
  for (const raw of orphans) {
    try {
      const classification = await claude.classifyEvent({
        id: raw.id,
        title: raw.title ?? "Untitled event",
        summary: raw.summary ?? "",
        country: raw.country,
        event_type: raw.event_type,
        event_date: raw.event_date,
      });

      const { data: sigInsert, error: sigErr } = await supabase
        .from("signals")
        .insert({
          raw_event_ids: [raw.id],
          title: raw.title ?? "Untitled event",
          summary: classification.summary,
          severity: classification.severity,
          confidence: classification.confidence,
          event_type: raw.event_type ?? "unknown",
          country: formatCountryName(raw.country),
          region: classification.region,
          lat: null,
          lng: null,
          sources_count: 1,
          commodity_impacts: classification.commodityImpacts,
          is_breaking: classification.isBreaking,
          is_active: true,
          event_date: raw.event_date,
        })
        .select("id")
        .maybeSingle();

      if (sigErr || !sigInsert?.id) {
        console.error(`[Reconciliation] Still failed to recover raw_event ${raw.id}:`, sigErr?.message);
        continue;
      }

      recovered++;
      console.log(`[Reconciliation] Recovered raw_event ${raw.id} -> signal ${sigInsert.id}`);

      try {
        const dispatchResult = await dispatchAlertsForSignal(sigInsert.id as string);
        console.log(`[Reconciliation] alert-dispatch for recovered signal ${sigInsert.id}:`, dispatchResult);
      } catch (e) {
        console.error(`[Reconciliation] alert-dispatch failed for recovered signal ${sigInsert.id}:`, e instanceof Error ? e.message : e);
      }
    } catch (e) {
      console.error(`[Reconciliation] Classification failed for orphaned raw_event ${raw.id}:`, e instanceof Error ? e.message : e);
    }
  }

  return { checked: candidates.length, orphaned: orphans.length, recovered };
}
