import type { ClassificationResult } from "../services/claude.service.js";
import { recordServiceHealth } from "./service-health.js";

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
 * rather than inventing a new table). The caller is responsible for actually
 * skipping the signals insert; this function only records the rejection, it
 * never touches raw_events (that row was already inserted before
 * classification and stays for dedup/audit regardless of this outcome).
 */
export async function logMaterialityRejection(params: {
  collectorLabel: string;
  title: string;
  source: string;
  classification: ClassificationResult;
}): Promise<void> {
  const { collectorLabel, title, source, classification } = params;
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
}
