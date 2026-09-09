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
 *   2. Same `raw_events.source` value. GNews and RSS both write source='newsapi',
 *      so a cross-post between those two counts as "same/adjacent source"; GDELT is
 *      its own bucket and never matches against 'newsapi'.
 *   3. The prior row was collected within PREFILTER_WINDOW_MINUTES. Collectors run
 *      every 15 min and classify inline right after insert, so a real re-fetch of
 *      the identical article reappears on the next run or two. 45 min = 3 collector
 *      cycles: wide enough to catch the re-fetch, tight enough that a same-title
 *      follow-up published hours later (a genuinely new development) is out of scope.
 *
 * On a hit we link the new raw_event into the existing signal with the SAME
 * mechanism signal-merge.ts's duplicate branch uses — append to raw_event_ids, bump
 * sources_count, touch updated_at. No severity/impact rewrite, no second merge path.
 */
const PREFILTER_WINDOW_MINUTES = 45;
const PREFILTER_CANDIDATE_LIMIT = 50;
const PREFILTER_MIN_NORMALIZED_LEN = 12;

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
  | { skipped: true; signalId: string };

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
    .eq("source", source)
    .neq("id", rawEventId)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false })
    .limit(PREFILTER_CANDIDATE_LIMIT);

  if (error || !recent?.length) return { skipped: false };

  const match = recent.find(
    (r) => normalizeTitle(r.title as string | null) === normalized,
  );
  if (!match) return { skipped: false };

  // The prior row must already be classified into a signal. If it isn't, there's
  // nothing to fold into — leave the new row for normal classification, and
  // reconciliation.ts will pick up the prior orphan on its own schedule.
  const { data: signals, error: sigErr } = await supabase
    .from("signals")
    .select("id, raw_event_ids, sources_count")
    .contains("raw_event_ids", [match.id])
    .limit(1);

  if (sigErr || !signals?.length) return { skipped: false };

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
