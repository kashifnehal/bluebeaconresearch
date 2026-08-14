import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNowStrict } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function safeFormatDistanceToNow(
  dateInput: any,
  options?: { addSuffix?: boolean },
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
    return formatDistanceToNowStrict(d, options);
  } catch {
    return "recently";
  }
}

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
