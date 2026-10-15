/**
 * Display-only helpers for event-detail / chat / quick-view copy.
 * Thresholds match existing SeverityBadge named labels and the
 * generateAnalysis() severity ≥7 gate — do not invent a new one.
 */

export const HIGH_SEVERITY_THRESHOLD = 7;

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
  return `${asset} ${direction}, model classification confidence ${formatConfidencePercent(confidence)}`;
}

export function priceChangePercent(priceAtSignal: number, currentPrice: number): number {
  if (!Number.isFinite(priceAtSignal) || priceAtSignal === 0) return 0;
  return ((currentPrice - priceAtSignal) / priceAtSignal) * 100;
}

/** Signed percent from `from` to `to`, using `priceChangePercent`. */
export function formatSignedPriceChange(from: number, to: number): string {
  const pct = priceChangePercent(from, to);
  if (pct > 0) return `+${pct.toFixed(1)}%`;
  if (pct < 0) return `${pct.toFixed(1)}%`;
  return "+0.0%";
}

export function delayMinutes(from?: string | null, to?: string | null): number | null {
  if (!from || !to) return null;
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end) return null;
  return Math.round((end - start) / 60_000);
}

export function formatDelay(minutes: number): string {
  if (minutes <= 0) return "under 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

const QUOTE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatQuoteAsOf(iso: string): string | null {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${QUOTE_MONTHS[d.getUTCMonth()]}, ${hh}:${mm} UTC`;
}

export type PriceQuote = { price: number; at: string };

function money(price: number): string {
  return `$${price.toFixed(2)}`;
}

export function formatPriceTimelineLines(
  asset: string,
  first: PriceQuote | null,
  flagged: PriceQuote | null,
  now: PriceQuote | null,
): string[] {
  const lines: string[] = [];
  const firstTime = first ? formatQuoteAsOf(first.at) : null;
  const flaggedTime = flagged ? formatQuoteAsOf(flagged.at) : null;
  const nowTime = now ? formatQuoteAsOf(now.at) : null;

  if (first && firstTime) {
    lines.push(
      `${asset} was ${money(first.price)} at the first linked report (quote as of ${firstTime}).`,
    );
  }
  if (flagged && flaggedTime && first) {
    lines.push(
      `${money(flagged.price)} when BBR flagged it (quote as of ${flaggedTime}, ${formatSignedPriceChange(first.price, flagged.price)}).`,
    );
  }
  if (!flagged) {
    if (first && now && nowTime) {
      lines.push(
        `${money(now.price)} now (quote as of ${nowTime}, ${formatSignedPriceChange(first.price, now.price)} since the first linked report).`,
      );
    }
  } else if (now && nowTime) {
    lines.push(
      `${money(now.price)} now (quote as of ${nowTime}, ${formatSignedPriceChange(flagged.price, now.price)} since BBR flagged it).`,
    );
  }

  if (
    first &&
    flagged &&
    now &&
    first.price === flagged.price &&
    flagged.price === now.price
  ) {
    lines.push("Recorded price unchanged (closed market or unchanged quote)");
  }
  return lines;
}

export type ReportForCount = {
  title?: string | null;
  domain?: string | null;
  url?: string | null;
};

function normalizeHeadline(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/ +/g, " ")
    .trim();
}

function reportDomain(source: ReportForCount): string | null {
  const domain = source.domain?.trim();
  if (domain) return domain.toLowerCase();
  if (!source.url) return null;
  try {
    const host = new URL(source.url).hostname.toLowerCase().replace(/^www\./, "");
    return host.length > 0 ? host : null;
  } catch {
    return null;
  }
}

export function describeReports(sources: ReportForCount[]): string {
  if (sources.length === 1) return "1 report";
  const titles = new Set(sources.map((s) => normalizeHeadline(s.title ?? "")));
  const domains = new Set<string>();
  for (const source of sources) {
    const domain = reportDomain(source);
    if (domain) domains.add(domain);
  }
  const distinctTitles = titles.size;
  const outletCount = domains.size;
  if (distinctTitles === 1) {
    return outletCount === 1 ? "1 outlet, same headline" : `${outletCount} outlets, same headline`;
  }
  return `${outletCount} outlets, ${distinctTitles} distinct headlines`;
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

/**
 * signals.updated_at also moves for non-coverage reasons (severity-gated
 * ai_analysis backfill in signal-generator.ts) — see W3-P7 Step 0. So
 * "updated_at changed" alone can't mean "new reports came in." Require merged
 * coverage (sourcesCount >= 2) AND an actual later updated_at as the proxy for
 * "this signal picked up a later update", not just any touch of the row.
 */
export function shouldShowLastUpdated(
  sourcesCount: number,
  createdAt: string,
  updatedAt?: string | null,
): boolean {
  if (sourcesCount < 2 || !updatedAt) return false;
  const created = new Date(createdAt).getTime();
  const updated = new Date(updatedAt).getTime();
  if (!Number.isFinite(created) || !Number.isFinite(updated)) return false;
  return updated > created;
}
