import { getSupabaseAdmin } from "../clients/supabase.js";
import { AcledAccessDeniedError, AcledService } from "../services/acled.service.js";
import { ClaudeService } from "../services/claude.service.js";
import { formatCountryName } from "./ai-classifier.js";
import { dispatchAlertsForSignal } from "./alert-dispatcher.js";
import { recordServiceHealth } from "../lib/service-health.js";
import { hasSimilarRecentSignal } from "../lib/novelty-hint.js";
import { logMaterialityRejection } from "../lib/materiality-gate.js";

const claude = new ClaudeService();

// ── 403 back-off (auto-resume) ────────────────────────────────────────────────
// When ACLED answers the data read with HTTP 403 the account has no API data
// access (a tier/licence matter, not something retrying fixes). We then stop
// calling ACLED for 24 hours, write at most one failure health row per 24 hours,
// and make ONE attempt after that. A 200 clears the back-off, so ingestion
// resumes on its own the first cycle after ACLED grants access.
// 24 hours is an operational choice, not a sourced threshold.
const ACLED_DENIED_BACKOFF_MS = 24 * 60 * 60 * 1000;
export const ACLED_ACCESS_DENIED_DETAIL =
  "ACLED data access denied (HTTP 403). Awaiting licence or tier upgrade. Login works.";

// Module-level on purpose: runAcledCollectorOnce() builds a new AcledService on
// every run, so the state cannot live on the service object. In memory only (no
// Redis, no database) — a worker restart resets it and costs at most one extra
// ACLED call.
let deniedUntilMs = 0;
let lastDeniedHealthRowMs = Number.NEGATIVE_INFINITY;

/** Test-only: clear the in-memory back-off state. */
export function resetAcledBackoffForTests() {
  deniedUntilMs = 0;
  lastDeniedHealthRowMs = Number.NEGATIVE_INFINITY;
}

export interface AcledCollectorResult {
  fetched: number;
  inserted: number;
  duplicates: number;
  signals: number;
  materialityRejected: number;
  /** Set when the run made no ingest: "access_denied" (this run got a 403) or
   *  "access_denied_backoff" (inside the 24h window, ACLED not called). */
  skipped?: "access_denied" | "access_denied_backoff";
}

/** Injection points for tests. Production uses the defaults. */
export interface AcledCollectorDeps {
  now?: () => number;
  acled?: Pick<AcledService, "fetchRecentEvents">;
  recordHealth?: typeof recordServiceHealth;
}

export async function runAcledCollectorOnce(
  deps: AcledCollectorDeps = {},
): Promise<AcledCollectorResult> {
  const now = deps.now ?? Date.now;
  const acled = deps.acled ?? new AcledService();
  const recordHealth = deps.recordHealth ?? recordServiceHealth;

  // Inside the back-off window: do not call ACLED, write no health row, and return
  // normally. (workers.ts logs every throw as an error and sends it to Sentry, so a
  // known, expected state must not throw.)
  if (now() < deniedUntilMs) {
    return {
      fetched: 0,
      inserted: 0,
      duplicates: 0,
      signals: 0,
      materialityRejected: 0,
      skipped: "access_denied_backoff",
    };
  }

  const supabase = getSupabaseAdmin();

  const fetchStartedAt = now();
  let events: Awaited<ReturnType<AcledService["fetchRecentEvents"]>>;
  try {
    events = await acled.fetchRecentEvents();
    deniedUntilMs = 0; // a successful read clears any back-off
    await recordHealth(
      "acled",
      "ok",
      `fetched ${events.length} event(s)`,
      now() - fetchStartedAt,
    );
  } catch (e) {
    if (e instanceof AcledAccessDeniedError) {
      // Known state (login works, no data access). Back off, log at most one row per
      // 24h, and return quietly instead of rethrowing.
      const t = now();
      deniedUntilMs = t + ACLED_DENIED_BACKOFF_MS;
      if (t - lastDeniedHealthRowMs >= ACLED_DENIED_BACKOFF_MS) {
        lastDeniedHealthRowMs = t;
        await recordHealth("acled", "error", ACLED_ACCESS_DENIED_DETAIL, t - fetchStartedAt);
      }
      return {
        fetched: 0,
        inserted: 0,
        duplicates: 0,
        signals: 0,
        materialityRejected: 0,
        skipped: "access_denied",
      };
    }
    const msg = e instanceof Error ? e.message : String(e);
    // "ACLED credentials missing" is an intentional not-configured state, not a
    // failure — workers.ts already treats it as debug-level. Everything else is a
    // real fetch failure worth a health row.
    if (!msg.includes("ACLED credentials missing")) {
      await recordHealth("acled", "error", msg, now() - fetchStartedAt);
    }
    throw e;
  }

  let fetched = events.length;
  let inserted = 0;
  let duplicates = 0;
  let signals = 0;
  let materialityRejected = 0;

  for (const e of events) {
    const externalId = e.event_id_cnty ? `acled-${e.event_id_cnty}` : null;
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
        lat: parseFloat(e.latitude ?? "") || null,
        lng: parseFloat(e.longitude ?? "") || null,
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
          supabase,
          rawEventId,
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
          lat: parseFloat(e.latitude ?? "") || null,
          lng: parseFloat(e.longitude ?? "") || null,
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
          media_impact_entity: classification.mediaImpactEntity ?? null,
          invalidation_condition: classification.invalidationCondition ?? null,
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
