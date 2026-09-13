import { getSupabaseAdmin } from "../clients/supabase.js";
import { AcledService } from "../services/acled.service.js";
import { ClaudeService } from "../services/claude.service.js";
import { formatCountryName } from "./ai-classifier.js";
import { dispatchAlertsForSignal } from "./alert-dispatcher.js";
import { recordServiceHealth } from "../lib/service-health.js";
import { hasSimilarRecentSignal } from "../lib/novelty-hint.js";
import { logMaterialityRejection } from "../lib/materiality-gate.js";

const claude = new ClaudeService();

export async function runAcledCollectorOnce() {
  const supabase = getSupabaseAdmin();
  const acled = new AcledService();

  const fetchStartedAt = Date.now();
  let events: Awaited<ReturnType<AcledService["fetchRecentEvents"]>>;
  try {
    events = await acled.fetchRecentEvents();
    await recordServiceHealth(
      "acled",
      "ok",
      `fetched ${events.length} event(s)`,
      Date.now() - fetchStartedAt,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // "ACLED credentials missing" is an intentional not-configured state, not a
    // failure — workers.ts already treats it as debug-level. Everything else is a
    // real fetch failure worth a health row.
    if (!msg.includes("ACLED credentials missing")) {
      await recordServiceHealth("acled", "error", msg, Date.now() - fetchStartedAt);
    }
    throw e;
  }

  let fetched = events.length;
  let inserted = 0;
  let duplicates = 0;
  let signals = 0;
  let materialityRejected = 0;

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
      const countryLabel = formatCountryName(e.country ?? null);
      const eventTypeLabel = e.event_type ?? "acled";
      const similarStoryLast48h = await hasSimilarRecentSignal(supabase, {
        country: countryLabel,
        eventType: eventTypeLabel,
      });
      const classification = await claude.classifyEvent(
        {
          id: rawEventId,
          title,
          summary: e.notes || "",
          country: e.country ?? null,
          event_type: eventTypeLabel,
          event_date: eventDate,
        },
        { similarStoryLast48h },
      );

      // #139/#141 materiality gate — the task spec explicitly calls out ACLED
      // (armed-conflict/security) as BBR's own highest-value content category
      // and instructs NOT skipping it; the gate still applies exactly the same
      // way here as the other 4 live paths — armed-conflict/security events
      // clear criterion (b) via "genuine armed-conflict/security event with
      // plausible commodity relevance" in the prompt's own materiality
      // instruction, so a real ACLED event should almost always still pass.
      if (!classification.materialityPass) {
        materialityRejected += 1;
        await logMaterialityRejection({
          collectorLabel: "ACLED",
          title,
          source: "acled",
          classification,
        });
        continue;
      }

      const { data: sigInsert, error: sigErr } = await supabase
        .from("signals")
        .insert({
          raw_event_ids: [rawEventId],
          title,
          summary: classification.summary,
          severity: classification.severity,
          confidence: classification.confidence,
          event_type: eventTypeLabel,
          country: countryLabel,
          region: classification.region,
          lat: parseFloat(e.latitude) || null,
          lng: parseFloat(e.longitude) || null,
          sources_count: 1,
          commodity_impacts: classification.commodityImpacts,
          currency_pair_impacts: classification.currencyPairImpacts ?? [],
          is_breaking: classification.isBreaking,
          is_active: true,
          event_date: eventDate,
          classification_method: classification.classificationMethod,
          relevance: classification.relevance ?? null,
          novelty: classification.novelty ?? null,
          event_category: classification.eventCategory ?? null,
          market_mechanism: classification.marketMechanism ?? null,
          is_preview: classification.isPreview ?? false,
          source_confirmation: classification.sourceConfirmation ?? null,
          materiality_pass: classification.materialityPass,
          materiality_reasoning: classification.materialityReasoning ?? null,
        })
        .select("id")
        .maybeSingle();

      if (!sigErr && sigInsert?.id) {
        signals += 1;
        // Every other collector (GDELT/GNews/RSS/reconciliation) dispatches alerts
        // right after a signal insert — this one silently didn't, so ACLED-sourced
        // signals could never trigger an alert regardless of matching rules.
        try {
          const dispatchResult = await dispatchAlertsForSignal(sigInsert.id as string);
          console.log(`[ACLED] alert-dispatch for signal ${sigInsert.id}:`, dispatchResult);
        } catch (e2) {
          console.error(`[ACLED] alert-dispatch failed for signal ${sigInsert.id}:`, e2 instanceof Error ? e2.message : e2);
        }
      } else if (sigErr) {
        console.error("[ACLED] Signal insert error:", sigErr.message);
      }
    } catch (err: any) {
      console.error(
        "[ACLED] Classification/signal insert failed:",
        err.message,
      );
    }
  }

  return { fetched, inserted, duplicates, signals, materialityRejected };
}
