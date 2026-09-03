"use client";

import { useMemo } from "react";
import { useUIStore } from "@/store/useUIStore";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { Signal } from "@blue-beacon-research/shared";

type Options = {
  enabled?: boolean;
};

export function useSignalFeed({ enabled = true }: Options = {}) {
  const { searchSubmitted } = useUIStore();

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["signals", "feed", searchSubmitted ?? ""],
    initialPageParam: "1",
    queryFn: async ({ pageParam }) => {
      const base =
        searchSubmitted && searchSubmitted.trim().length >= 3
          ? `/api/signals?search=${encodeURIComponent(searchSubmitted.trim())}`
          : "/api/signals?sort=severity";
      const res = await fetch(`${base}&page=${pageParam}`);
      if (!res.ok) throw new Error("Failed to fetch signals");
      return (await res.json()) as {
        signals?: Signal[];
        nextCursor?: string | null;
        total?: number;
        fallback?: boolean;
        fallbackReason?: string;
        fallbackLastUpdated?: string;
      };
    },
    // `nextCursor` is an opaque page token from /api/signals ("2", "3", …) or
    // null at the end. Returning undefined tells react-query there's no next page.
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
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
  const liveSignals = useMemo(
    () => pages.flatMap((p) => p.signals ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data?.pages],
  );
  // Feed-level fallback / total come from the first page — the degraded-mode
  // contract is per-request and page 1 is the one that always loads.
  const fallback = pages[0]?.fallback ?? false;
  const fallbackReason = pages[0]?.fallbackReason ?? null;
  const fallbackLastUpdated = pages[0]?.fallbackLastUpdated ?? null;
  const total = pages[0]?.total ?? null;

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
  };
}
