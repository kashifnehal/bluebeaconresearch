"use client";

import type { CSSProperties } from "react";
import { safeFormatDistanceToNow } from "@/lib/utils";

function isValidTimestamp(value?: string | null): boolean {
  if (!value) return false;
  return Number.isFinite(new Date(value).getTime());
}

/** Reported age when eventDate is a real time; otherwise flagged age from createdAt. */
export function FreshTag({
  createdAt,
  eventDate,
  className,
  style,
}: {
  createdAt?: string | null;
  eventDate?: string | null;
  className?: string;
  style?: CSSProperties;
}) {
  const reported = isValidTimestamp(eventDate);
  const compact = safeFormatDistanceToNow(reported ? eventDate : createdAt, { compact: true });
  const prefix = reported ? "Reported" : "Flagged";
  const label = compact === "recently" ? `${prefix} recently` : `${prefix} ${compact}`;
  return (
    <span data-testid="fresh-tag" className={className} style={style}>
      {label}
    </span>
  );
}
