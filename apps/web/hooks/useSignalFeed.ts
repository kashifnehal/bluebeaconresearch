"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Signal } from "@blue-beacon-research/shared";

type Options = {
  enabled?: boolean;
};

export function useSignalFeed({ enabled = true }: Options = {}) {
  const [realtimeSignals, setRealtimeSignals] = useState<Signal[]>([]);
  const retryRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["signals", "feed"],
    queryFn: async () => {
      const res = await fetch("/api/signals?sort=severity");
      if (!res.ok) throw new Error("Failed to fetch signals");
      return (await res.json()) as {
        signals?: Signal[];
        fallback?: boolean;
        fallbackReason?: string;
        fallbackLastUpdated?: string;
      };
    },
    enabled,
    // Reduce polling frequency to 60s to lower request volume against rate-limited services
    refetchInterval: 60_000,
  });

  const fetchedSignals = data?.signals ?? [];
  const fallback = data?.fallback ?? false;
  const fallbackReason = data?.fallbackReason ?? null;
  const fallbackLastUpdated = data?.fallbackLastUpdated ?? null;

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
      const es = new EventSource("/api/events/stream");
      esRef.current = es;

      es.onmessage = (evt) => {
        try {
          const signal = JSON.parse(evt.data) as Signal;
          setRealtimeSignals((prev) => [signal, ...prev]);
          if (signal.severity >= 8)
            toast(signal.title, { description: signal.summary });
        } catch {
          // ignore
        }
      };

      es.onerror = () => {
        es.close();
        retryRef.current += 1;
        const backoff = Math.min(
          30_000,
          1000 * 2 ** Math.min(5, retryRef.current),
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
  };
}
