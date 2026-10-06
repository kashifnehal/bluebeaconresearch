import type { getSupabaseAdmin } from "../clients/supabase.js";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

/**
 * Pre-classification near-duplicate skip (#95 item 1a).
 *
 * DELIBERATELY NARROW. This is NOT the "title-similarity instead of a
 * post-classification merge" idea that signal-merge.ts's design doc explicitly
 * rejected — that was rejected because skipping classification on mere title
 * *similarity* risks silently suppressing a genuinely distinct story that happens
 * to share wording, and freezes severity at whichever source was read first.
 *
 * This only catches the literal same-article-refetched case. ALL THREE must hold:
 *   1. Normalized title is an EXACT match (case / whitespace / punctuation folded)
 *      — not "similar", identical.
 *   2. Same-or-adjacent `raw_events.source` value. GNews writes 'newsapi' and RSS
 *      writes 'rss' (claude/237 — previously both wrote 'newsapi', conflating the
 *      two); a cross-post between those two still counts as "same/adjacent source"
 *      via NEWS_SOURCE_GROUP below. GDELT/ACLED/manual are each their own bucket
 *      and never match against the newsapi/rss group.
 *   3. The prior row was collected within PREFILTER_WINDOW_MINUTES. Collectors run
 *      every 15 min and classify inline right after insert, so a real re-fetch of
 *      the identical article reappears on the next run or two. 45 min = 3 collector
 *      cycles: wide enough to catch the re-fetch, tight enough that a same-title
 *      follow-up published hours later (a genuinely new development) is out of scope.
 *
 * On a hit we link the new raw_event into the existing signal with the SAME
 * mechanism signal-merge.ts's duplicate branch uses — append to raw_event_ids, bump
 * sources_count, touch updated_at. No severity/impact rewrite, no second merge path.
 *
 * A second check reuses a rejection. If an earlier row from the same source group,
 * created in the last 24 hours (the span the product feed shows), has this exact
 * normalized title, materiality_checked_at already set, and no signal containing
 * that row, the headline was already judged and dropped. Measured 2026-10-05 to
 * 2026-10-06: 55 repeats of a rejected headline were sent to classification again,
 * out of 1,111 articles. The new row is stamped materiality_checked_at so the
 * orphan pass does not send it again. A row whose materiality_checked_at is still
 * null was deferred and never judged, so that verdict is not reused.
 */
const PREFILTER_WINDOW_MINUTES = 45;
const PREFILTER_CANDIDATE_LIMIT = 50;
const PREFILTER_REJECT_WINDOW_HOURS = 24;
const PREFILTER_REJECT_CANDIDATE_LIMIT = 200;
const PREFILTER_MIN_NORMALIZED_LEN = 12;

// GNews ('newsapi') and RSS ('rss') commonly carry the same wire-service article —
// treat them as one bucket for the exact-title match below. Every other source
// stays its own bucket.
const NEWS_SOURCE_GROUP = ["newsapi", "rss"];
function sourceGroupFor(source: string): string[] {
  return NEWS_SOURCE_GROUP.includes(source) ? NEWS_SOURCE_GROUP : [source];
}

function normalizeTitle(title: string | null | undefined): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export type PreFilterResult =
  | { skipped: false }
  | { skipped: true; signalId: string | null };

export async function tryTitlePreFilterSkip(params: {
  supabase: SupabaseAdmin;
  collectorLabel: string;
  rawEventId: string;
  source: string;
  title: string;
}): Promise<PreFilterResult> {
  const { supabase, collectorLabel, rawEventId, source, title } = params;

  const normalized = normalizeTitle(title);
  // Too short to be a confident exact-match key (e.g. "Oil rises").
  if (normalized.length < PREFILTER_MIN_NORMALIZED_LEN) return { skipped: false };

  const windowStart = new Date(
    Date.now() - PREFILTER_WINDOW_MINUTES * 60_000,
  ).toISOString();

  const { data: recent, error } = await supabase
    .from("raw_events")
    .select("id, title, created_at")
    .in("source", sourceGroupFor(source))
    .neq("id", rawEventId)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false })
    .limit(PREFILTER_CANDIDATE_LIMIT);

  if (!error && recent?.length) {
    const match = recent.find(
      (r) => normalizeTitle(r.title as string | null) === normalized,
    );
    if (match) {
      // The prior row must already be classified into a signal. If it isn't, there's
      // nothing to fold into — fall through. A deferred row (materiality_checked_at
      // still null) stays for normal classification; reconciliation.ts picks up a
      // prior orphan on its own schedule.
      const { data: signals, error: sigErr } = await supabase
        .from("signals")
        .select("id, raw_event_ids, sources_count")
        .contains("raw_event_ids", [match.id])
        .limit(1);

      if (!sigErr && signals?.length) {
        const signal = signals[0];
        const existingIds: string[] = (signal.raw_event_ids as string[] | null) ?? [];
        if (existingIds.includes(rawEventId)) {
          return { skipped: true, signalId: signal.id as string };
        }

        const { error: upErr } = await supabase
          .from("signals")
          .update({
            raw_event_ids: [...existingIds, rawEventId],
            sources_count: (signal.sources_count ?? 1) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", signal.id);

        if (upErr) {
          console.error(
            `[${collectorLabel}] [PRE-FILTER] link failed for signal ${signal.id}:`,
            upErr.message,
          );
          return { skipped: false };
        }

        console.log(
          `[${collectorLabel}] [PRE-FILTER:skipped] rawEvent=${rawEventId} ` +
            `title="${title.slice(0, 80)}" -> signal=${signal.id} ` +
            `(exact normalized-title match to rawEvent=${match.id}, source=${source}, ` +
            `within ${PREFILTER_WINDOW_MINUTES}min) — Haiku classification skipped`,
        );
        return { skipped: true, signalId: signal.id as string };
      }
    }
  }

  // Rejection reuse. Separate query: the 45-minute candidate list stays capped at
  // 50 and does not select materiality_checked_at. This one looks back 24 hours,
  // selects the stamp, and caps at 200.
  const rejectWindowStart = new Date(
    Date.now() - PREFILTER_REJECT_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data: judged, error: judgedErr } = await supabase
    .from("raw_events")
    .select("id, title, created_at, materiality_checked_at")
    .in("source", sourceGroupFor(source))
    .neq("id", rawEventId)
    .gte("created_at", rejectWindowStart)
    .order("created_at", { ascending: false })
    .limit(PREFILTER_REJECT_CANDIDATE_LIMIT);

  if (judgedErr || !judged?.length) return { skipped: false };

  const prior = judged.find(
    (r) => normalizeTitle(r.title as string | null) === normalized,
  );
  if (!prior) return { skipped: false };
  // Deferred: classification never finished. Do not treat that as a rejection.
  if (prior.materiality_checked_at == null) return { skipped: false };

  const { data: priorSignals, error: priorSigErr } = await supabase
    .from("signals")
    .select("id")
    .contains("raw_event_ids", [prior.id])
    .limit(1);

  if (priorSigErr || priorSignals?.length) return { skipped: false };

  const { error: stampErr } = await supabase
    .from("raw_events")
    .update({ materiality_checked_at: new Date().toISOString() })
    .eq("id", rawEventId);

  if (stampErr) {
    console.error(
      `[${collectorLabel}] [PRE-FILTER:reject-reused] stamp failed rawEvent=${rawEventId} earlier=${prior.id}:`,
      stampErr.message,
    );
    return { skipped: false };
  }

  console.log(
    `[${collectorLabel}] [PRE-FILTER:reject-reused] rawEvent=${rawEventId} earlier=${prior.id} ` +
      `title="${title.slice(0, 80)}" source=${source} — prior rejection reused, classification skipped`,
  );
  return { skipped: true, signalId: null };
}
