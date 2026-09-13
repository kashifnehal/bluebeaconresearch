"use client";

/**
 * #142 — sourced historical communicator tag. Shown only when
 * signals.media_impact_entity is set. Copy describes a documented
 * historical reaction pattern; it is not a forecast and not a
 * buy/sell recommendation.
 */
export function MediaImpactTag({
  entity,
  caveat,
  expanded = false,
}: {
  entity?: string | null;
  caveat?: string | null;
  expanded?: boolean;
}) {
  if (!entity) return null;

  const short =
    (caveat && caveat.trim()) ||
    "Sourced historical reaction pattern for this communicator.";
  const hover = `${entity}: ${short} Historical pattern only — not a forecast.`;

  return (
    <span className="inline-flex max-w-full flex-col gap-1" data-testid="media-impact-tag">
      <span
        className="inline-flex w-fit items-center rounded-sm border border-sky-400/40 bg-sky-400/10 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-sky-200"
        title={hover}
        aria-label={hover}
      >
        [Media-Impact]
      </span>
      {expanded ? (
        <span
          className="text-[11px] leading-snug text-on-surface-variant"
          data-testid="media-impact-detail"
        >
          {entity}. {short} Historical pattern only — not a forecast.
        </span>
      ) : null}
    </span>
  );
}
