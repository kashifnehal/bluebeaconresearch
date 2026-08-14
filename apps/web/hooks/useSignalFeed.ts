"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUIStore } from "@/store/useUIStore";
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

  const { searchSubmitted } = useUIStore();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["signals", "feed", searchSubmitted ?? ""],
    queryFn: async () => {
      const url =
        searchSubmitted && searchSubmitted.trim().length >= 3
          ? `/api/signals?search=${encodeURIComponent(searchSubmitted.trim())}`
          : "/api/signals?sort=severity";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch signals");
      return (await res.json()) as {
        signals?: Signal[];
        fallback?: boolean;
        fallbackReason?: string;
        fallbackLastUpdated?: string;
      };
    },
    enabled,
    // Reduce polling frequency to 120s with jitter to lower request volume against rate-limited services
    // Uses a function to add random jitter (0-30s) per interval
    refetchInterval: () => {
      const base = 120_000; // 120s
      const jitter = Math.floor(Math.random() * 30_000); // up to 30s
      return base + jitter;
    },
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

    const connect = async () => {
      if (cancelled) return;
      esRef.current?.close();
      // Mint a short-lived SSE token and connect to the proxy endpoint.
      try {
        const tRes = await fetch("/api/events/token", { method: "POST" });
        if (!tRes.ok) throw new Error("unable to mint sse token");
        const { token } = await tRes.json();
        const es = new EventSource(
          `/api/events/proxy?token=${encodeURIComponent(token)}`,
        );
        esRef.current = es;

        es.onopen = () => {
          retryRef.current = 0;
        };
      } catch (err) {
        // fallback to previous stream if token path fails
        const es = new EventSource("/api/events/stream");
        esRef.current = es;
      }
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
