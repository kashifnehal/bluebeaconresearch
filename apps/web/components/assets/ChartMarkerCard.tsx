import { SeverityBadge } from "@/components/signals/SeverityBadge";
import { directionLabel, type ChartMarker } from "@/lib/chart-markers";

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
}: {
  id: string;
  marker: ChartMarker;
  /** Marker x in px, relative to the chart box. */
  x: number;
  /** Chart box width in px, used to keep the card inside it. */
  boxWidth: number;
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
      className="pointer-events-none absolute top-6 z-10 rounded-lg border border-outline-variant/40 bg-[#141414] p-3 text-left shadow-lg"
      style={{ left, width: CARD_WIDTH, transform: "translateX(-50%)" }}
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
              <dt>Reports</dt>
              <dd>{first.sourcesCount}</dd>
            </div>
          </dl>
        </>
      )}
      <p className="mt-2 text-[10px] font-mono uppercase tracking-widest text-on-surface-variant/70">
        Select to see news around this time
      </p>
    </div>
  );
}
