import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNowStrict } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function compactRelative(formatted: string): string {
  return formatted
    .replace(/\s+seconds?( ago)?$/i, "s$1")
    .replace(/\s+minutes?( ago)?$/i, "m$1")
    .replace(/\s+hours?( ago)?$/i, "h$1")
    .replace(/\s+days?( ago)?$/i, "d$1")
    .replace(/\s+months?( ago)?$/i, "mo$1")
    .replace(/\s+years?( ago)?$/i, "y$1");
}

export function safeFormatDistanceToNow(
  dateInput: any,
  options?: { addSuffix?: boolean; compact?: boolean },
): string {
  if (!dateInput) return "recently";
  try {
    const d =
      typeof dateInput === "string" || typeof dateInput === "number"
        ? new Date(dateInput)
        : dateInput;
    if (!(d instanceof Date) || isNaN(d.getTime())) {
      return "recently";
    }
    const { compact, addSuffix } = options ?? {};
    const formatted = formatDistanceToNowStrict(d, { addSuffix });
    return compact ? compactRelative(formatted) : formatted;
  } catch {
    return "recently";
  }
}

/**
 * Shared visual treatment for every native <select> dropdown across the app
 * (Map filters, Watchlist commodity picker, Backtesting selectors). These were
 * each styled independently (different backgrounds, padding, fonts) — this keeps
 * them as plain <select> elements (zero behavior change to onChange/value
 * handling) while making the rendering consistent, per the design-system audit.
 */
export const SELECT_CLASSES =
  "bg-surface-container-high border border-outline-variant rounded-md px-3 py-2 text-xs font-mono uppercase tracking-wide text-on-surface focus:border-primary focus:ring-1 focus:ring-primary/40 outline-none cursor-pointer appearance-none";

export function formatRegionLabel(region?: string | null): string {
  if (!region) return "Global";
  return region
    .split("-")
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * alert_rules.name is NOT NULL in the DB but the "create alert" modals don't
 * collect a name from the user (one-click flow from a signal card). Auto-generate
 * a readable default instead of adding form friction.
 */
export function generateAlertRuleName(
  region?: string | null,
  minSeverity?: number,
  eventType?: string | null,
): string {
  const regionLabel = formatRegionLabel(region);
  const severityLabel =
    typeof minSeverity === "number" ? `Severity ${minSeverity}+` : "Severity Alert";
  if (eventType) {
    const eventLabel = eventType
      .split("_")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
    return `${eventLabel} — ${regionLabel} — ${severityLabel}`;
  }
  return `${regionLabel} — ${severityLabel}`;
}
