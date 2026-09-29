import { NextResponse, type NextRequest } from "next/server";
import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { rateLimitOrPass } from "@/lib/ratelimit";
import { dedupeSignalsByTitle } from "@/lib/dedupe-signals";
import { REGIONS } from "@blue-beacon-research/shared";
import type { Signal } from "@blue-beacon-research/shared";
import { expandRegionVariants } from "@/lib/signal-filters";
import { loadMediaImpactCaveats } from "@/lib/media-impact-watchlist";
import { parseEventCategory, parseNovelty, parseSourceConfirmation } from "@/lib/market-impact-assessment";
import { sortByRelevance } from "@/lib/signal-relevance-rank";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Canonical region id → display label, for the personalized-feed filter. signals.region
// is not normalized to the canonical ids (it holds free text like "Middle East" or
// "Middle East / Global"), so we match on both the id and a loose label substring.
const REGION_LABEL = new Map<string, string>(
  REGIONS.map((r) => [r.id, r.label] as const),
);

// Simple in-memory cache for the last successful signals payload, keyed by the
// request's query string. This is process-local but sufficient for
// degraded-mode fallback when upstream rate-limiter or DB calls fail.
// Keyed per query string (not a single global entry) so that filtered
// requests (severity/region/window/search) don't get served the previous
// unfiltered request's cached payload within the TTL window — that bug
// made the map's filters silently no-op whenever a fresh request landed
// inside another request's cache window.
const _cachedSignalsByKey = new Map<
  string,
  { payload: any; timestamp: number }
>();
const MAX_CACHE_ENTRIES = 200;

type SignalRow = {
  id: string;
  title: string;
  summary: string;
  ai_analysis: string | null;
  severity: number;
  confidence: number;
  event_type: string;
  country: string;
  region: Signal["region"] | string;
  lat: number | null;
  lng: number | null;
  sources_count: number | null;
  commodity_impacts: Signal["commodityImpacts"] | null;
  currency_pair_impacts: Signal["currencyPairImpacts"] | null;
  sanctions_matches: Signal["sanctionsMatches"] | null;
  is_breaking: boolean | null;
  is_active: boolean | null;
  raw_event_ids: string[] | null;
  created_at: string;
  updated_at: string | null;
  event_date: string | null;
  media_impact_entity: string | null;
  event_category: string | null;
  market_mechanism: string | null;
  is_preview: boolean | null;
  novelty: number | null;
  source_confirmation: string | null;
  materiality_reasoning: string | null;
  invalidation_condition: string | null;
};

// Opaque pagination cursor for the default (no explicit `window`) feed view,
// beyond its first page (#259 follow-up). This is a real DB-level keyset on
// (event_date, id) — NOT the relevance score itself: score decays with age
// and isn't a stored column, so there's no way to push a "resume after this
// score" query down to Postgres directly. Instead each page does a plain,
// proven-correct keyset scan (event_date DESC, id DESC — same mechanism
// `sort=newest` already uses via `.range()`), fetches a chunk, and re-ranks
// just that chunk by relevance before emitting it. That chunk-local ranking
// is the same tradeoff the existing 24h/72h/7d tiered fallback already makes
// for page 1 (each tier is ranked within itself, not globally) — it isn't
// perfectly globally score-monotonic across chunk boundaries, but it's
// simple, always makes forward progress, and never loses or repeats a row.
type FeedCursor = {
  /** event_date of the last row physically scanned (keyset position). */
  d: string;
  /** that row's id — keyset tiebreaker for same-timestamp rows. */
  id: string;
  /** "now" snapshot from this scroll session's first page, reused on every
   * later page so a signal's relevance score doesn't drift mid-scroll. */
  t: string;
  /** cumulative signals already shown this session, for hasMore/total bookkeeping. */
  n: number;
  /** ids already surfaced in the "Just In" zone (page 1 only) — excluded from
   * every later page so a freshest-but-low-severity item can't reappear. */
  j: string[];
};

function encodeFeedCursor(c: FeedCursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `d`/`id`/`j` get interpolated straight into a PostgREST `.or()` filter
// string below (keyset pagination has no parameterized-query builder for
// this), and the cursor is client-supplied — so this validates each field's
// shape (valid ISO date, valid UUIDs) rather than trusting it, to rule out
// filter-string injection via a hand-crafted cursor.
function decodeFeedCursor(raw: string): FeedCursor | null {
  try {
    const p = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      p && typeof p.d === "string" && Number.isFinite(new Date(p.d).getTime()) &&
      typeof p.id === "string" && UUID_RE.test(p.id) &&
      typeof p.t === "string" && Number.isFinite(new Date(p.t).getTime()) &&
      typeof p.n === "number" && Number.isFinite(p.n) &&
      Array.isArray(p.j) && p.j.every((x: unknown) => typeof x === "string" && UUID_RE.test(x))
    ) {
      return p as FeedCursor;
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const cacheKey = new URL(req.url).search;
    // Personalized ("My Feed") results are per-user. The process-local cache is
    // keyed only by query string, not identity, so personalized requests must
    // never read from or write to it — otherwise user B could be served user A's
    // narrowed feed.
    const personalizedParam =
      req.nextUrl.searchParams.get("personalized") === "true";
    const skipCache = personalizedParam;
    const cached = skipCache ? undefined : _cachedSignalsByKey.get(cacheKey);
    // Short-circuit: if we have a very recent cached payload for this exact
    // query, return it immediately to avoid calling the rate-limit service
    // on every poll.
    const CACHE_TTL_MS = 60_000; // 1 minute
    if (cached && Date.now() - cached.timestamp <= CACHE_TTL_MS) {
      return NextResponse.json(
        cached.payload,
        { status: 200, headers: { "x-signals-feed-status": "cached" } },
      );
    }

    let rl;
    try {
      rl = await rateLimitOrPass(`signals:${ip}`);
      if (!rl.success) {
        // Upstash reports the client is rate-limited — serve cached payload if available
        if (cached) {
          console.warn("[signals] rate limited — serving cached payload");
          return NextResponse.json(
            {
              ...cached.payload,
              fallback: true,
              fallbackReason: "rate-limit",
              fallbackLastUpdated: new Date(cached.timestamp).toISOString(),
            },
            { status: 200, headers: { "x-signals-feed-status": "degraded" } },
          );
        }

        return NextResponse.json(
          {
            signals: [],
            nextCursor: null,
            total: 0,
            fallback: true,
            fallbackReason: "rate-limit",
          },
          { status: 200, headers: { "x-signals-feed-status": "degraded" } },
        );
      }
    } catch (err: any) {
      console.warn(
        "[signals] rate limit check failed, continuing:",
        err?.message ?? err,
      );
      // If the rate-limit check itself fails (Upstash down/quota), return cached payload when possible
      if (cached) {
        console.warn(
          "[signals] rate-limit check error — serving cached payload",
        );
        return NextResponse.json(
          {
            ...cached.payload,
            fallback: true,
            fallbackReason: "ratelimit-check-failed",
            fallbackLastUpdated: new Date(cached.timestamp).toISOString(),
          },
          { status: 200, headers: { "x-signals-feed-status": "degraded" } },
        );
      }
      // otherwise continue and try to query DB — we prefer to keep the API available
    }

    const clients = await getRouteSupabaseClients();
    if (!clients) {
      return NextResponse.json({ signals: [], nextCursor: null, total: 0 });
    }

    // Require authenticated session for dashboard data (matches RLS policy).
    // In local development we allow unauthenticated reads when `NEXT_PUBLIC_PROJECT_READY` is set
    // so the dev dashboard can show signals without a logged-in session.
    const { supabase, supabaseAuth, user } = clients;

    // Enforce authentication only in production; allow unauthenticated reads in local/dev.
    if (!user && process.env.NODE_ENV === "production") {
      return NextResponse.json({ signals: [], nextCursor: null, total: 0 });
    }

    const url = new URL(req.url);
    const searchQ = url.searchParams.get("search")?.trim() ?? null;
    const severity = url.searchParams.get("severity");
    const region = url.searchParams.get("region");
    const commodity = url.searchParams.get("commodity");
    // Forex-pair equivalent of `commodity` (#87). Deliberately a separate param:
    // `commodity` means commodity_impacts everywhere else in the codebase and
    // must keep that meaning. `forexPair` filters currency_pair_impacts instead.
    const forexPair = url.searchParams.get("forexPair");
    const sort = url.searchParams.get("sort") ?? "severity";
    const window =
      url.searchParams.get("window") ?? url.searchParams.get("range");
    // Every sort mode except the two explicit alternatives (`newest` = pure
    // recency, `confidence` = classifier confidence) goes through the
    // recency+severity blend — see the fuller explanation further down by
    // applySort/runQuery. Hoisted up here (rather than declared where it's
    // used below) because the cursor-pagination decision right after it
    // needs the value first.
    const isRelevanceSort = sort !== "newest" && sort !== "confidence";
    // Beyond page 1, the default (no explicit `window`) view has no time
    // cutoff — the 24h/72h/7d tiered fallback below used to be a hard
    // exclusion for the whole feed, not just its first page (#259 follow-up).
    // Ordering there is a decaying score, not a stored column, so `.range()`
    // offset paging can't resume it correctly; this instead resumes from an
    // opaque keyset cursor built from the previous page. See FeedCursor above.
    const useCursorPagination = !window && isRelevanceSort;
    const cursorParam = useCursorPagination ? url.searchParams.get("page") : null;
    const decodedCursor = cursorParam ? decodeFeedCursor(cursorParam) : null;
    // Optional row-count override (e.g. the map's filter fetch and tension-index
    // sparkline need more than the default 20). Capped at 500 (map "All" / "This
    // month"); callers that omit `limit` still get the original 20.
    const limitParam = Number(url.searchParams.get("limit"));
    const rowLimit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(500, Math.floor(limitParam))
        : 20;

    // Page-based pagination (additive — every existing caller omits `page`, so
    // `page` defaults to 1 and `.range(0, rowLimit-1)` returns the exact same
    // rows in the exact same order the previous `.limit(rowLimit)` did). The
    // response already carried a `nextCursor` field (hardcoded null) and a
    // `total`; those are now populated for real so the frontend can page.
    const pageParam = Number(url.searchParams.get("page"));
    const page =
      Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;
    const rangeFrom = (page - 1) * rowLimit;
    const rangeTo = rangeFrom + rowLimit - 1;

    // Commodity may be a single symbol or a comma-separated desk preset
    // (USOIL,UKOIL,NGAS). FX symbols also live on currency_pair_impacts, so
    // every asset is OR'd against both jsonb columns.
    const assetSymbols = [
      ...new Set(
        [commodity, forexPair]
          .flatMap((raw) => (raw ? raw.split(",") : []))
          .map((s) => s.trim())
          .filter((s) => /^[A-Z0-9]+$/.test(s)),
      ),
    ];

    // Personalized "My Feed" (#81) — opt-in via ?personalized=true, default OFF.
    // Narrows the feed to signals overlapping the user's saved commodities/regions.
    // With no user or no saved preferences it's a no-op: the full feed is returned
    // unchanged, so this can never silently hide signals from an existing user who
    // hasn't opted in.
    let personalizedApplied = false;
    const personalizedOrParts: string[] = [];
    if (personalizedParam && user) {
      const { data: prefs } = await supabaseAuth
        .from("user_preferences")
        .select("commodities, regions, forex_pairs")
        .eq("user_id", user.id)
        .maybeSingle();
      const prefCommodities: string[] = Array.isArray(prefs?.commodities)
        ? (prefs!.commodities as string[])
        : [];
      const prefRegions: string[] = Array.isArray(prefs?.regions)
        ? (prefs!.regions as string[])
        : [];
      const prefForexPairs: string[] = Array.isArray(prefs?.forex_pairs)
        ? (prefs!.forex_pairs as string[])
        : [];

      for (const rid of prefRegions) {
        personalizedOrParts.push(`region.eq.${rid}`);
        const label = REGION_LABEL.get(rid);
        if (label) personalizedOrParts.push(`region.ilike.*${label}*`);
      }
      for (const sym of prefCommodities) {
        // `sym` originates from our own COMMODITIES constant on write; the guard
        // keeps the value free of characters that are reserved inside .or().
        if (/^[A-Z0-9]+$/.test(sym)) {
          personalizedOrParts.push(`commodity_impacts.cs.[{"asset":"${sym}"}]`);
        }
      }
      // Forex pairs (#87) — identical jsonb-containment check against
      // currency_pair_impacts, folded into the same single OR filter. `sym`
      // comes from our own FOREX_PAIRS constant on write; same char guard.
      for (const sym of prefForexPairs) {
        if (/^[A-Z0-9]+$/.test(sym)) {
          personalizedOrParts.push(`currency_pair_impacts.cs.[{"asset":"${sym}"}]`);
        }
      }

      if (personalizedOrParts.length > 0) personalizedApplied = true;
    }

    // Builds a fresh, independent query with every non-window filter applied.
    // Factored out (tiered feed-fill fallback, see the `else` window branch
    // below) so the default view can re-run the identical filter set at
    // successive event_date cutoffs without the accumulated-mutation bugs of
    // reusing one chained builder across attempts.
    function buildFilteredQuery() {
      let q = supabase
        .from("signals")
        .select("*, event_date", { count: "exact" });
      if (severity) q = q.gte("severity", Number(severity));
      if (region) {
        const variants = expandRegionVariants(region);
        q = variants.length > 1 ? q.in("region", variants) : q.eq("region", region);
      }
      if (assetSymbols.length > 0) {
        const parts = assetSymbols.flatMap((sym) => [
          `commodity_impacts.cs.[{"asset":"${sym}"}]`,
          `currency_pair_impacts.cs.[{"asset":"${sym}"}]`,
        ]);
        q = q.or(parts.join(","));
      }
      if (personalizedOrParts.length > 0) q = q.or(personalizedOrParts.join(","));
      // Server-side free-text search if query provided (A1 — search bar Enter key)
      if (searchQ && searchQ.length >= 3) {
        const ilike = `%${searchQ.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
        q = q.or(
          `title.ilike.${ilike},summary.ilike.${ilike},country.ilike.${ilike},event_type.ilike.${ilike}`,
        );
      }
      return q;
    }

    const twentyFourHoursAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Generic "<N>d" windows (e.g. "90d") beyond the built-in 24h/7d/30d shortcuts —
    // used by the watchlist commodity drill-down to match its price-chart range.
    const genericDaysMatch = window?.match(/^(\d+)d$/);

    // Recency+severity blend (relevanceRankScore, lib/signal-relevance-rank.ts)
    // applied in application code rather than SQL, so it needs a candidate set
    // fetched up front and re-ranked/sliced below — NOT the DB-level `.range()`
    // paging `sort=newest`/`sort=confidence` use. This used to be gated to
    // `sort==="relevance"` only (the command palette's own opt-in), with the
    // main Intelligence Feed's default ("severity", pure severity DESC then
    // created_at DESC tiebreak) going through a separate branch below — that
    // let a stale severity-9 signal permanently outrank a brand-new severity-5
    // one, since recency only broke ties *within* the same severity value, not
    // across them. 2026-09-28: every mode except the two explicit alternatives
    // (`newest` = pure recency, `confidence` = classifier confidence) now goes
    // through this same blended path, so the default feed gets it too.
    // (isRelevanceSort itself is hoisted above, near `sort`/`window` — the
    // cursor-pagination decision needs it before this point.)
    // 500 (matching this route's own existing rowLimit cap) comfortably covers
    // a live count of signals clearing the new severity>=4 floor even at the
    // widest fixed window this route serves (30d: 399 as of 2026-09-28,
    // checked live against evavcgfmemwryggdkjmx) in a single fetch. The
    // `Math.max(RELEVANCE_CANDIDATE_LIMIT, rangeTo + 1)` below still grows this
    // per-page for deeper pagination (e.g. `window=all`, 2,371 candidates).
    const RELEVANCE_CANDIDATE_LIMIT = 500;

    function applySort<Q extends { order: (...args: any[]) => Q }>(q: Q): Q {
      return sort === "newest"
        ? q
            .order("event_date", { ascending: false })
            .order("created_at", { ascending: false })
        : sort === "confidence"
          ? q
              .order("confidence", { ascending: false })
              .order("event_date", { ascending: false })
          : // Pre-sort for the candidate fetch only — most-recent/highest-severity
            // first is a reasonable ordering to draw the top
            // RELEVANCE_CANDIDATE_LIMIT rows from before the real
            // recency+severity re-rank happens in application code below.
            // Final order for this mode comes from sortByRelevance(), not this
            // clause.
            q
              .order("event_date", { ascending: false })
              .order("severity", { ascending: false })
              .order("created_at", { ascending: false });
    }

    async function runQuery<Q extends { order: (...args: any[]) => Q; limit: (n: number) => any; range: (a: number, b: number) => any }>(
      q: Q,
    ) {
      return isRelevanceSort
        ? await applySort(q).limit(Math.max(RELEVANCE_CANDIDATE_LIMIT, rangeTo + 1))
        : await applySort(q).range(rangeFrom, rangeTo);
    }

    let data: SignalRow[] | null = null;
    let error: any = null;
    let count: number | null = null;
    // Set only on the default (no `window` param) path below — the tiered
    // feed-fill fallback. Left undefined for every explicit window choice
    // (24h/7d/30d/all/active/"<N>d"), which runs exactly one query, exactly
    // as before this change.
    let resolvedWindow: "24h" | "72h" | "7d" | undefined;

    if (window === "active") {
      ({ data, error, count } = await runQuery(buildFilteredQuery().eq("is_active", true)));
    } else if (window === "7d") {
      ({ data, error, count } = await runQuery(buildFilteredQuery().gte("event_date", sevenDaysAgo)));
    } else if (window === "30d") {
      ({ data, error, count } = await runQuery(buildFilteredQuery().gte("event_date", thirtyDaysAgo)));
    } else if (window === "24h") {
      ({ data, error, count } = await runQuery(buildFilteredQuery().gte("event_date", twentyFourHoursAgo)));
    } else if (window === "all") {
      // Explicit "show everything" — no date restriction at all. Distinct from
      // omitting `window` entirely (the tiered default below), which callers
      // that don't pass a window param hit instead.
      ({ data, error, count } = await runQuery(buildFilteredQuery()));
    } else if (genericDaysMatch) {
      const cutoff = new Date(
        Date.now() - Number(genericDaysMatch[1]) * 24 * 60 * 60 * 1000,
      ).toISOString();
      ({ data, error, count } = await runQuery(buildFilteredQuery().gte("event_date", cutoff)));
    } else if (decodedCursor) {
      // Cursor continuation beyond page 1 of the default view — the full
      // is_active + severity(+other filters) set, no time cutoff. `is_active`
      // is a hard filter here specifically (not on page 1 — see the tiered
      // fallback below, left exactly as it was); `severity` continues to come
      // from the `severity` query param via buildFilteredQuery(), same as
      // every other branch — the dashboard always sends it (DEFAULT_FILTERS
      // .minSeverity=4 in lib/signal-filters.ts), which is the feed's single
      // severity floor. Don't hardcode a second one here.
      //
      // Plain keyset scan (event_date DESC, id DESC) resuming after the
      // cursor's position — the same proven mechanism `sort=newest` already
      // uses via `.range()`. Fetches a chunk bigger than one page so there's
      // real material to relevance-rank locally (see below), capped well
      // under Supabase/PostgREST's hard 1000-row-per-request ceiling.
      const CHUNK_SIZE = Math.min(500, Math.max(rowLimit * 3, 60));
      // Re-serialized through Date/toISOString (not the raw decoded string)
      // before going into the filter string below — decodeFeedCursor already
      // checks `d` parses as a date and `id` is UUID-shaped, but this keeps
      // the interpolated value itself in a known-safe, fixed format.
      const cursorEventDate = new Date(decodedCursor.d).toISOString();
      const { data: chunkData, error: chunkError } = await buildFilteredQuery()
        .eq("is_active", true)
        .or(
          `event_date.lt.${cursorEventDate},and(event_date.eq.${cursorEventDate},id.lt.${decodedCursor.id})`,
        )
        .order("event_date", { ascending: false })
        .order("id", { ascending: false })
        .limit(CHUNK_SIZE);
      data = chunkData as SignalRow[] | null;
      error = chunkError;
      count = null; // not the true total — fullTotal below covers that for this branch
    } else {
      // Default ("latest") view: tiered feed-fill fallback. A hard 24h cutoff
      // used to be applied unconditionally, which made a real thin-inventory
      // moment (see #237/#238 — separate ingestion work, not touched here)
      // look identical to a broken feed. Try 24h first; if the candidate
      // count is below MIN_FEED_FILL, widen to 72h, then 7d, and stop — the
      // explicit window picker (7d/30d/all) above already covers wider views
      // on user request, so this never auto-widens past a week.
      //
      // MIN_FEED_FILL=12 is a product choice, not a researched number —
      // revisit once there's real usage data on how much feed content
      // actually keeps someone engaged.
      const MIN_FEED_FILL = 12;
      const tiers: { label: "24h" | "72h" | "7d"; cutoff: string }[] = [
        { label: "24h", cutoff: twentyFourHoursAgo },
        {
          label: "72h",
          cutoff: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
        },
        { label: "7d", cutoff: sevenDaysAgo },
      ];
      for (const tier of tiers) {
        const res = await runQuery(buildFilteredQuery().gte("event_date", tier.cutoff));
        data = res.data as SignalRow[] | null;
        error = res.error;
        count = res.count ?? null;
        resolvedWindow = tier.label;
        if (error || (count ?? 0) >= MIN_FEED_FILL || tier.label === "7d") break;
      }
    }

    // A page request past the last row (PostgREST "range not satisfiable",
    // code PGRST103) is a normal end-of-list condition, not a failure — return
    // a clean empty page rather than tripping the degraded-mode fallback. The
    // UI's pagination controls stop before this, so it's purely defensive.
    if (error && (error as { code?: string }).code === "PGRST103") {
      return NextResponse.json({
        signals: [],
        nextCursor: null,
        total: typeof count === "number" ? count : rangeFrom,
      });
    }

    if (error) {
      console.error("[signals] DB error:", error?.message ?? error);
      if (cached) {
        console.warn("[signals] DB error — serving cached payload");
        return NextResponse.json(
          {
            ...cached.payload,
            fallback: true,
            fallbackReason: "db-error",
            fallbackLastUpdated: new Date(cached.timestamp).toISOString(),
          },
          { status: 200, headers: { "x-signals-feed-status": "degraded" } },
        );
      }

      // Cold-start case: a DB error with no cache yet to fall back to (e.g. right
      // after a fresh deploy) previously returned the exact same empty-list shape as
      // a genuinely quiet news day — indistinguishable to the UI. Mark it explicitly
      // instead, same fallback contract the other branches in this route already use.
      console.warn("[signals] DB error with no cache available (cold start) — returning explicit fallback state, not a bare empty list");
      return NextResponse.json(
        {
          signals: [],
          nextCursor: null,
          total: 0,
          fallback: true,
          fallbackReason: "db-error-cold-start",
        },
        { status: 200, headers: { "x-signals-feed-status": "degraded" } },
      );
    }

    const rows = (data ?? []) as SignalRow[];
    const mediaImpactCaveats = await loadMediaImpactCaveats(supabase);

    // Batch-fetch event dates from raw_events for all signals that have raw_event_ids
    const allRawEventIds = rows
      .flatMap((r) => r.raw_event_ids ?? [])
      .filter(Boolean)
      .slice(0, 40);

    const eventDateMap = new Map<string, string>();

    if (allRawEventIds.length > 0) {
      const { data: rawEvents } = await supabase
        .from("raw_events")
        .select("id, event_date")
        .in("id", allRawEventIds);

      for (const re of rawEvents ?? []) {
        if (re.event_date) eventDateMap.set(re.id, re.event_date);
      }
    }

    const signals: Signal[] = rows.map((r) => {
      const firstRawId = r.raw_event_ids?.[0];
      const eventDate =
        r.event_date ??
        (firstRawId ? eventDateMap.get(firstRawId) : null) ??
        r.created_at;

      return {
        id: r.id,
        title: r.title,
        summary: r.summary,
        aiAnalysis: r.ai_analysis ?? undefined,
        severity: r.severity,
        confidence: r.confidence,
        eventType: r.event_type,
        country: r.country,
        region: r.region as Signal["region"],
        lat: r.lat ?? undefined,
        lng: r.lng ?? undefined,
        sourcesCount: r.sources_count ?? 1,
        commodityImpacts: r.commodity_impacts ?? [],
        currencyPairImpacts: r.currency_pair_impacts ?? [],
        sanctionsMatches: r.sanctions_matches ?? undefined,
        isBreaking: r.is_breaking ?? false,
        isActive: r.is_active ?? true,
        mediaImpactEntity: r.media_impact_entity ?? null,
        mediaImpactCaveat: r.media_impact_entity
          ? (mediaImpactCaveats.get(r.media_impact_entity) ?? null)
          : null,
        eventCategory: parseEventCategory(r.event_category),
        marketMechanism:
          typeof r.market_mechanism === "string" && r.market_mechanism.trim()
            ? r.market_mechanism.trim()
            : null,
        isPreview: r.is_preview === true,
        novelty: parseNovelty(r.novelty),
        sourceConfirmation: parseSourceConfirmation(r.source_confirmation),
        materialityReasoning:
          typeof r.materiality_reasoning === "string" && r.materiality_reasoning.trim()
            ? r.materiality_reasoning.trim()
            : null,
        invalidationCondition:
          typeof r.invalidation_condition === "string" && r.invalidation_condition.trim()
            ? r.invalidation_condition.trim()
            : null,
        createdAt: r.created_at,
        updatedAt: r.updated_at ?? undefined,
        eventDate,
      };
    });

    const deduped = dedupeSignalsByTitle(signals);

    // "Now" for score purposes: for a cursor continuation, reuse the exact
    // snapshot the session's first page captured, not a fresh Date.now() —
    // otherwise every item's score would shift between pages (it decays with
    // age) and the feed would visibly reshuffle under the user mid-scroll.
    const requestNow = decodedCursor ? new Date(decodedCursor.t) : new Date();

    // Re-rank the candidate set by recency+severity and take this page's slice
    // out of that ranked order — the DB-level `.order()`/`.limit()` above only
    // fetched a reasonable candidate window, it did not do the real ranking.
    const rankedSignals = isRelevanceSort
      ? sortByRelevance(deduped, (s) => s.severity, (s) => s.eventDate, requestNow, (s) => s.id)
      : deduped;

    // "Just In" — a pure event_date DESC slice of the same resolved-window
    // candidate set, default-view only (resolvedWindow is only set on that
    // path above). No new ranking formula: relevanceRankScore already favors
    // recency, but a single blended list still lets an aging severity-7 sit
    // ahead of a brand-new severity-4, so this surfaces the freshest signals
    // as their own zone. 5 items (not 6) so the dashboard's featured pick
    // (justIn[0]) plus its existing 2-up secondaryA/secondaryB grid land on
    // items 2 and 3 of the same freshest-5 set — see dashboard/page.tsx.
    const JUST_IN_COUNT = 5;
    let justIn: Signal[] = [];
    let rankedSignalsMinusJustIn = rankedSignals;
    if (resolvedWindow) {
      justIn = [...rankedSignals]
        .sort(
          (a, b) =>
            new Date(b.eventDate ?? b.createdAt).getTime() -
            new Date(a.eventDate ?? a.createdAt).getTime(),
        )
        .slice(0, JUST_IN_COUNT);
      const justInIds = new Set(justIn.map((s) => s.id));
      rankedSignalsMinusJustIn = rankedSignals.filter((s) => !justInIds.has(s.id));
    }

    let pagedSignals: Signal[];
    if (decodedCursor) {
      // The keyset fetch above already excludes everything at/after the
      // cursor's (event_date, id) position, so nothing here needs a
      // cursor-boundary re-check — emit the whole locally-ranked chunk
      // rather than slicing to rowLimit. Slicing would silently drop the
      // rest of this chunk forever: the next page's keyset position (below)
      // advances past everything just *fetched*, not just what was shown,
      // so any unshown remainder wouldn't be revisited. justIn ids are
      // excluded too: a freshest-but-low-severity "Just In" pick can
      // legitimately reappear in a later date-ordered chunk otherwise.
      const justInExclude = new Set(decodedCursor.j);
      pagedSignals = rankedSignalsMinusJustIn.filter((s) => !justInExclude.has(s.id));
    } else {
      pagedSignals = isRelevanceSort
        ? rankedSignalsMinusJustIn.slice(rangeFrom, rangeFrom + rowLimit)
        : rankedSignalsMinusJustIn;
    }

    let total: number;
    let hasMore: boolean;
    let nextCursorValue: string | null;
    let oldestEventDate: string | null = null;

    if (useCursorPagination) {
      // Full is_active + severity(+other filters) count, unbounded by the
      // tiered window or this request's own floorDate bound — this is the
      // honest "how many signals are really out there" number for the Load
      // More count and the earliest-signal terminal copy, and it's the same
      // set page 2+ actually draws from.
      const { count: fullTotalRaw } = await buildFilteredQuery()
        .eq("is_active", true)
        .limit(1);
      const fullTotal = fullTotalRaw ?? 0;
      const shownBefore = decodedCursor?.n ?? 0;
      const shownNow = shownBefore + justIn.length + pagedSignals.length;
      total = fullTotal;
      // pagedSignals.length > 0 guard: floorDate is a proven-safe bound so an
      // empty page shouldn't happen while shownNow < fullTotal, but this
      // stops an infinite empty-page loop rather than trusting that blindly.
      hasMore = shownNow < fullTotal && pagedSignals.length > 0;
      if (hasMore) {
        // Keyset resume point: the oldest (event_date, id) among everything
        // actually shown this page (justIn + pagedSignals), not just the
        // last item in ranked order — page 1 emits in *score* order, so its
        // lowest-ranked item isn't necessarily its chronologically oldest
        // one. Using the true minimum here guarantees the next page's plain
        // `event_date < d OR (event_date = d AND id < id)` scan can never
        // re-include anything already shown, at the cost of not
        // re-surfacing the handful of page-1-window candidates that ranked
        // just below its own cutoff (bounded to page 1's tiered window,
        // ~24h-7d of inventory, not the whole feed).
        const shownThisPage = [...justIn, ...pagedSignals];
        const oldest = shownThisPage.reduce((min, s) => {
          const st = new Date(s.eventDate ?? 0).getTime();
          const mt = new Date(min.eventDate ?? 0).getTime();
          if (st !== mt) return st < mt ? s : min;
          return s.id < min.id ? s : min;
        });
        nextCursorValue = encodeFeedCursor({
          d: oldest.eventDate ?? "",
          id: oldest.id,
          t: requestNow.toISOString(),
          n: shownNow,
          j: decodedCursor?.j ?? justIn.map((s) => s.id),
        });
      } else {
        nextCursorValue = null;
        const { data: oldestRows } = await buildFilteredQuery()
          .eq("is_active", true)
          .order("event_date", { ascending: true })
          .limit(1);
        oldestEventDate =
          (oldestRows?.[0] as { event_date?: string } | undefined)?.event_date ?? null;
      }
    } else {
      // `hasMore` / `total` are computed from the raw DB rows (pre-title-dedupe)
      // and the exact row count, so paging never stalls just because one page
      // happened to collapse several same-headline signals. Cross-page
      // headline dupes are still possible (dedupe is per-page) but the client
      // keys the merged feed by signal id, so they don't render twice.
      total = count ?? rangeFrom + rows.length;
      hasMore = rangeFrom + rows.length < total;
      nextCursorValue = hasMore ? String(page + 1) : null;
    }

    const payload: {
      signals: Signal[];
      nextCursor: string | null;
      total: number;
      personalized: boolean;
      resolvedWindow?: "24h" | "72h" | "7d";
      justIn?: Signal[];
      oldestEventDate?: string | null;
    } = {
      signals: pagedSignals,
      nextCursor: nextCursorValue,
      total,
      // Whether the "My Feed" narrowing was actually applied (false when the
      // caller opted in but has no saved preferences yet).
      personalized: personalizedApplied,
    };
    // Only present on the default (no `window` param) view — see the tiered
    // fallback above. Explicit window choices keep the exact previous
    // response shape.
    if (resolvedWindow) {
      payload.resolvedWindow = resolvedWindow;
      payload.justIn = justIn;
    }
    // Only present once pagination has genuinely exhausted the full
    // is_active + severity(+filters) set — lets the UI say "you've reached
    // the earliest signal on record" instead of implying there's no more news.
    if (useCursorPagination && !hasMore) {
      payload.oldestEventDate = oldestEventDate;
    }

    // Update in-memory cache of last successful payload for this query.
    // Personalized payloads are per-user and never cached (see `skipCache`).
    if (!skipCache) {
      try {
        if (_cachedSignalsByKey.size >= MAX_CACHE_ENTRIES) {
          _cachedSignalsByKey.clear();
        }
        _cachedSignalsByKey.set(cacheKey, { payload, timestamp: Date.now() });
      } catch (e) {
        // ignore cache write failures
      }
    }

    return NextResponse.json(payload);
  } catch (err: any) {
    console.error("[signals] unexpected handler error:", err?.stack ?? err);
    const cacheKey = new URL(req.url).search;
    const cached = _cachedSignalsByKey.get(cacheKey);
    if (cached) {
      console.warn(
        "[signals] unexpected handler error — serving cached payload",
      );
      return NextResponse.json(
        {
          ...cached.payload,
          fallback: true,
          fallbackReason: "handler-exception",
          fallbackLastUpdated: new Date(cached.timestamp).toISOString(),
        },
        { status: 200, headers: { "x-signals-feed-status": "degraded" } },
      );
    }

    return NextResponse.json({ signals: [], nextCursor: null, total: 0 });
  }
}
