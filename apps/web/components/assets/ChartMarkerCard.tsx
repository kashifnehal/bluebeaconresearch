import type { FocusEvent } from "react";
import { SeverityBadge } from "@/components/signals/SeverityBadge";
import { InfoCitation } from "@/components/ui/InfoCitation";
import { directionLabel, type ChartMarker } from "@/lib/chart-markers";
import type { MoveSinceEvent } from "@/lib/move-since-event";

export type MarkerPriceContext =
  | { kind: "weekly" }
  | { kind: "series"; move: MoveSinceEvent };

export const PRICE_CONTEXT_NOTE =
  "Descriptive only. Other news and market moves also affect price.";
export const WEEKLY_UNAVAILABLE = "Not available on weekly data";

// Info-citation popover text, as plain exported strings so a test can check
// the claim against the real source without needing the popover open.
export const SINCE_THEN_CITATION =
  "Percent change from the price at or just after this signal's event time " +
  "to the latest stored price, both from the commodity_prices table " +
  "(90-day series). Computed in apps/web/lib/move-since-event.ts.";
export const REPORTS_CITATION =
  "Counts merged reports folded into this signal as it was tracked, not " +
  "distinct news outlets — each time a new raw event matches, " +
  "sources_count increments by 1. See apps/backend/src/workers/signal-merge.ts.";

function formatPrice(price: number): string {
  return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPct(pct: number | null): string {
  if (pct == null) return "—";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

function formatPointTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PriceContext({ context }: { context: MarkerPriceContext }) {
  if (context.kind === "weekly") {
    return (
      <div className="mt-2 border-t border-outline-variant/30 pt-2" data-testid="chart-marker-price-context">
        <p className="text-[11px] font-mono text-on-surface-variant">{WEEKLY_UNAVAILABLE}</p>
        <p className="mt-1 text-[10px] leading-snug text-on-surface-variant/70">{PRICE_CONTEXT_NOTE}</p>
      </div>
    );
  }
  const { move } = context;
  return (
    <div className="mt-2 border-t border-outline-variant/30 pt-2" data-testid="chart-marker-price-context">
      <dl className="space-y-1 text-[11px] font-mono text-on-surface-variant">
        <div className="flex justify-between gap-3">
          <dt>Price at the event</dt>
          <dd className="text-right" title={move.atEvent ? `First recorded point: ${formatPointTime(move.atEvent.t)}` : undefined}>
            {move.atEvent ? formatPrice(move.atEvent.price) : "Not available"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="flex items-center">
            Since then
            <InfoCitation label="Since then">{SINCE_THEN_CITATION}</InfoCitation>
          </dt>
          <dd className="text-right" title={move.latest ? `Latest point: ${formatPointTime(move.latest.t)}` : undefined}>
            {move.latest && move.sincePct != null
              ? `${formatPct(move.sincePct)} (${formatPrice(move.latest.price)})`
              : "Not available"}
          </dd>
        </div>
        <div className="flex justify-between gap-3" data-testid="chart-marker-horizons">
          <dt>After 1h / 4h / 24h</dt>
          <dd className="text-right">
            {formatPct(move.after1hPct)} / {formatPct(move.after4hPct)} / {formatPct(move.after24hPct)}
          </dd>
        </div>
      </dl>
      <p className="mt-1 text-[10px] leading-snug text-on-surface-variant/70">{PRICE_CONTEXT_NOTE}</p>
    </div>
  );
}

const CARD_WIDTH = 264;

function formatReported(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Small descriptive card shown on marker hover or focus. It states what the
 * signal is and when it was reported; it makes no claim about price.
 */
export function ChartMarkerCard({
  id,
  marker,
  x,
  boxWidth,
  priceContext,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
}: {
  id: string;
  marker: ChartMarker;
  /** Marker x in px, relative to the chart box. */
  x: number;
  /** Chart box width in px, used to keep the card inside it. */
  boxWidth: number;
  /** Shown for a single signal only; omitted for merged markers. */
  priceContext?: MarkerPriceContext;
  /**
   * The card itself is interactive (the info-citation "i" buttons), so
   * unlike a plain tooltip it must stay open while the pointer or keyboard
   * focus is inside it, not only while it's on the marker that opened it.
   */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  onBlur?: (e: FocusEvent<HTMLDivElement>) => void;
}) {
  const half = CARD_WIDTH / 2;
  const left = Math.min(Math.max(x, half), Math.max(half, boxWidth - half));
  const first = marker.members[0];
  const times = marker.members.map((m) => m.eventMs);
  const earliest = Math.min(...times);
  const latest = Math.max(...times);

  return (
    <div
      id={id}
      role="tooltip"
      data-testid="chart-marker-card"
      className="absolute top-6 z-10 rounded-lg border border-outline-variant/40 bg-[#141414] p-3 text-left shadow-lg"
      style={{ left, width: CARD_WIDTH, transform: "translateX(-50%)" }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {marker.count > 1 ? (
        <>
          <p className="text-[12px] font-bold leading-snug text-on-surface">
            {marker.count} signals reported close together
          </p>
          <dl className="mt-2 space-y-1 text-[11px] font-mono text-on-surface-variant">
            <div className="flex justify-between gap-3">
              <dt>Reported</dt>
              <dd className="text-right">
                {formatReported(earliest)}
                {latest !== earliest ? ` to ${formatReported(latest)}` : ""}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Highest severity</dt>
              <dd>
                <SeverityBadge score={marker.severity} />
              </dd>
            </div>
          </dl>
          <ul className="mt-2 space-y-1 text-[11px] leading-snug text-on-surface-variant">
            {marker.members.slice(0, 3).map((m) => (
              <li key={m.id} className="truncate">
                {m.title}
              </li>
            ))}
            {marker.count > 3 && <li>and {marker.count - 3} more</li>}
          </ul>
        </>
      ) : (
        <>
          <p className="text-[12px] font-bold leading-snug text-on-surface">{first.title}</p>
          <dl className="mt-2 space-y-1 text-[11px] font-mono text-on-surface-variant">
            <div className="flex justify-between gap-3">
              <dt>Reported</dt>
              <dd className="text-right">{formatReported(first.eventMs)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Severity</dt>
              <dd>
                <SeverityBadge score={first.severity} />
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Direction for this asset</dt>
              <dd>{directionLabel(first.direction)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="flex items-center">
                Reports
                <InfoCitation label="Reports">{REPORTS_CITATION}</InfoCitation>
              </dt>
              <dd>{first.sourcesCount}</dd>
            </div>
          </dl>
          {priceContext && <PriceContext context={priceContext} />}
        </>
      )}
      <p className="mt-2 text-[10px] font-mono uppercase tracking-widest text-on-surface-variant/70">
        Select to see news around this time
      </p>
    </div>
  );
}
