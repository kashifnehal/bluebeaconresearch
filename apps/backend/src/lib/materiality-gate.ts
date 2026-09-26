import type { getSupabaseAdmin } from "../clients/supabase.js";
import type { ClassificationResult } from "../services/claude.service.js";
import { recordServiceHealth } from "./service-health.js";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

/**
 * #139/#141 — the single materiality-reject checkpoint every live
 * classify-then-insert path (gnews/gdelt/rss-collector, acled-collector,
 * reconciliation.ts) calls immediately after classifyEvent() returns. This is
 * the "meaning gate" the audit (claude/85_SIGNAL_INGESTION_FILTER_SEVERITY_AUDIT.md)
 * found completely missing: Claude's own "no market impact" summary was never
 * acted on, so every classified article — junk or not — became a `signals` row.
 *
 * Call this ONLY when classification.materialityPass === false. It logs the
 * rejection to console and to public.service_health_events (reusing the #42
 * append-only health log — service: "materiality_gate", status: "rejected" —
 * rather than inventing a new table), and (claude/237) stamps
 * raw_events.materiality_checked_at on the row so reconciliation.ts's candidate
 * query never re-fetches it — a rejected row never gets a signal, so without
 * this it looked identical to a genuine crash-orphan and was retried every 30
 * min for its full 12h orphan-eligible life (confirmed: 23 repeat Claude calls
 * per rejected article). The caller is responsible for actually skipping the
 * signals insert; this function only records the rejection.
 *
 * A row that instead passes the gate and gets a signal does NOT need this
 * stamp — reconciliation's candidate query already excludes it via the
 * raw_event_ids `.overlaps()` signal-coverage check, so it's never mistaken
 * for an orphan regardless of materiality_checked_at.
 */
export async function logMaterialityRejection(params: {
  collectorLabel: string;
  title: string;
  source: string;
  classification: ClassificationResult;
  supabase: SupabaseAdmin;
  rawEventId: string;
}): Promise<void> {
  const { collectorLabel, title, source, classification, supabase, rawEventId } = params;
  const reasoning = classification.materialityReasoning || "no reasoning provided";

  console.log(
    `[${collectorLabel}] [MATERIALITY-REJECT] title="${title}" source=${source} ` +
      `method=${classification.classificationMethod} reasoning="${reasoning}"`,
  );

  await recordServiceHealth(
    "materiality_gate",
    "rejected",
    `title="${title.slice(0, 200)}" source=${source} method=${classification.classificationMethod} reasoning="${reasoning.slice(0, 300)}"`,
  );

  const { error } = await supabase
    .from("raw_events")
    .update({ materiality_checked_at: new Date().toISOString() })
    .eq("id", rawEventId);
  if (error) {
    console.error(
      `[${collectorLabel}] Failed to stamp materiality_checked_at on raw_event ${rawEventId}:`,
      error.message,
    );
  }
}
