"use client";

import { useState } from "react";
import type { Signal } from "@blue-beacon-research/shared";
import { SeverityBadge } from "@/components/signals/SeverityBadge";
import { logUsageEvent, signalEventMetadata } from "@/lib/funnel-events";
import { ledgerLabel } from "@/lib/desk-ledger";
import { safeFormatDistanceToNow } from "@/lib/utils";
import type { StoryThread } from "@/lib/story-threads";

/**
 * A group of related reports. The lead is the highest-severity member (ties:
 * newest). Nothing is hidden: the expand control lists every member.
 */
export function StoryThreadCard({ thread }: { thread: StoryThread<Signal> }) {
  const [open, setOpen] = useState(false);
  const { lead, members } = thread;
  const listId = `thread-${thread.id}`;
  return (
    <div
      data-testid="story-thread"
      className="px-6 py-4"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div className="flex flex-wrap items-center gap-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
        <SeverityBadge score={lead.severity} />
        <span data-testid="thread-label" style={{ color: "var(--text-secondary)" }}>
          {members.length} related reports
        </span>
        <span>{thread.totalReports} source reports in total</span>
        <span>Newest {safeFormatDistanceToNow(thread.newestAt, { addSuffix: true })}</span>
      </div>
      <a
        href={`/events/${lead.id}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => logUsageEvent("signal_viewed", signalEventMetadata(lead), false)}
        className="font-story mt-2 block text-xl leading-snug hover:underline"
        style={{ color: "var(--text-primary)" }}
      >
        {lead.title}
      </a>
      <p className="mt-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
        Markets touched: {thread.markets.map(ledgerLabel).join(", ") || "none listed"}
      </p>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="mt-2 inline-flex min-h-[44px] items-center gap-1 text-[12px] md:min-h-0"
        style={{ color: "var(--interactive)" }}
      >
        <span className="material-symbols-outlined text-[16px]">{open ? "expand_less" : "expand_more"}</span>
        {open ? "Hide reports" : `Show ${members.length} reports`}
      </button>
      {open ? (
        <ul id={listId} className="mt-2 divide-y border" style={{ borderColor: "var(--border)" }}>
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-3 py-2 text-[12px]">
              <span style={{ color: "var(--text-muted)" }} className="w-28 shrink-0">
                {safeFormatDistanceToNow(m.eventDate ?? m.createdAt, { addSuffix: true })}
              </span>
              <a
                href={`/events/${m.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 hover:underline"
                style={{ color: "var(--text-primary)" }}
              >
                {m.title}
              </a>
              <span style={{ color: "var(--text-muted)" }}>
                {m.sourcesCount} {m.sourcesCount === 1 ? "report" : "reports"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
