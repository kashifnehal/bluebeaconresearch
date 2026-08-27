import { NextResponse, type NextRequest } from "next/server";
import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { rateLimitOrPass } from "@/lib/ratelimit";
import { dedupeSignalsByTitle } from "@/lib/dedupe-signals";
import type { Signal } from "@blue-beacon-research/shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  sanctions_matches: Signal["sanctionsMatches"] | null;
  is_breaking: boolean | null;
  is_active: boolean | null;
  raw_event_ids: string[] | null;
  created_at: string;
  updated_at: string | null;
  event_date: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const cacheKey = new URL(req.url).search;
    const cached = _cachedSignalsByKey.get(cacheKey);
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
    const { supabase, user } = clients;

    // Enforce authentication only in production; allow unauthenticated reads in local/dev.
    if (!user && process.env.NODE_ENV === "production") {
      return NextResponse.json({ signals: [], nextCursor: null, total: 0 });
    }

    const url = new URL(req.url);
    const searchQ = url.searchParams.get("search")?.trim() ?? null;
    const severity = url.searchParams.get("severity");
    const region = url.searchParams.get("region");
    const commodity = url.searchParams.get("commodity");
    const sort = url.searchParams.get("sort") ?? "severity";
    const window =
      url.searchParams.get("window") ?? url.searchParams.get("range");
    // Optional row-count override (e.g. the map's tension-index sparkline needs more
    // than the default 20 to bucket a 24h window) — capped, and defaults to the
    // original hardcoded 20 so every existing caller that omits it is unaffected.
    const limitParam = Number(url.searchParams.get("limit"));
    const rowLimit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(100, Math.floor(limitParam))
        : 20;

    let query = supabase
      .from("signals")
      .select("*, event_date", { count: "exact" });
    if (severity) query = query.gte("severity", Number(severity));
    if (region) query = query.eq("region", region);
    if (commodity)
      // supabase-js's .contains() mis-serializes a raw array-of-objects value for a
      // jsonb column (produces `[{...` PostgREST can't parse: "invalid input syntax
      // for type json" / Postgres code 22P02) — pre-stringifying the containment
      // value is what actually works, confirmed against the live DB.
      query = query.contains(
        "commodity_impacts",
        JSON.stringify([{ asset: commodity }]),
      );

    // Server-side free-text search if query provided (A1 — search bar Enter key)
    if (searchQ && searchQ.length >= 3) {
      const ilike = `%${searchQ.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
      query = query.or(
        `title.ilike.${ilike},summary.ilike.${ilike},country.ilike.${ilike},event_type.ilike.${ilike}`,
      );
    }

    const twentyFourHoursAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Generic "<N>d" windows (e.g. "90d") beyond the built-in 24h/7d shortcuts —
    // used by the watchlist commodity drill-down to match its price-chart range.
    const genericDaysMatch = window?.match(/^(\d+)d$/);

    if (window === "active") {
      query = query.eq("is_active", true);
    } else if (window === "7d") {
      query = query.gte("event_date", sevenDaysAgo);
    } else if (window === "24h") {
      query = query.gte("event_date", twentyFourHoursAgo);
    } else if (window === "all") {
      // Explicit "show everything" — no date restriction at all. Distinct from
      // omitting `window` entirely (the `else` branch below), which callers that
      // don't pass a window param rely on for the existing 24h+active default.
    } else if (genericDaysMatch) {
      const cutoff = new Date(
        Date.now() - Number(genericDaysMatch[1]) * 24 * 60 * 60 * 1000,
      ).toISOString();
      query = query.gte("event_date", cutoff);
    } else {
      // Default and "latest" behavior: preserve fresh intelligence while keeping
      // ongoing active/developing events visible beyond 24h.
      query = query.or(
        `event_date.gte.${twentyFourHoursAgo},is_active.eq.true`,
      );
    }

    // Sort: most recent articles first (within severity tier)
    query =
      sort === "newest"
        ? query
            .order("event_date", { ascending: false })
            .order("created_at", { ascending: false })
        : sort === "confidence"
          ? query
              .order("confidence", { ascending: false })
              .order("event_date", { ascending: false })
          : query
              .order("event_date", { ascending: false })
              .order("severity", { ascending: false })
              .order("created_at", { ascending: false });

    const { data, error } = await query.limit(rowLimit);

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
        sanctionsMatches: r.sanctions_matches ?? undefined,
        isBreaking: r.is_breaking ?? false,
        isActive: r.is_active ?? true,
        createdAt: r.created_at,
        updatedAt: r.updated_at ?? undefined,
        eventDate,
      };
    });

    const deduped = dedupeSignalsByTitle(signals);

    const payload = {
      signals: deduped,
      nextCursor: null,
      total: deduped.length,
    };

    // Update in-memory cache of last successful payload for this query
    try {
      if (_cachedSignalsByKey.size >= MAX_CACHE_ENTRIES) {
        _cachedSignalsByKey.clear();
      }
      _cachedSignalsByKey.set(cacheKey, { payload, timestamp: Date.now() });
    } catch (e) {
      // ignore cache write failures
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
