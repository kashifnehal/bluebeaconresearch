"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";
import type { Signal } from "@blue-beacon-research/shared";
import { symbolsForCommodityFilter } from "@/lib/signal-filters";

type Options = {
  enabled?: boolean;
  commodity?: string | null;
  region?: string | null;
  from?: string | null;
  to?: string | null;
  search?: string | null;
};

export function useArchiveFeed({
  enabled = true,
  commodity = null,
  region = null,
  from = null,
  to = null,
  search = null,
}: Options = {}) {
  const searchQ = search && search.trim().length >= 3 ? search.trim() : "";

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
      "archive",
      commodity ?? "",
      region ?? "",
      from ?? "",
      to ?? "",
      searchQ,
    ],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("mode", "archive");
      params.set("sort", "newest");
      const symbols = symbolsForCommodityFilter(commodity);
      if (symbols.length > 0) params.set("commodity", symbols.join(","));
      if (region) params.set("region", region);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (searchQ) params.set("search", searchQ);
      if (pageParam) params.set("page", pageParam);

      const res = await fetch(`/api/signals?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch archive");
      return (await res.json()) as {
        signals?: Signal[];
        nextCursor?: string | null;
        total?: number;
        fallback?: boolean;
        fallbackReason?: string;
        fallbackLastUpdated?: string;
      };
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    placeholderData: keepPreviousData,
  });

  const pages = data?.pages ?? [];
  const liveSignals = useMemo(
    () => pages.flatMap((p) => p.signals ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data?.pages],
  );
  const fallback = pages[0]?.fallback ?? false;
  const fallbackReason = pages[0]?.fallbackReason ?? null;
  const fallbackLastUpdated = pages[0]?.fallbackLastUpdated ?? null;
  const total = pages[0]?.total ?? null;

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
      { rootMargin: "600px" },
    );
    observerRef.current.observe(node);
  }, []);
  useEffect(() => () => observerRef.current?.disconnect(), []);

  return {
    liveSignals,
    isLoading,
    isError,
    fallback,
    fallbackReason,
    fallbackLastUpdated,
    total,
    fetchNextPage,
    hasNextPage: !!hasNextPage,
    isFetchingNextPage,
    sentinelRef,
  };
}
