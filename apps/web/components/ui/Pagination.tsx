"use client";

import { cn } from "@/lib/utils";

type PaginationProps = {
  /** 1-indexed current page. */
  page: number;
  /** Total number of pages. */
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Disables both controls (e.g. while the next page is loading). */
  disabled?: boolean;
  className?: string;
};

/**
 * Shared Prev / "Page X of Y" / Next control for bounded, discrete result sets
 * scoped to one entity (Watchlist drill-down's correlated signals, Alerts'
 * matched-signals-per-rule). Neutral styling so it sits on any surface.
 *
 * Renders nothing for a single page — callers don't need to guard.
 */
export function Pagination({
  page,
  pageCount,
  onPageChange,
  disabled = false,
  className,
}: PaginationProps) {
  if (pageCount <= 1) return null;

  const canPrev = page > 1 && !disabled;
  const canNext = page < pageCount && !disabled;

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center justify-center gap-4 py-3", className)}
    >
      <button
        type="button"
        onClick={() => canPrev && onPageChange(page - 1)}
        disabled={!canPrev}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border border-white/10 text-white/60 transition-colors hover:text-white hover:border-white/25 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
      >
        <span className="material-symbols-outlined text-sm">chevron_left</span>
        Prev
      </button>
      <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 font-mono">
        Page {page} of {pageCount}
      </span>
      <button
        type="button"
        onClick={() => canNext && onPageChange(page + 1)}
        disabled={!canNext}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border border-white/10 text-white/60 transition-colors hover:text-white hover:border-white/25 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
      >
        Next
        <span className="material-symbols-outlined text-sm">chevron_right</span>
      </button>
    </nav>
  );
}
