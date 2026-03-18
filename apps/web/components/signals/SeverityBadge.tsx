"use client";

import { SEVERITY_CONFIG } from "@geosignal/shared";

export function SeverityBadge({ score }: { score: number }) {
  let label = "Low";
  if (score >= 10) label = SEVERITY_CONFIG[10].label;
  else if (score >= 9) label = SEVERITY_CONFIG[9].label;
  else if (score >= 8) label = SEVERITY_CONFIG[8].label;
  else if (score >= 7) label = SEVERITY_CONFIG[7].label;

  const cls =
    score >= 9
      ? "bg-danger text-white"
      : score >= 8
        ? "bg-warning text-black"
        : score >= 7
          ? "bg-warning/30 text-warning"
          : "bg-surface-secondary text-text-muted";

  return (
    <span className={`inline-flex items-center gap-1 rounded-md text-xs font-semibold px-2 py-0.5 ${cls}`}>
      <span>{score}</span>
      <span>{label}</span>
    </span>
  );
}

