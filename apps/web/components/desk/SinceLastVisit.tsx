"use client";

import { useEffect, useRef, useState } from "react";
import { readLastVisit, summarizeSince, writeLastVisit } from "@/lib/last-visit";
import { priceChangeColor, priceChangeParts } from "@/lib/price-change";
import type { LedgerRow } from "@/lib/desk-ledger";

const WRITE_AFTER_MS = 60_000;

/**
 * "Since your last visit". The stored time is read once on mount and held in
 * state, then rewritten only when the page is left or after 60 seconds, never
 * on load, so the counts do not blank themselves. If storage is unavailable
 * (or this is a first visit) the strip counts today's reports instead.
 * Counts come from the feed rows already loaded, not from a new query.
 * The amber dot is used here only, and only when there is something new.
 */
export function SinceLastVisit({
  signals,
  threadCount,
  mover,
}: {
  signals: readonly { createdAt: string }[];
  threadCount: number;
  mover: LedgerRow | null;
}) {
  const [lastVisit, setLastVisit] = useState<number | null | undefined>(undefined);
  const readOnce = useRef(false);

  useEffect(() => {
    if (!readOnce.current) {
      readOnce.current = true;
      setLastVisit(readLastVisit());
    }
    const timer = window.setTimeout(() => writeLastVisit(Date.now()), WRITE_AFTER_MS);
    const onLeave = () => writeLastVisit(Date.now());
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", onLeave);
    };
  }, []);

  const ready = lastVisit !== undefined;
  const summary = ready ? summarizeSince(signals, lastVisit, Date.now()) : null;
  const heading = summary?.mode === "since" ? "Since your last visit" : "Today";
  const change = mover?.changePct != null ? priceChangeParts(mover.changePct) : null;

  return (
    <section
      aria-label={heading}
      data-testid="since-last-visit"
      className="border px-4 py-3"
      style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border)" }}
    >
      <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {heading}
      </h2>
      {summary ? (
        <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
          <div>
            <dt className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              {summary.mode === "since" ? "New reports" : "Reports today"}
            </dt>
            <dd className="flex items-center gap-2 font-medium" style={{ color: "var(--text-primary)" }}>
              {summary.newCount > 0 ? (
                <span
                  data-testid="new-dot"
                  aria-hidden="true"
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: "var(--accent)" }}
                />
              ) : null}
              {summary.newCount}
            </dd>
          </div>
          <div>
            <dt className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Story threads
            </dt>
            <dd className="font-medium" style={{ color: "var(--text-primary)" }}>
              {threadCount}
            </dd>
          </div>
          <div>
            <dt className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Biggest mover (24h)
            </dt>
            <dd className="font-medium" style={{ color: "var(--text-primary)" }}>
              {mover && change ? (
                <>
                  {mover.label}{" "}
                  <span style={{ color: priceChangeColor(change.direction) }}>{change.text}</span>
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
          Checking for new reports…
        </p>
      )}
      <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Counted from the reports loaded below.
      </p>
    </section>
  );
}
