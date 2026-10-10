"use client";

import type { ReactNode } from "react";
import type { Signal } from "@blue-beacon-research/shared";
import { CommodityChip } from "@/components/signals/CommodityChip";
import { MediaImpactTag } from "@/components/signals/MediaImpactTag";
import { MarketImpactChart } from "@/components/signals/MarketImpactChart";
import {
  GPR_FALLBACK_SENTENCE,
  GRAIN_FALLBACK_SENTENCE,
  MARKET_IMPACT_BASELINE_NOTE,
  MARKET_IMPACT_CHECKPOINT_HOURS,
  MARKET_IMPACT_DISCLAIMER,
  PREVIEW_NOTE,
  collectMarketImpacts,
  eventCategoryLabel,
  formatImpactDirections,
  isGrainAsset,
  noveltyLabel,
  sourceConfirmationLabel,
  usesGprFallback,
  type MarketImpactCheckpointPoint,
  type MarketImpactMagnitude,
  type TimeHorizonLabel,
} from "@/lib/market-impact-assessment";
import type { WindowMoveBaseline } from "@/lib/price-baseline";
import { formatPriceSinceFiredSubtext } from "@/lib/signal-display";

export type MarketImpactPriceRow = {
  asset: string;
  priceAtSignal: number | null;
  currentPrice: number | null;
};

function Part({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5" data-part={label}>
      <div
        className="text-[12px] md:text-[9px] font-black uppercase tracking-widest text-muted"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

export type MarketImpactAssessmentEntry = {
  magnitude: MarketImpactMagnitude | null;
  timeHorizonLabel: TimeHorizonLabel | null;
  checkpoints?: MarketImpactCheckpointPoint[];
  baselines?: WindowMoveBaseline[];
};

export function MarketImpactAssessment({
  signal,
  pricesAtSignal = [],
  showPriceSubtext = false,
  headingIcon,
  marketImpactMagnitudes = {},
}: {
  signal: Signal;
  pricesAtSignal?: MarketImpactPriceRow[];
  showPriceSubtext?: boolean;
  headingIcon?: ReactNode;
  marketImpactMagnitudes?: Record<string, MarketImpactAssessmentEntry>;
}) {
  const mechanism =
    typeof signal.marketMechanism === "string" && signal.marketMechanism.trim()
      ? signal.marketMechanism.trim()
      : null;
  const impacts = collectMarketImpacts(signal);
  const fallback = usesGprFallback(signal);
  const category = eventCategoryLabel(signal.eventCategory);
  const sourceConfirmation = sourceConfirmationLabel(signal.sourceConfirmation);
  const novelty = noveltyLabel(signal.novelty);
  const direction = formatImpactDirections(impacts);
  const preview = signal.isPreview === true;
  const hasAnyBaseline = impacts.some((c) =>
    marketImpactMagnitudes[c.asset]?.baselines?.some(
      (b) => b.windowHours === MARKET_IMPACT_CHECKPOINT_HOURS,
    ),
  );

  return (
    <div data-testid="market-impact-assessment" className="relative space-y-4">
      <div className="flex items-center gap-2">
        {headingIcon}
        <span
          className="text-[12px] md:text-[10px] font-black uppercase tracking-[0.2em] text-text-primary"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          data-testid="market-impact-heading"
        >
          MARKET IMPACT ASSESSMENT
        </span>
      </div>

      {preview ? (
        <p
          className="text-[12px] md:text-[11px] leading-snug text-on-surface-variant"
          data-testid="market-impact-preview-note"
        >
          {PREVIEW_NOTE}{" "}
          <a href="/calendar" className="text-accent underline underline-offset-2">
            Economic Calendar
          </a>
          .
        </p>
      ) : null}

      {sourceConfirmation ? (
        <Part label="Source confirmation">
          <span
            data-testid="market-impact-source-confirmation"
            className="inline-flex items-center rounded-sm border px-2 py-0.5 text-[12px] md:text-[11px] font-medium text-text-secondary"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            {sourceConfirmation}
          </span>
        </Part>
      ) : null}

      {novelty ? (
        <Part label="Novelty">
          <p
            data-testid="market-impact-novelty"
            className="text-[12px] text-text-secondary"
          >
            {novelty}
          </p>
        </Part>
      ) : null}

      {fallback ? (
        <p
          className="text-[12px] md:text-[11px] leading-relaxed text-text-secondary"
          data-testid="market-impact-gpr-fallback"
        >
          {GPR_FALLBACK_SENTENCE}
        </p>
      ) : (
        <>
          {mechanism ? (
            <Part label="Market mechanism">
              <p className="text-[12px] leading-relaxed text-text-secondary">
                {mechanism}
              </p>
            </Part>
          ) : null}

          {impacts.length > 0 ? (
            <Part label="Affected market(s)">
              <div className="space-y-3">
                {impacts.map((c) => {
                  const priceInfo = pricesAtSignal.find((p) => p.asset === c.asset);
                  const entry = marketImpactMagnitudes[c.asset];
                  const magnitude = entry?.magnitude ?? null;
                  const baseline = entry?.baselines?.find(
                    (b) => b.windowHours === MARKET_IMPACT_CHECKPOINT_HOURS,
                  );
                  return (
                    <div key={`${c.asset}-${c.direction}`} className="space-y-1">
                      <CommodityChip
                        asset={c.asset}
                        direction={c.direction}
                        confidence={c.confidence}
                        size="md"
                        label="Predicted"
                      />
                      {showPriceSubtext &&
                      priceInfo?.priceAtSignal != null &&
                      priceInfo?.currentPrice != null ? (
                        <p className="pl-1 font-mono text-[12px] md:text-[9px] text-muted">
                          <span className="font-black uppercase tracking-widest">Since signal:</span>{" "}
                          {formatPriceSinceFiredSubtext(
                            c.asset,
                            priceInfo.priceAtSignal,
                            priceInfo.currentPrice,
                          )}
                        </p>
                      ) : null}
                      {magnitude ? (
                        <>
                          <p
                            data-testid="market-impact-magnitude"
                            className="pl-1 text-[12px] md:text-[11px] leading-relaxed text-text-secondary"
                          >
                            Across {magnitude.sampleSize} tracked BBR signals that
                            listed {c.asset}, the price {MARKET_IMPACT_CHECKPOINT_HOURS}{" "}
                            hours after the event time differed from the price at the
                            event time by a median of ~{magnitude.medianMovePct.toFixed(2)}%
                            (up or down).
                          </p>
                          {magnitude.unchangedCount > 0 ? (
                            <p
                              data-testid="market-impact-unchanged-note"
                              className="pl-1 text-[11px] leading-snug text-muted"
                            >
                              {magnitude.unchangedCount} other tracked signals had an
                              unchanged recorded price (a closed market or an
                              unchanged quote) and are left out.
                            </p>
                          ) : null}
                          {baseline ? (
                            <p
                              data-testid="market-impact-baseline"
                              className="pl-1 text-[11px] leading-snug text-muted"
                            >
                              For comparison, across {baseline.windowCount} {c.asset}{" "}
                              price windows from the last {baseline.spanDays} days (all
                              windows, including ones that had tracked signals; start
                              hours weighted like the tracked signals), the price{" "}
                              {MARKET_IMPACT_CHECKPOINT_HOURS} hours later differed by a
                              median of ~{baseline.medianMovePct.toFixed(2)}% (up or
                              down).
                            </p>
                          ) : null}
                        </>
                      ) : isGrainAsset(c.asset) ? (
                        <p className="pl-1 text-[12px] md:text-[11px] leading-relaxed text-text-secondary">
                          {GRAIN_FALLBACK_SENTENCE}
                        </p>
                      ) : (
                        <p className="pl-1 text-[12px] md:text-[11px] leading-relaxed text-muted">
                          Not enough tracked history for {c.asset} yet.
                        </p>
                      )}
                      {magnitude && entry?.checkpoints && entry.checkpoints.length > 0 ? (
                        <details className="group pl-1">
                          <summary
                            data-testid="market-impact-chart-toggle"
                            className="cursor-pointer select-none text-[11px] md:text-[10px] font-bold uppercase tracking-wide text-accent"
                          >
                            View historical pattern
                          </summary>
                          <div className="mt-2">
                            <MarketImpactChart checkpoints={entry.checkpoints} />
                          </div>
                        </details>
                      ) : null}
                    </div>
                  );
                })}
                <p className="pl-1 text-[11px] leading-snug text-muted italic">
                  {MARKET_IMPACT_DISCLAIMER}
                </p>
                {hasAnyBaseline ? (
                  <p
                    data-testid="market-impact-baseline-note"
                    className="pl-1 text-[11px] leading-snug text-muted italic"
                  >
                    {MARKET_IMPACT_BASELINE_NOTE}
                  </p>
                ) : null}
              </div>
            </Part>
          ) : null}

          {direction ? (
            <Part label="Direction">
              <p className="text-[12px] font-medium text-text-secondary">{direction}</p>
            </Part>
          ) : null}
        </>
      )}

      {category ? (
        <Part label="Event category">
          <p className="text-[12px] text-text-secondary">{category}</p>
        </Part>
      ) : null}

      {signal.mediaImpactEntity ? (
        <Part label="Media-Impact tag">
          <MediaImpactTag
            entity={signal.mediaImpactEntity}
            caveat={signal.mediaImpactCaveat}
            expanded
          />
        </Part>
      ) : null}
    </div>
  );
}
