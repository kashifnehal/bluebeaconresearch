"use client";

import { DATA_SLOW_MESSAGE } from "@/lib/fetch-with-timeout";

export function SlowDataNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 py-6" data-testid="slow-data-notice">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {DATA_SLOW_MESSAGE}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="text-sm font-bold uppercase tracking-widest cursor-pointer"
        style={{ color: "var(--accent)" }}
      >
        Retry
      </button>
    </div>
  );
}
