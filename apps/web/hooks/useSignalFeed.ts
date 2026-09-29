"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";
import type { Signal } from "@blue-beacon-research/shared";
import {
  symbolsForCommodityFilter,
  type FeedWindow,
} from "@/lib/signal-filters";

type Options = {
  enabled?: boolean;
  /** Opt into the personalized "My Feed" narrowing (#81). Default false. */
  personalized?: boolean;
  commodity?: string | null;
  region?: string | null;
  minSeverity?: number;
  window?: FeedWindow | null;
};

export function useSignalFeed({
  enabled = true,
  personalized = false,
  commodity = null,
  region = null,
  minSeverity = 1,
  window = null,
}: Options = {}) {
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [
      "signals",
      "feed",
      personalized,
      commodity ?? "",
      region ?? "",
      minSeverity,
      window ?? "",
    ],
    initialPageParam: "1",
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("sort", "severity");
      if (personalized) params.set("personalized", "true");
      const symbols = symbolsForCommodityFilter(commodity);
      if (symbols.length > 0) params.set("commodity", symbols.join(","));
      if (region) params.set("region", region);
      if (minSeverity > 1) params.set("severity", String(minSeverity));
      if (window) params.set("window", window);
      params.set("page", String(pageParam));

      const res = await fetch(`/api/signals?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch signals");
      return (await res.json()) as {
        signals?: Signal[];
        nextCursor?: string | null;
        total?: number;
        fallback?: boolean;
        fallbackReason?: string;
        fallbackLastUpdated?: string;
        personalized?: boolean;
        // Only present on the default (no `window` param) view — the tiered
        // feed-fill fallback in apps/web/app/api/signals/route.ts.
        resolvedWindow?: "24h" | "72h" | "7d";
        justIn?: Signal[];
        // Only present once the default view's cursor pagination has
        // genuinely exhausted the full matching set.
        oldestEventDate?: string | null;
      };
    },
    // `nextCursor` is an opaque page token from /api/signals ("2", "3", …) or
    // null at the end. Returning undefined tells react-query there's no next page.
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    placeholderData: keepPreviousData,
    // Sole source of "live" updates as of 2026-09-03 (was previously a fallback
    // alongside an SSE connection — see git history / project memory
    // project_vercel_fluid_sse_leak.md for why the SSE path was removed: an
    // EventSource held open for up to 15 minutes per tab, auto-reconnecting for as
    // long as the dashboard/map stayed open, is exactly what Vercel Fluid Compute
    // bills "Provisioned Memory" GB-Hrs for — full connection lifetime, not just
    // active work. 90s±10s jitter avoids synchronized bursts across concurrent
    // clients; it was already the fallback path so this is a delay-only change
    // (new signals now surface within ~90s instead of near-instantly), not new code.
    refetchInterval: () => {
      const base = 90_000;
      const jitter = Math.floor(Math.random() * 20_000) - 10_000; // ±10s
      return base + jitter;
    },
  });

  const pages = data?.pages ?? [];
  // Page 1 only ever carries `justIn` (the tiered default-view fallback is
  // resolved fresh per request, but the "freshest 5" zone only makes sense
  // once, at the head of the list — later pages' own `justIn` would just be
  // the same top-5 recomputed from a shifted candidate set). Re-prepending it
  // here reconstructs the same full blended order the route computed before
  // splitting `justIn` out of `signals` — the API split them only so the two
  // arrays never overlap, not so callers lose those items entirely.
  const justIn = pages[0]?.justIn ?? [];
  const liveSignals = useMemo(
    () => [...justIn, ...pages.flatMap((p) => p.signals ?? [])],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data?.pages],
  );
  // Feed-level fallback / total come from the first page — the degraded-mode
  // contract is per-request and page 1 is the one that always loads.
  const fallback = pages[0]?.fallback ?? false;
  const fallbackReason = pages[0]?.fallbackReason ?? null;
  const fallbackLastUpdated = pages[0]?.fallbackLastUpdated ?? null;
  const total = pages[0]?.total ?? null;
  // True only when the server actually narrowed the feed (opted in AND has
  // saved preferences). Lets the UI distinguish "My Feed on" from "My Feed on
  // but you haven't picked anything yet".
  const personalizedApplied = pages[0]?.personalized ?? false;
  // Present only on the default (no `window` param) view. Wider than "24h"
  // means the tiered fallback actually widened the window — see
  // dashboard/page.tsx's honest-banner usage.
  const resolvedWindow = pages[0]?.resolvedWindow ?? null;
  // Only set on the page where pagination genuinely ran out (server only
  // computes it once `hasMore` goes false) — the honest "earliest signal on
  // record" terminal copy needs this date, not a bare "no more news" label.
  const oldestEventDate = pages[pages.length - 1]?.oldestEventDate ?? null;

  // Scroll-triggered loading: attach `sentinelRef` to an element near the
  // bottom of the rendered list. An IntersectionObserver (not a click
  // handler) fetches the next page once that element nears the viewport,
  // and the fetched page appends to `liveSignals` via the `pages` memo above.
  const hasNextPageRef = useRef(false);
  hasNextPageRef.current = !!hasNextPage;
  const isFetchingNextPageRef = useRef(false);
  isFetchingNextPageRef.current = isFetchingNextPage;
  const fetchNextPageRef = useRef(fetchNextPage);
  fetchNextPageRef.current = fetchNextPage;

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback((node: Element | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          hasNextPageRef.current &&
          !isFetchingNextPageRef.current
        ) {
          void fetchNextPageRef.current();
        }
      },
      // Fires the fetch before the sentinel is actually on-screen, so the
      // next page is usually loaded by the time the user scrolls to it.
      { rootMargin: "600px" },
    );
    observerRef.current.observe(node);
  }, []);
  useEffect(() => () => observerRef.current?.disconnect(), []);

  return {
    liveSignals,
    justIn,
    resolvedWindow,
    oldestEventDate,
    isLoading,
    isError,
    fallback,
    fallbackReason,
    fallbackLastUpdated,
    total,
    personalizedApplied,
    fetchNextPage,
    hasNextPage: !!hasNextPage,
    isFetchingNextPage,
    sentinelRef,
  };
}
