"use client";

import type { ChartMarker } from "@/lib/chart-markers";

const LIST_WIDTH = 280;

function formatMemberTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Click/keyboard-focus panel for a merged marker (count > 1): a scrollable
 * list of every signal it groups, each linking to its own event page. The
 * hover card (ChartMarkerCard) stays a summary only; this is the full list.
 */
export function ChartMarkerList({
  marker,
  x,
  boxWidth,
  onClose,
}: {
  marker: ChartMarker;
  /** Marker x in px, relative to the chart box. */
  x: number;
  /** Chart box width in px, used to keep the panel inside it. */
  boxWidth: number;
  onClose: () => void;
}) {
  const half = LIST_WIDTH / 2;
  const left = Math.min(Math.max(x, half), Math.max(half, boxWidth - half));

  return (
    <div
      role="dialog"
      aria-label={`${marker.count} signals reported close together`}
      data-testid="chart-marker-list"
      className="absolute top-6 z-20 rounded-lg border border-outline-variant/40 bg-[#141414] p-3 text-left shadow-lg"
      style={{ left, width: LIST_WIDTH, transform: "translateX(-50%)" }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-[12px] font-bold uppercase tracking-widest text-on-surface">
          {marker.count} signals
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-on-surface-variant hover:text-on-surface min-w-[32px] min-h-[32px] flex items-center justify-center"
        >
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>
      <ul className="space-y-2 overflow-y-auto" style={{ maxHeight: 220 }}>
        {marker.members.map((m) => (
          <li
            key={m.id}
            className="border-t border-outline-variant/20 pt-2 first:border-t-0 first:pt-0"
          >
            <a
              href={`/events/${m.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block hover:text-primary transition-colors"
            >
              <span className="block text-[12px] font-bold leading-snug text-on-surface">
                {m.title}
              </span>
              <span className="block text-[10px] font-mono text-on-surface-variant uppercase tracking-widest mt-0.5">
                {formatMemberTime(m.eventMs)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
