"use client";

import { useQuery } from "@tanstack/react-query";
import { safeFormatDistanceToNow } from "@/lib/utils";

type IngestionStatusResponse = {
  status: {
    lastFetchedAt: string;
    nextFetchEstimate: string;
    totals: { inserted: number; signals: number; fetched: number };
  } | null;
  cronIntervalMinutes: number;
  // degraded = the pipeline:last_run health feed itself is unavailable (Redis
  // down/quota) and the timestamp below is only inferred from the newest
  // raw_events row — per-collector health is unknown. Distinct from "ingestion
  // delayed", which is a real, known lag.
  degraded?: boolean;
  reason?: string | null;
};

export function IngestionStatusBanner() {
  const { data } = useQuery({
    queryKey: ["ingestion", "status"],
    queryFn: async () => {
      const res = await fetch("/api/ingestion/status");
      if (!res.ok) throw new Error("Failed to fetch ingestion status");
      return (await res.json()) as IngestionStatusResponse;
    },
    refetchInterval: 30_000,
  });

  const status = data?.status;
  if (!status?.lastFetchedAt) return null;

  const degraded = data?.degraded ?? false;
  const lastFetched = new Date(status.lastFetchedAt);
  const nextFetch = status.nextFetchEstimate ? new Date(status.nextFetchEstimate) : null;
  const isStale = Date.now() - lastFetched.getTime() > 20 * 60 * 1000;
  const notHealthy = isStale || degraded;

  return (
    <div
      className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded border px-4 py-2.5 text-[11px] tracking-wide"
      style={{
        fontFamily: "'Space Grotesk', sans-serif",
        backgroundColor: notHealthy ? "#2a1f1f" : "#1a2420",
        borderColor: notHealthy ? "#6b3030" : "#3c4a42",
        color: notHealthy ? "#f0a0a0" : "#bbcac0",
      }}
    >
      <span className="flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: notHealthy ? "#ef4444" : "#4edea3" }}
        />
        <span className="font-bold uppercase" style={{ color: notHealthy ? "#f0a0a0" : "#4edea3" }}>
          {degraded ? "Ingestion status unavailable" : isStale ? "Ingestion delayed" : "Live ingestion"}
        </span>
      </span>

      <span>
        Last fetched{" "}
        <strong style={{ color: "#e5e2e1" }}>
          {safeFormatDistanceToNow(lastFetched, { addSuffix: true })}
        </strong>
      </span>

      {nextFetch && !degraded && (
        <span>
          {nextFetch.getTime() < Date.now() ? "Next run overdue by ~" : "Next run in ~"}
          <strong style={{ color: "#e5e2e1" }}>
            {safeFormatDistanceToNow(nextFetch)}
          </strong>
        </span>
      )}

      {degraded && (
        <span style={{ opacity: 0.9 }}>
          {data?.reason ?? "Per-collector health is temporarily unavailable."}
        </span>
      )}

      {status.totals.inserted > 0 && (
        <span>
          Last run:{" "}
          <strong style={{ color: "#4edea3" }}>
            +{status.totals.signals} signal{status.totals.signals !== 1 ? "s" : ""}
          </strong>{" "}
          ({status.totals.fetched} articles scanned)
        </span>
      )}

      <span className="opacity-70">Every {data?.cronIntervalMinutes ?? 15} min · RSS · GNews · GDELT</span>
    </div>
  );
}
