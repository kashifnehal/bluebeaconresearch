"use client";

import type { Signal } from "@blue-beacon-research/shared";
import { safeFormatDistanceToNow } from "@/lib/utils";
import { SeverityBadge } from "@/components/signals/SeverityBadge";
import { CommodityChip } from "@/components/signals/CommodityChip";
import { FreshTag } from "@/components/signals/FreshTag";
import { sourceConfirmationLabel } from "@/lib/market-impact-assessment";

export function MapSignalPopup({
  signal,
  onClose,
  offsetLeft,
}: {
  signal: Signal;
  onClose: () => void;
  offsetLeft: string;
}) {
  const timeAgo = safeFormatDistanceToNow(signal.eventDate ?? signal.createdAt);
  const confirmationLabel = sourceConfirmationLabel(signal.sourceConfirmation);
  const impacts = [...(signal.commodityImpacts ?? [])].sort(
    (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0),
  );

  return (
    <>
      {/* offsetLeft only matters at md+, where the desktop filters panel can occupy the
          left side of the map. Below md that panel never renders (map/page.tsx hides it),
          so the backdrop/popup use plain full-width mobile positioning instead — passing
          offsetLeft through inline `left` at every breakpoint would otherwise make the
          popup `min(22rem, 100vw-26rem)` wide, which is negative (invisible/off-screen)
          on any phone viewport. Desktop pixel values are unchanged. */}
      <button
        type="button"
        aria-label="Close event details"
        className="fixed inset-0 md:absolute md:inset-y-0 md:left-[var(--popup-offset)] md:right-0 z-30 bg-black/20"
        style={{ "--popup-offset": offsetLeft } as React.CSSProperties}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-event-title"
        data-testid="map-event-popup"
        className="fixed md:absolute left-4 right-4 md:left-[calc(var(--popup-offset)+1rem)] md:right-auto top-24 w-auto md:w-[min(22rem,calc(100vw-26rem))] max-h-[min(70vh,32rem)] overflow-y-auto overflow-x-hidden rounded-xl border border-outline-variant/40 bg-[#131313] p-4 shadow-2xl z-40"
        style={{ "--popup-offset": offsetLeft } as React.CSSProperties}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <SeverityBadge score={signal.severity} />
            {confirmationLabel != null && (
              <span className="font-mono text-[12px] md:text-[10px] text-on-surface-variant uppercase tracking-wider">
                {confirmationLabel}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-7 h-7 rounded-md border border-outline-variant/40 text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>

        <h2
          id="map-event-title"
          className="text-sm font-bold text-on-surface leading-snug mb-2 break-words [overflow-wrap:anywhere]"
        >
          {signal.title}
        </h2>

        {signal.summary ? (
          <p className="text-[12px] leading-relaxed text-on-surface-variant mb-3 break-words [overflow-wrap:anywhere]">
            {signal.summary}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 font-mono text-[12px] md:text-[10px] text-on-surface-variant uppercase tracking-wider">
          <FreshTag createdAt={signal.createdAt} className="text-primary normal-case tracking-normal" />
          <span>{timeAgo} ago</span>
          <span>
            {signal.sourcesCount ?? 1} source
            {(signal.sourcesCount ?? 1) === 1 ? "" : "s"}
          </span>
          {signal.country ? <span className="normal-case">{signal.country}</span> : null}
        </div>

        {impacts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {impacts.slice(0, 4).map((c) => (
              <CommodityChip
                key={`${signal.id}-${c.asset}`}
                asset={c.asset}
                direction={c.direction}
                confidence={c.confidence}
                size="sm"
              />
            ))}
          </div>
        )}

        <a
          href={`/events/${signal.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 label text-[12px] md:text-[10px] font-bold tracking-[0.12em] text-primary hover:underline"
        >
          VIEW FULL SIGNAL
          <span className="material-symbols-outlined text-[12px]">arrow_forward</span>
        </a>
      </div>
    </>
  );
}
