"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUIStore } from "@/store/useUIStore";
import { useInfiniteQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Signal } from "@blue-beacon-research/shared";

type Options = {
  enabled?: boolean;
};

export function useSignalFeed({ enabled = true }: Options = {}) {
  const [realtimeSignals, setRealtimeSignals] = useState<Signal[]>([]);
  const retryRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);

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
    // Step 3 stopgap: Fallback polling interval 90s ±10s random jitter to avoid synchronized bursts
    refetchInterval: () => {
      const base = 90_000;
      const jitter = Math.floor(Math.random() * 20_000) - 10_000; // ±10s
      return base + jitter;
    },
  });

  const pages = data?.pages ?? [];
  const fetchedSignals = useMemo(
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

  const supportsSSE = useMemo(
    () => typeof window !== "undefined" && "EventSource" in window,
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    if (!supportsSSE) return;

    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      esRef.current?.close();

      console.log("[sse] Opening EventSource stream...");
      const es = new EventSource("/api/events/stream");
      esRef.current = es;

      es.onopen = () => {
        retryRef.current = 0;
        console.log("[sse] EventSource stream connected & active");
      };

      es.onmessage = (evt) => {
        try {
          const signal = JSON.parse(evt.data) as Signal;
          console.log("[sse] Received realtime signal:", signal.title);
          setRealtimeSignals((prev) => [signal, ...prev]);
          if (signal.severity >= 8)
            toast(signal.title, { description: signal.summary });
        } catch {
          // ignore malformed SSE frames
        }
      };

      es.onerror = (err) => {
        es.close();
        retryRef.current += 1;

        // Step 2 exponential backoff: 1s -> 2s -> 4s -> 8s -> 16s -> capped at 30s
        const backoff = Math.min(
          30_000,
          1000 * 2 ** Math.min(5, retryRef.current),
        );
        console.warn(
          `[sse] Stream error (attempt ${retryRef.current}). Reconnecting in ${backoff / 1000}s...`,
          err,
        );
        setTimeout(connect, backoff);
      };
    };

    connect();
    return () => {
      cancelled = true;
      esRef.current?.close();
    };
  }, [enabled, supportsSSE]);

  const liveSignals = useMemo(() => {
    // Combine realtime SSE signals with initial fetched signals, deduplicating by ID
    const map = new Map<string, Signal>();
    for (const s of realtimeSignals) {
      map.set(s.id, s);
    }
    for (const s of fetchedSignals) {
      if (!map.has(s.id)) {
        map.set(s.id, s);
      }
    }
    return Array.from(map.values());
  }, [realtimeSignals, fetchedSignals]);

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
