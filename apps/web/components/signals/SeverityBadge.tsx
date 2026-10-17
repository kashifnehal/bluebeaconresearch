"use client";

import { SEVERITY_CONFIG } from "@blue-beacon-research/shared";

export function SeverityBadge({ score }: { score: number }) {
  // GAP: SEVERITY_CONFIG (packages/shared/src/constants/commodities.ts) only
  // defines sourced labels for 7-10 (Elevated/High/Extreme/Critical), matching
  // docs/claude_project/17_SIGNAL_ENGINE.md section 2.1's severity scale. That
  // doc also defines labels for 1-6 (Minimal/Low/Medium/Medium-High), but
  // those were never added to SEVERITY_CONFIG, so there is no sourced label to
  // show below 7 — a hardcoded "Low" for the whole 1-6 range was invented and
  // didn't match the doc's own distinct bands. Show the number only until
  // SEVERITY_CONFIG is extended for 1-6.
  let label: string | null = null;
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
          : "bg-surface-container-low text-outline";

  return (
    <span className={`inline-flex items-center gap-1 rounded-md text-xs font-semibold px-2 py-0.5 ${cls}`}>
      <span>{score}</span>
      {label && <span>{label}</span>}
    </span>
  );
}

