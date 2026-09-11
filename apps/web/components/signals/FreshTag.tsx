"use client";

import type { CSSProperties } from "react";
import { safeFormatDistanceToNow } from "@/lib/utils";

/** Recency from `signals.created_at` (ingest time), not article `eventDate`. */
export function FreshTag({
  createdAt,
  className,
  style,
}: {
  createdAt?: string | null;
  className?: string;
  style?: CSSProperties;
}) {
  const compact = safeFormatDistanceToNow(createdAt, { compact: true });
  const label = compact === "recently" ? "Fresh recently" : `Fresh ${compact}`;
  return (
    <span data-testid="fresh-tag" className={className} style={style}>
      {label}
    </span>
  );
}
