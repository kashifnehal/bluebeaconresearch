"use client";

import { MapPin, Bookmark } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import type { Signal } from "@geosignal/shared";

import { SeverityBadge } from "./SeverityBadge";
import { CommodityChip } from "./CommodityChip";

export function SignalCard({
  signal,
  variant = "feed",
  onClick,
}: {
  signal: Signal;
  variant?: "feed" | "compact";
  onClick?: () => void;
}) {
  const isBreaking = signal.isBreaking || signal.severity >= 9;
  const timeAgo = formatDistanceToNowStrict(new Date(signal.createdAt), { addSuffix: true });

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      className={[
        "bg-surface-elevated/60 backdrop-blur-2xl border border-border-subtle/20 rounded-xl p-4 cursor-pointer transition-colors duration-150",
        "hover:border-accent/40 hover:bg-surface-secondary",
        isBreaking ? "border-l-4 border-danger bg-danger-subtle/50" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <SeverityBadge score={signal.severity} />
          <span className="text-text-muted text-xs uppercase tracking-wide">
            {signal.eventType}
          </span>
        </div>
        <div className="flex items-center gap-2 text-text-muted text-xs">
          <span>{timeAgo}</span>
          <span>{signal.sourcesCount} sources</span>
          {variant === "feed" ? (
            <Bookmark className="text-text-muted hover:text-text-primary" size={14} />
          ) : null}
        </div>
      </div>

      <div className="mt-2 mb-1 text-text-primary text-base font-medium leading-snug line-clamp-2">
        {signal.title}
      </div>
      <div className="text-text-secondary text-sm line-clamp-2 mb-3">
        {signal.summary}
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {signal.commodityImpacts?.map((c) => (
          <CommodityChip
            key={`${signal.id}-${c.asset}`}
            asset={c.asset}
            direction={c.direction}
            confidence={c.confidence}
            size={variant === "compact" ? "sm" : "md"}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-text-muted text-xs">
          <MapPin size={12} />
          <span>{signal.country}</span>
        </div>
      </div>
    </div>
  );
}

