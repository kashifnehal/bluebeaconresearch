"use client";

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import type { Signal } from "@blue-beacon-research/shared";
import { SeverityBadge } from "@/components/signals/SeverityBadge";
import { CommodityChip } from "@/components/signals/CommodityChip";
import { logUsageEvent, signalEventMetadata } from "@/lib/funnel-events";

const EXCERPT_CHARS = 420;

function excerptAnalysis(text: string): string {
  const compact = text
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (compact.length <= EXCERPT_CHARS) return compact;
  const cut = compact.slice(0, EXCERPT_CHARS);
  const boundary = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("? "),
    cut.lastIndexOf("! "),
  );
  const base = boundary >= 120 ? cut.slice(0, boundary + 1) : cut;
  return `${base.trimEnd()}…`;
}

export function SignalQuickView({
  signal,
  onClose,
}: {
  signal: Signal | null;
  onClose: () => void;
}) {
  const open = signal != null;
  const confidencePct =
    signal && Number.isFinite(signal.confidence)
      ? Math.round(signal.confidence * 100)
      : null;
  const impacts = signal
    ? [...(signal.commodityImpacts ?? [])].sort(
        (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0),
      )
    : [];
  const excerpt = signal?.aiAnalysis ? excerptAnalysis(signal.aiAnalysis) : null;

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
          className="fixed inset-y-0 right-0 z-50 flex h-full w-1/2 flex-col border-l border-[#3c4a42] bg-[#131313] text-sm shadow-lg outline-none transition duration-200 ease-in-out data-ending-style:translate-x-[2.5rem] data-ending-style:opacity-0 data-starting-style:translate-x-[2.5rem] data-starting-style:opacity-0"
        >
          {signal ? (
            <>
              <div className="flex items-start justify-between gap-4 border-b border-[#3c4a42] p-6">
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge score={signal.severity} />
                    {confidencePct != null && (
                      <span
                        className="font-mono text-[11px] uppercase tracking-wider"
                        style={{ color: "#86948a" }}
                      >
                        {confidencePct}% confidence
                      </span>
                    )}
                  </div>
                  <SheetPrimitive.Title
                    className="text-xl font-bold leading-tight"
                    style={{
                      color: "#e5e2e1",
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    {signal.title}
                  </SheetPrimitive.Title>
                </div>
                <SheetPrimitive.Close
                  data-testid="signal-quick-view-close"
                  aria-label="Close"
                  className="flex h-8 w-8 shrink-0 items-center justify-center border border-[#3c4a42] text-[#86948a] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e2e1]"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </SheetPrimitive.Close>
              </div>

              <div className="flex-1 space-y-6 overflow-y-auto p-6">
                <section>
                  <h3
                    className="mb-3 text-[10px] font-bold uppercase tracking-widest"
                    style={{
                      color: "#86948a",
                      fontFamily: "'Space Grotesk', sans-serif",
                    }}
                  >
                    Commodity impacts
                  </h3>
                  {impacts.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {impacts.map((c) => (
                        <CommodityChip
                          key={`${signal.id}-${c.asset}`}
                          asset={c.asset}
                          direction={c.direction}
                          confidence={c.confidence}
                          size="md"
                        />
                      ))}
                    </div>
                  ) : (
                    <p
                      className="text-sm"
                      style={{
                        color: "#86948a",
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      None flagged on this signal.
                    </p>
                  )}
                </section>

                <section>
                  <h3
                    className="mb-3 text-[10px] font-bold uppercase tracking-widest"
                    style={{
                      color: "#86948a",
                      fontFamily: "'Space Grotesk', sans-serif",
                    }}
                  >
                    Analyst briefing
                  </h3>
                  {excerpt ? (
                    <SheetPrimitive.Description
                      className="text-sm leading-relaxed"
                      style={{
                        color: "#bbcac0",
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      {excerpt}
                    </SheetPrimitive.Description>
                  ) : (
                    <SheetPrimitive.Description
                      className="text-sm leading-relaxed"
                      style={{
                        color: "#86948a",
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      Full analyst briefing pending — restoring as intelligence
                      capacity is added back online.
                    </SheetPrimitive.Description>
                  )}
                </section>
              </div>

              <div className="border-t border-[#3c4a42] p-6">
                <a
                  href={`/events/${signal.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="quick-view-full-details"
                  onClick={() => {
                    logUsageEvent(
                      "signal_viewed",
                      signalEventMetadata(signal),
                      false,
                    );
                  }}
                  className="inline-flex w-full items-center justify-center px-8 py-3 text-xs font-bold tracking-widest uppercase transition-all active:scale-95"
                  style={{
                    backgroundColor: "#4edea3",
                    color: "#003824",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  View full details
                </a>
              </div>
            </>
          ) : null}
        </SheetPrimitive.Popup>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  );
}
