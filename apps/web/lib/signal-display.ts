/**
 * Display-only helpers for event-detail / chat / quick-view copy.
 * Thresholds match existing SeverityBadge named labels and the
 * generateAnalysis() severity ≥7 gate — do not invent a new one.
 */

export const HIGH_SEVERITY_THRESHOLD = 7;
export const FLAT_PRICE_CHANGE_THRESHOLD_PCT = 0.05;

export type HistoryErrorCode =
  | "unauthorized"
  | "early_access_only"
  | "server_error"
  | "network_error";

export const HISTORY_ERROR_COPY: Record<HistoryErrorCode, string> = {
  unauthorized: "Your session expired — sign in again to load this conversation.",
  early_access_only:
    "AI Chat is currently available to early-access members. The briefing, impacts, and sources on this page stay available.",
  server_error:
    "We couldn't load this conversation because of a server problem. Please try again shortly.",
  network_error:
    "We couldn't reach the server to load this conversation. Check your connection and try again.",
};

export function historyErrorCodeFromResponse(
  status: number,
  body?: { error?: string } | null,
): HistoryErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403 || body?.error === "chat_early_access_only") {
    return "early_access_only";
  }
  if (status >= 500) return "server_error";
  return "server_error";
}

export function formatConfidencePercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function commodityChipAriaLabel(
  asset: string,
  direction: string,
  confidence: number,
): string {
  return `${asset} ${direction}, ${formatConfidencePercent(confidence)} confidence`;
}

export function priceChangePercent(priceAtSignal: number, currentPrice: number): number {
  if (!Number.isFinite(priceAtSignal) || priceAtSignal === 0) return 0;
  return ((currentPrice - priceAtSignal) / priceAtSignal) * 100;
}

export function formatPriceSinceFiredSubtext(
  asset: string,
  priceAtSignal: number,
  currentPrice: number,
): string {
  const pct = priceChangePercent(priceAtSignal, currentPrice);
  if (Math.abs(pct) < FLAT_PRICE_CHANGE_THRESHOLD_PCT) {
    return "No price move recorded yet since this fired";
  }
  const sign = currentPrice >= priceAtSignal ? "+" : "";
  return `${asset} was $${priceAtSignal.toFixed(2)} when this fired. Now: $${currentPrice.toFixed(2)} (${sign}${pct.toFixed(1)}%)`;
}

export function eventAlertCta(severity: number): {
  label: string;
  variant: "severe" | "standard";
} {
  if (severity >= HIGH_SEVERITY_THRESHOLD) {
    return { label: "CREATE SEVERE ALERT", variant: "severe" };
  }
  return { label: "Create Alert", variant: "standard" };
}

export type EmptyBriefingKind = "severity_gated" | "pipeline_failure";

export function emptyBriefingCopy(
  severity: number,
  variant: "page" | "compact" = "page",
): { kind: EmptyBriefingKind; text: string } {
  if (severity >= HIGH_SEVERITY_THRESHOLD) {
    return {
      kind: "pipeline_failure",
      text:
        variant === "compact"
          ? "A full briefing should have been generated for this signal and isn't available yet."
          : "A full briefing should have been generated for this signal and isn't available yet. Please check back shortly.",
    };
  }
  if (variant === "compact") {
    return {
      kind: "severity_gated",
      text: `Full briefings are written for Severity ${HIGH_SEVERITY_THRESHOLD}+ signals. This one is Severity ${severity}.`,
    };
  }
  return {
    kind: "severity_gated",
    text: `Full analyst briefings are generated for our highest-severity signals. This signal is Severity ${severity} — see the summary and sources above for the full picture.`,
  };
}

/** ANALYSIS-tab source-count line was removed (#137). SOURCES tab owns this. */
export function analysisVerificationCopy(_sourcesCount: number): string | null {
  return null;
}
