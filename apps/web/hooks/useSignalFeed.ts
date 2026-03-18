"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Signal } from "@geosignal/shared";

type Options = {
  enabled?: boolean;
};

export function useSignalFeed({ enabled = true }: Options = {}) {
  const [liveSignals, setLiveSignals] = useState<Signal[]>([]);
  const retryRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);

  const supportsSSE = useMemo(() => typeof window !== "undefined" && "EventSource" in window, []);

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
          setLiveSignals((prev) => [signal, ...prev]);
          if (signal.severity >= 8) toast(signal.title, { description: signal.summary });
        } catch {
          // ignore
        }
      };

      es.onerror = () => {
        es.close();
        retryRef.current += 1;
        const backoff = Math.min(30_000, 1000 * 2 ** Math.min(5, retryRef.current));
        setTimeout(connect, backoff);
      };
    };

    connect();
    return () => {
      cancelled = true;
      esRef.current?.close();
    };
  }, [enabled, supportsSSE]);

  return { liveSignals };
}

