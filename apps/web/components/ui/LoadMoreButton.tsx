"use client";

import { cn } from "@/lib/utils";

type LoadMoreButtonProps = {
  /** Whether there are more items to fetch/reveal. */
  hasMore: boolean;
  /** A fetch/reveal is in flight. */
  isLoading: boolean;
  onClick: () => void;
  /** How many items are currently rendered (drives the end-of-results copy). */
  loadedCount: number;
  /** Real total across all pages, when the API reports it. */
  totalCount?: number | null;
  /** Shown (muted) once there's nothing left to load. */
  endLabel?: string;
  className?: string;
};

/**
 * Shared "Load more" control for the continuously-updating streams (Intelligence
 * Feed, Map sidebar). Neutral styling (white/opacity utilities) so it reads
 * correctly on every surface it's dropped onto — the near-black feed, the glass
 * map panel — without pulling in a page-specific palette.
 *
 * Renders nothing when there are zero items loaded (the parent owns the empty
 * state); an honest muted end-of-results line once `hasMore` is false.
 */
export function LoadMoreButton({
  hasMore,
  isLoading,
  onClick,
  loadedCount,
  totalCount,
  endLabel = "End of results",
  className,
}: LoadMoreButtonProps) {
  if (loadedCount === 0) return null;

  if (!hasMore) {
    return (
      <div
        className={cn(
          "py-4 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-white/30",
          className,
        )}
      >
        {endLabel}
        {typeof totalCount === "number" ? ` · ${totalCount} total` : ""}
      </div>
    );
  }

  return (
    <div className={cn("py-4 flex justify-center", className)}>
      <button
        type="button"
        onClick={onClick}
        disabled={isLoading}
        aria-busy={isLoading}
        className="inline-flex items-center gap-2 px-5 py-2 text-[11px] font-bold uppercase tracking-widest border border-white/10 text-white/60 transition-colors hover:text-white hover:border-white/25 disabled:opacity-50 disabled:cursor-wait cursor-pointer"
      >
        {isLoading ? (
          <>
            <span className="material-symbols-outlined text-sm animate-spin">
              progress_activity
            </span>
            Loading…
          </>
        ) : (
          <>
            Load more
            {typeof totalCount === "number" && totalCount > loadedCount
              ? ` (${loadedCount} of ${totalCount})`
              : ""}
          </>
        )}
      </button>
    </div>
  );
}
