"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import type { Signal } from "@blue-beacon-research/shared";
import { SeverityBadge } from "@/components/signals/SeverityBadge";
import { CommodityChip } from "@/components/signals/CommodityChip";
import { logUsageEvent, signalEventMetadata } from "@/lib/funnel-events";
import {
  collectMarketImpacts,
  eventCategoryLabel,
  formatImpactDirections,
  sourceConfirmationLabel,
} from "@/lib/market-impact-assessment";
import { formatConfidencePercent, shouldShowLastUpdated } from "@/lib/signal-display";
import { uniqueSourceCount } from "@/lib/source-host";
import { safeFormatDistanceToNow } from "@/lib/utils";

const HEADLINE_LIMIT = 5;

export type QuickViewHeadline = {
  title: string;
  url: string | null;
  sourceLabel: string | null;
  domain: string | null;
  publishedAt: string | null;
};

type DetailState =
  | { status: "idle" }
  | { status: "loading"; id: string }
  | { status: "ready"; id: string; sources: QuickViewHeadline[] }
  | { status: "error"; id: string };

const detailCache = new Map<string, DetailState>();

export function clearQuickViewDetailCache(): void {
  detailCache.clear();
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

async function loadQuickViewDetail(
  id: string,
  signal?: AbortSignal,
): Promise<DetailState> {
  try {
    const res = await fetch(`/api/signals/${id}`, { signal });
    if (!res.ok) {
      const failed: DetailState = { status: "error", id };
      detailCache.set(id, failed);
      return failed;
    }
    const body = (await res.json()) as { sources?: unknown };
    if (!Array.isArray(body?.sources)) {
      const failed: DetailState = { status: "error", id };
      detailCache.set(id, failed);
      return failed;
    }
    const sources: QuickViewHeadline[] = body.sources.map((row) => {
      const source = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      return {
        title: asString(source.title) ?? "Untitled source",
        url: asString(source.url),
        sourceLabel: asString(source.sourceLabel),
        domain: asString(source.domain),
        publishedAt: asString(source.publishedAt),
      };
    });
    const ready: DetailState = { status: "ready", id, sources };
    detailCache.set(id, ready);
    return ready;
  } catch (err) {
    if (isAbortError(err)) throw err;
    const failed: DetailState = { status: "error", id };
    detailCache.set(id, failed);
    return failed;
  }
}

function Part({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div
        className="text-[12px] md:text-[9px] font-black uppercase tracking-widest"
        style={{ color: "var(--text-muted)", fontFamily: "'Space Grotesk', sans-serif" }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

// Content order is deliberate: headline and summary, report count and unique
// sources, last updated when a later update exists, source confirmation,
// event category, severity and mechanism, commodity and FX impact chips,
// headlines, then a link to the full event page. This is the fast-scan
// drawer, not a second copy of the full event page; keep it to exactly
// these sections.
export function SignalQuickView({
  signal,
  onClose,
}: {
  signal: Signal | null;
  onClose: () => void;
}) {
  const open = signal != null;
  const [detail, setDetail] = useState<DetailState>(() => {
    if (!signal) return { status: "idle" };
    return detailCache.get(signal.id) ?? { status: "idle" };
  });

  useEffect(() => {
    if (!signal) {
      setDetail({ status: "idle" });
      return;
    }
    const id = signal.id;
    const ac = new AbortController();
    const cached = detailCache.get(id);
    if (cached?.status === "ready" || cached?.status === "error") {
      setDetail(cached);
    } else {
      setDetail({ status: "loading", id });
    }
    let active = true;
    loadQuickViewDetail(id, ac.signal)
      .then((next) => {
        if (!active) return;
        setDetail(next);
      })
      .catch((err: unknown) => {
        if (!active || isAbortError(err)) return;
        const failed: DetailState = { status: "error", id };
        detailCache.set(id, failed);
        setDetail(failed);
      });
    return () => {
      active = false;
      ac.abort();
    };
  }, [signal?.id]);
  const sourceConfirmation = signal
    ? sourceConfirmationLabel(signal.sourceConfirmation)
    : null;
  const category = signal ? eventCategoryLabel(signal.eventCategory) : null;
  const mechanism =
    signal &&
    typeof signal.marketMechanism === "string" &&
    signal.marketMechanism.trim()
      ? signal.marketMechanism.trim()
      : null;
  const impacts = signal ? collectMarketImpacts(signal) : [];
  // Same text the event page's Market Impact Assessment box shows in its own
  // "Direction" row (apps/web/components/signals/MarketImpactAssessment.tsx)
  // — a single label when every impact agrees, else one per asset.
  const direction = formatImpactDirections(impacts);
  const readySources =
    signal && detail.status === "ready" && detail.id === signal.id ? detail.sources : null;
  const uniqueSources =
    readySources != null ? uniqueSourceCount(readySources) : null;
  const showLastUpdated =
    signal != null &&
    readySources != null &&
    shouldShowLastUpdated(signal.sourcesCount, signal.createdAt, signal.updatedAt);
  const headlines = readySources != null ? readySources.slice(0, HEADLINE_LIMIT) : [];

  return (
    <SheetPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetPrimitive.Portal>
        <SheetPrimitive.Backdrop
          data-testid="signal-quick-view-overlay"
          className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0"
        />
        <SheetPrimitive.Popup
          data-testid="signal-quick-view"
          className="fixed inset-y-0 right-0 z-50 flex h-full w-1/2 flex-col border-l border-[var(--border)] bg-[var(--bg-primary)] text-sm shadow-lg outline-none transition duration-200 ease-in-out data-ending-style:translate-x-[2.5rem] data-ending-style:opacity-0 data-starting-style:translate-x-[2.5rem] data-starting-style:opacity-0"
        >
          {signal ? (
            <>
              <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] p-6">
                <div className="min-w-0 space-y-3">
                  <SheetPrimitive.Title
                    className="text-xl font-bold leading-tight"
                    style={{
                      color: "#e5e2e1",
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    {signal.title}
                  </SheetPrimitive.Title>
                  <SheetPrimitive.Description
                    className="text-sm leading-relaxed"
                    style={{ color: "var(--text-secondary)", fontFamily: "'Inter', sans-serif" }}
                  >
                    {signal.summary}
                  </SheetPrimitive.Description>
                  {readySources != null ? (
                    <div data-testid="quick-view-reports" className="space-y-1">
                      <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                        {signal.sourcesCount} reports
                        {uniqueSources != null ? ` · ${uniqueSources} unique sources` : ""}
                      </p>
                      {showLastUpdated ? (
                        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                          Last updated{" "}
                          {safeFormatDistanceToNow(signal.updatedAt, { addSuffix: true })}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <SheetPrimitive.Close
                  data-testid="signal-quick-view-close"
                  aria-label="Close"
                  className="flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e2e1]"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </SheetPrimitive.Close>
              </div>

              <div className="flex-1 space-y-6 overflow-y-auto p-6">
                {sourceConfirmation ? (
                  <Part label="Source confirmation">
                    <span
                      data-testid="market-impact-source-confirmation"
                      className="inline-flex items-center rounded-sm border border-[var(--border)] px-2 py-0.5 text-[12px] md:text-[11px] font-medium"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {sourceConfirmation}
                    </span>
                  </Part>
                ) : null}

                {category ? (
                  <Part label="Event category">
                    <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {category}
                    </p>
                  </Part>
                ) : null}

                <Part label="Severity">
                  <div className="flex items-center gap-3">
                    <SeverityBadge score={signal.severity} />
                    {mechanism ? (
                      <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        {mechanism}
                      </p>
                    ) : null}
                  </div>
                </Part>

                {/* Same percent, same meaning, as the dashboard's featured-card
                    "Confidence" field (data-tour="confidence-score" in
                    app/(dashboard)/dashboard/page.tsx) and the help-center
                    answer for "What does the confidence score mean?" — the
                    classifier's self-reported certainty in its own read of
                    the event, not a per-asset number. */}
                <Part label="Confidence">
                  <p
                    data-testid="quick-view-confidence"
                    className="text-sm font-bold"
                    style={{ color: "var(--accent)" }}
                  >
                    {formatConfidencePercent(signal.confidence)}
                  </p>
                </Part>

                {impacts.length > 0 ? (
                  <Part label="Market impact">
                    <div className="flex flex-wrap gap-2">
                      {impacts.map((c) => (
                        <CommodityChip
                          key={`${c.asset}-${c.direction}`}
                          asset={c.asset}
                          direction={c.direction}
                          confidence={c.confidence}
                          size="md"
                        />
                      ))}
                    </div>
                  </Part>
                ) : null}

                {direction ? (
                  <Part label="Direction">
                    <p
                      data-testid="quick-view-direction"
                      className="text-[12px] font-medium"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {direction}
                    </p>
                  </Part>
                ) : null}

                {headlines.length > 0 ? (
                  <Part label="Headlines">
                    <div className="space-y-3">
                      {headlines.map((source, index) => (
                        <div key={`${source.url ?? source.title}-${index}`} className="space-y-0.5">
                          {source.url ? (
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-testid="quick-view-headline"
                              className="block text-[13px] leading-snug underline-offset-2 hover:underline"
                              style={{ color: "#e5e2e1" }}
                            >
                              {source.title}
                            </a>
                          ) : (
                            <p className="text-[13px] leading-snug" style={{ color: "#e5e2e1" }}>
                              {source.title}
                            </p>
                          )}
                          {source.domain || source.publishedAt ? (
                            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                              {source.domain}
                              {source.domain && source.publishedAt ? " · " : ""}
                              {source.publishedAt
                                ? safeFormatDistanceToNow(source.publishedAt, { addSuffix: true })
                                : ""}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </Part>
                ) : null}
              </div>

              <div className="border-t border-[var(--border)] p-6">
                <a
                  href={`/events/${signal.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="event-drawer-open-full-page"
                  onClick={() => {
                    logUsageEvent(
                      "signal_viewed",
                      signalEventMetadata(signal),
                      false,
                    );
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 px-8 py-3 text-xs font-bold tracking-widest uppercase transition-all active:scale-95"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "#003824",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  Open full event page →
                </a>
              </div>
            </>
          ) : null}
        </SheetPrimitive.Popup>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  );
}
