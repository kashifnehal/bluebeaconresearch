import { Clock, Database, MapPin } from "lucide-react";

import { SeverityBadge } from "@/components/signals/SeverityBadge";
import { MediaImpactTag } from "@/components/signals/MediaImpactTag";
import type { EventSource, FirstReportKind } from "@/lib/event-sources";
import {
  delayMinutes,
  describeReports,
  formatClockUtc,
  formatDelay,
  shouldShowLastUpdated,
} from "@/lib/signal-display";
import { safeFormatDistanceToNow } from "@/lib/utils";
import { countryToFlagEmoji } from "@/lib/country-flags";

// Server-rendered above-the-fold slice of the event detail page (2026-11-09).
// Built from the signal row and its linked reports only, so the title,
// summary, severity, timeline, and outlet link are in the first HTML. The
// market-impact, related, chat, and outcome sections stream in later. No
// client fetch runs to produce anything rendered here.
export type EventHeroProps = {
  id: string;
  title: string;
  summary: string;
  severity: number;
  country: string | null;
  mediaImpactEntity: string | null;
  mediaImpactCaveat: string | null;
  sourcesCount: number;
  createdAt: string;
  updatedAt?: string | null;
  sources: EventSource[];
  firstReportAt: string | null;
  firstReportKind: FirstReportKind | null;
  firstFetchedAt: string | null;
};

/** The outlet responsible for the earliest linked report — sources is already
 *  oldest-first (see lib/event-sources.ts's buildEventSources), so this is
 *  simply the first entry, when one exists. */
function earliestSource(sources: EventSource[]): EventSource | null {
  return sources.length > 0 ? sources[0] : null;
}

export function EventHero({
  id,
  title,
  summary,
  severity,
  country,
  mediaImpactEntity,
  mediaImpactCaveat,
  sourcesCount,
  createdAt,
  updatedAt,
  sources,
  firstReportAt,
  firstReportKind,
  firstFetchedAt,
}: EventHeroProps) {
  const countryFlag = country ? countryToFlagEmoji(country) : null;
  const reportLabel =
    firstReportKind === "publisher"
      ? "Published"
      : firstReportKind === "gdelt_seen"
        ? "First seen by GDELT"
        : "Reported";
  const delayValue = delayMinutes(firstReportAt, createdAt);
  const showLastUpdated = shouldShowLastUpdated(sourcesCount, createdAt, updatedAt);
  // Outlet name beside the published time. The name is a link only when the
  // stored report has a url. A missing url stays plain text. 2026-11-09.
  const firstSource = earliestSource(sources);
  const outletName = firstSource
    ? firstSource.sourceLabel || firstSource.domain || firstSource.title
    : null;

  return (
    <div>
      <div className="w-full">
        <div className="flex items-center gap-4 mb-4">
          <div className="px-3 py-1 bg-accent/10 border border-accent/20 rounded-sm">
            <span
              className="text-[12px] md:text-[11px] font-black uppercase tracking-widest text-accent"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Signal ID: {id.slice(0, 8)}
            </span>
          </div>
          <SeverityBadge score={severity} />
          <MediaImpactTag entity={mediaImpactEntity} caveat={mediaImpactCaveat} expanded />
        </div>

        <h1 className="text-3xl leading-[1.05] mb-4 md:text-5xl md:leading-[0.9] md:mb-8 font-black text-text-primary tracking-tighter">
          {title}
        </h1>

        <div
          className="grid grid-cols-1 sm:grid-cols-3 gap-6 p-6 rounded-lg bg-surface/30 border"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div className="min-w-0 sm:col-span-3" data-testid="signal-clock">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div className="flex min-w-0 items-start gap-3">
                <Clock size={16} className="mt-0.5 shrink-0 text-accent" />
                <div className="flex min-w-0 flex-col">
                  <span className="text-[12px] md:text-[11px] font-black uppercase tracking-widest text-muted break-words">
                    {reportLabel}
                  </span>
                  <span className="text-xs font-mono font-bold text-text-secondary break-words [overflow-wrap:anywhere]">
                    {formatClockUtc(firstReportAt)}
                  </span>
                  {firstSource && outletName ? (
                    <span
                      className="text-[12px] md:text-[11px] font-mono text-muted break-words [overflow-wrap:anywhere]"
                      data-testid="event-hero-source"
                    >
                      {firstSource.url ? (
                        <a
                          href={firstSource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-accent transition-colors"
                        >
                          {outletName}
                        </a>
                      ) : (
                        <span>{outletName}</span>
                      )}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="text-[12px] md:text-[11px] font-black uppercase tracking-widest text-muted break-words">
                  Fetched by BBR
                </span>
                <span className="text-xs font-mono font-bold text-text-secondary break-words [overflow-wrap:anywhere]">
                  {formatClockUtc(firstFetchedAt)}
                </span>
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="text-[12px] md:text-[11px] font-black uppercase tracking-widest text-muted break-words">
                  Flagged by BBR
                </span>
                <span className="text-xs font-mono font-bold text-text-secondary break-words [overflow-wrap:anywhere]">
                  {formatClockUtc(createdAt)}
                </span>
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="text-[12px] md:text-[11px] font-black uppercase tracking-widest text-muted break-words">
                  Delay
                </span>
                <span className="text-xs font-mono font-bold text-text-secondary break-words [overflow-wrap:anywhere]">
                  {delayValue == null ? "n/a" : formatDelay(delayValue)}
                </span>
              </div>
            </div>
            <p className="mt-3 text-[12px] md:text-[11px] leading-snug text-muted">
              Source time is the earliest time among the reports linked to this signal.
              {firstReportKind === "gdelt_seen" ? " GDELT time is when GDELT first saw the page." : ""}
            </p>
          </div>
          <div
            className="flex items-center gap-3 sm:border-x px-0 sm:px-6"
            style={{ borderColor: "rgba(255,255,255,0.05)" }}
          >
            <Database size={16} className="text-accent" />
            <div className="flex flex-col">
              <span className="text-[12px] md:text-[11px] font-black uppercase tracking-widest text-muted">
                Verification
              </span>
              <span className="text-xs font-mono font-bold text-text-secondary break-words">
                {describeReports(sources)}
              </span>
              {showLastUpdated ? (
                <span className="text-[12px] md:text-[11px] font-mono text-muted">
                  Last updated {safeFormatDistanceToNow(updatedAt, { addSuffix: true })}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <MapPin size={16} className="text-accent" />
            <div className="flex flex-col">
              <span className="text-[12px] md:text-[11px] font-black uppercase tracking-widest text-muted">
                Location
              </span>
              <span className="text-xs font-mono font-bold text-text-secondary uppercase">
                {countryFlag ? (
                  <span data-testid="country-flag" className="mr-1 normal-case">
                    {countryFlag}
                  </span>
                ) : null}
                {country}
              </span>
            </div>
          </div>
        </div>

        <div className="prose prose-invert max-w-none mt-8" data-testid="event-hero-summary">
          <div
            className="text-[12px] md:text-[11px] font-black uppercase tracking-[0.2em] text-accent mb-4"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Signal Summary
          </div>
          <p className="text-xl text-text-secondary leading-relaxed font-medium">{summary}</p>
        </div>
      </div>
    </div>
  );
}
