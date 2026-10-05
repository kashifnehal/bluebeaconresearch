import { getSupabaseAdmin } from "../clients/supabase.js";
import { isAnthropicBudgetAvailable } from "../lib/anthropic-budget.js";
import { ClaudeService } from "../services/claude.service.js";
import { formatCountryName } from "./ai-classifier.js";
import { dispatchAlertsForSignal } from "./alert-dispatcher.js";
import { generateSignalAnalysis } from "./signal-generator.js";
import { hasSimilarRecentSignal } from "../lib/novelty-hint.js";
import { logMaterialityRejection } from "../lib/materiality-gate.js";

const claude = new ClaudeService();

// A transient failure between the raw_events insert and the signals insert (both
// collector steps, not atomic) permanently orphans that news item: the next
// collector run's dedup check only looks at raw_events.external_id, so an
// already-inserted-but-never-classified raw_event is silently skipped forever.
// This periodic check finds those and re-attempts classification.
const RECONCILE_THRESHOLD_MINUTES = 30;
const BATCH_LIMIT = 200;

// Some orphans never recover — a raw_event whose title/summary Claude simply can't
// classify, or a row referencing content that's since 404'd. Re-attempting these
// every 30 min forever burns Claude API calls for nothing. Past this age we log the
// row once (as it crosses the line) and permanently skip it. The cron runs every
// 30 min, so a one-interval-wide window catches each newly-stale row exactly once.
//
// W8-BUDGET-DEFER (ADR 035, D10) note: this was 12h, but a row's "orphan age" clock
// here is wall-clock time since raw_events.created_at, not actual-attempt-opportunity
// time — and reconcileOrphanedRawEventsOnce() now returns before even querying
// candidates whenever the ingestion budget is closed (see the early return below),
// so a row can sit for the entire closed window with zero classification attempts.
// A row never actually tried should not be swept into "permanently stale" just
// because the budget happened to be closed for a while. The budget's own worst-case
// closed duration is bounded by "reopens next UTC day" (≤24h if it closes just after
// UTC midnight) — doing real per-row "time since the budget last reopened" tracking
// would mean adding new persisted state (e.g. a reopened-at timestamp) outside this
// file's existing scope, which risks a subtler bug for a 30-min-cadence job. Chosen
// instead (the task's own simpler documented option): raise the limit with enough
// margin to absorb that worst case — 36h = 24h worst-case closed window x 1.5 safety
// margin — rather than add new cross-run timestamp state. A row genuinely stuck for
// a non-budget reason (can't classify, 404'd) just waits 3x as long before being
// permanently skipped, which only costs a few more harmless re-attempts, not a
// correctness problem.
const ORPHAN_MAX_AGE_HOURS = 36;

export async function reconcileOrphanedRawEventsOnce() {
  // W8-BUDGET-DEFER (ADR 035, founder decision D10) — when the daily ingestion
  // budget is closed, classifyEvent() would just defer every candidate anyway (see
  // claude.service.ts), so skip the query entirely rather than spend a Supabase
  // read for nothing.
  if (!(await isAnthropicBudgetAvailable("ingestion"))) {
    console.log("[Reconciliation] budget closed, skipping cycle");
    return { checked: 0, orphaned: 0, recovered: 0, deferred: true };
  }

  const supabase = getSupabaseAdmin();
  const now = Date.now();
  const cutoff = new Date(now - RECONCILE_THRESHOLD_MINUTES * 60_000).toISOString();
  const staleCutoff = new Date(now - ORPHAN_MAX_AGE_HOURS * 3_600_000).toISOString();
  const justCrossedCutoff = new Date(
    now - ORPHAN_MAX_AGE_HOURS * 3_600_000 - RECONCILE_THRESHOLD_MINUTES * 60_000,
  ).toISOString();

  const { data: candidates, error: candErr } = await supabase
    .from("raw_events")
    .select("id, title, summary, country, event_type, event_date, created_at")
    .lt("created_at", cutoff)
    // claude/237 — a row already stamped materiality_checked_at was already
    // resolved (rejected) by whichever collector or reconciliation run first
    // classified it. Excluding it here regardless of age is what stops the
    // repeat-rejection loop (previously: reclassified every 30 min for 12h).
    .is("materiality_checked_at", null)
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
  const allOrphans = candidates.filter((c) => !coveredIds.has(c.id));

  // Split off rows past the age limit — these are permanently stuck, not worth
  // another Claude call. Log only the ones that crossed the line in the last cron
  // interval so each stale row is reported exactly once, then never retried.
  const orphans = allOrphans.filter((c) => (c.created_at as string) >= staleCutoff);
  const stale = allOrphans.filter((c) => (c.created_at as string) < staleCutoff);
  const newlyStale = stale.filter((c) => (c.created_at as string) >= justCrossedCutoff);
  if (newlyStale.length > 0) {
    console.warn(
      `[Reconciliation] ${newlyStale.length} raw_events passed the ${ORPHAN_MAX_AGE_HOURS}h age limit still orphaned — logging once and permanently skipping: ${newlyStale.map((c) => c.id).join(", ")}`,
    );
  }

  if (orphans.length === 0) {
    return { checked: candidates.length, orphaned: 0, recovered: 0, skippedStale: stale.length };
  }

  console.warn(`[Reconciliation] Found ${orphans.length} orphaned raw_events (insert succeeded, signal never created) — re-attempting classification`);

  let recovered = 0;
  let rejected = 0;
  for (const raw of orphans) {
    try {
      const countryLabel = formatCountryName(raw.country);
      const eventTypeLabel = raw.event_type ?? "unknown";
      const similarStoryLast48h = await hasSimilarRecentSignal(supabase, {
        country: countryLabel,
        eventType: eventTypeLabel,
      });
      const classification = await claude.classifyEvent(
        {
          id: raw.id,
          title: raw.title ?? "Untitled event",
          summary: raw.summary ?? "",
          country: raw.country,
          event_type: raw.event_type,
          event_date: raw.event_date,
        },
        { similarStoryLast48h },
      );

      // W8-BUDGET-DEFER (ADR 035, D10) — see gdelt-collector.ts for the full
      // comment. Checked before materialityPass; `break` stops the rest of this
      // batch outright (budget_closed/spend_limit are process-wide conditions, and
      // the raw_event stays unclassified so a later cycle, once the budget reopens,
      // picks it back up — see the ORPHAN_MAX_AGE_HOURS comment above).
      if (classification.deferred) {
        console.log(
          `[Reconciliation] classifyEvent deferred (reason=${classification.deferReason}) — stopping batch for this cycle`,
        );
        break;
      }

      // #139/#141 materiality gate — this is a live cron job (every 30 min)
      // retrying classification for orphaned raw_events, one of the task's
      // explicitly-named 5 live call sites. Same gate, same skip-the-insert
      // behavior as the collectors: the raw_event stays (it's already there),
      // only the signals insert is skipped.
      if (!classification.materialityPass) {
        rejected += 1;
        await logMaterialityRejection({
          collectorLabel: "Reconciliation",
          title: raw.title ?? "Untitled event",
          source: "reconciliation",
          classification,
          supabase,
          rawEventId: raw.id as string,
        });
        continue;
      }

      const { data: sigInsert, error: sigErr } = await supabase
        .from("signals")
        .insert({
          raw_event_ids: [raw.id],
          title: raw.title ?? "Untitled event",
          summary: classification.summary,
          severity: classification.severity,
          confidence: classification.confidence,
          event_type: eventTypeLabel,
          // #188 — countryLabel (computed above, before classification, from
          // raw.country) is right for RSS/GNews (null -> "Global") and ACLED
          // (a real per-event country already), but wrong for a recovered
          // GDELT orphan: raw.country there is sourcecountry, the publishing
          // outlet's country, not the event's location. Prefer Claude's own
          // read of the article; fall back to the raw value only when the
          // classifier genuinely couldn't tell.
          country: formatCountryName(classification.country ?? raw.country),
          region: classification.region,
          lat: null,
          lng: null,
          sources_count: 1,
          commodity_impacts: classification.commodityImpacts,
          currency_pair_impacts: classification.currencyPairImpacts ?? [],
          is_breaking: classification.isBreaking,
          is_active: true,
          event_date: raw.event_date,
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

      if (sigErr || !sigInsert?.id) {
        console.error(`[Reconciliation] Still failed to recover raw_event ${raw.id}:`, sigErr?.message);
        continue;
      }

      recovered++;
      console.log(`[Reconciliation] Recovered raw_event ${raw.id} -> signal ${sigInsert.id}`);

      if (classification.severity >= 7) {
        try {
          await generateSignalAnalysis(sigInsert.id as string);
          console.log(`[Reconciliation] signal-generation completed for recovered signal ${sigInsert.id}`);
        } catch (e) {
          console.error(`[Reconciliation] signal-generation failed for recovered signal ${sigInsert.id}:`, e instanceof Error ? e.message : e);
        }
      }

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

  return { checked: candidates.length, orphaned: orphans.length, recovered, rejected, skippedStale: stale.length };
}
