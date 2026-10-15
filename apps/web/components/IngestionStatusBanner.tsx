"use client";

import { useQuery } from "@tanstack/react-query";
import {
  allCollectorsBudgetClosed,
  COLLECTION_PAUSED_SENTENCE,
  newestStoredArticleIso,
  type CollectorBudgetSnapshot,
} from "@/lib/ingestion-budget-banner";
import { COLLECTOR_HEALTH_UNAVAILABLE } from "@/lib/user-error-copy";
import { safeFormatDistanceToNow } from "@/lib/utils";

type IngestionStatusResponse = {
  status: {
    lastFetchedAt: string;
    nextFetchEstimate: string;
    totals: { inserted: number; signals: number; fetched: number };
    collectors?: Record<string, CollectorBudgetSnapshot | null>;
    /** Present only when the payload already carries a stored-article time. */
    newestStoredArticleAt?: string;
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
      const json = (await res.json()) as IngestionStatusResponse;
      if (json.degraded && json.reason) {
        console.error("[ingestion-status] per-collector health unknown:", json.reason);
      }
      return json;
    },
    refetchInterval: 30_000,
  });

  return <IngestionStatusBannerView data={data} />;
}

export function IngestionStatusBannerView({ data }: { data: IngestionStatusResponse | undefined }) {
  const status = data?.status;
  if (!status?.lastFetchedAt) return null;

  const degraded = data?.degraded ?? false;
  const budgetPaused = allCollectorsBudgetClosed(status.collectors);
  const articleIso = newestStoredArticleIso(status);
  const lastFetched = new Date(status.lastFetchedAt);
  const nextFetch = status.nextFetchEstimate ? new Date(status.nextFetchEstimate) : null;
  // Scales with the real cadence (cronIntervalMinutes) rather than a fixed 20 min —
  // a fixed threshold shorter than the actual interval flagged "delayed" for the
  // back half of every normal cycle. 1.5x gives one cycle's worth of slack before
  // a real miss is flagged.
  const cronIntervalMinutes = data?.cronIntervalMinutes ?? 15;
  const isStale = Date.now() - lastFetched.getTime() > cronIntervalMinutes * 1.5 * 60 * 1000;
  const notHealthy = isStale || degraded || budgetPaused;

  return (
    <div
      className="mb-4 md:mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded border px-4 py-2.5 text-[12px] md:text-[11px] tracking-wide"
      style={{
        fontFamily: "'Space Grotesk', sans-serif",
        backgroundColor: notHealthy ? "#2a1f1f" : "#1a2420",
        borderColor: notHealthy ? "#6b3030" : "var(--border)",
        color: notHealthy ? "#f0a0a0" : "var(--text-secondary)",
      }}
    >
      <span className="flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: notHealthy ? "#ef4444" : "var(--accent)" }}
        />
        <span className="font-bold uppercase" style={{ color: notHealthy ? "#f0a0a0" : "var(--accent)" }}>
          {budgetPaused
            ? "Collection paused"
            : degraded
              ? "Ingestion status unavailable"
              : isStale
                ? "Ingestion delayed"
                : "Live ingestion"}
        </span>
      </span>

      {budgetPaused ? (
        <span>{COLLECTION_PAUSED_SENTENCE}</span>
      ) : (
        <span>
          Last fetched{" "}
          <strong style={{ color: "#e5e2e1" }}>
            {safeFormatDistanceToNow(lastFetched, { addSuffix: true })}
          </strong>
        </span>
      )}

      {budgetPaused && articleIso && (
        <span>
          Last collected:{" "}
          <strong style={{ color: "#e5e2e1" }}>
            {safeFormatDistanceToNow(articleIso, { addSuffix: true })}
          </strong>
        </span>
      )}

      {nextFetch && !degraded && !budgetPaused && (
        <span>
          {nextFetch.getTime() < Date.now() ? "Next run overdue by ~" : "Next run in ~"}
          <strong style={{ color: "#e5e2e1" }}>
            {safeFormatDistanceToNow(nextFetch)}
          </strong>
        </span>
      )}

      {degraded && (
        <span style={{ opacity: 0.9 }}>
          {/* Assumes transience: API has no last-healthy timestamp for
              pipeline:last_run. lastFetchedAt in fallback mode is newest
              raw_events.created_at, not how long Redis/collector health has
              been unknown. Do not interpolate data.reason — that string
              names Upstash/Redis internals. */}
          {COLLECTOR_HEALTH_UNAVAILABLE}
        </span>
      )}

      {status.totals.inserted > 0 && (
        <span>
          Last run:{" "}
          <strong style={{ color: "var(--accent)" }}>
            +{status.totals.signals} signal{status.totals.signals !== 1 ? "s" : ""}
          </strong>{" "}
          ({status.totals.fetched} articles scanned)
        </span>
      )}

      {!budgetPaused && (
        <span className="opacity-70">Every {cronIntervalMinutes} min · RSS · GNews · GDELT</span>
      )}
    </div>
  );
}
