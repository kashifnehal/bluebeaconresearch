"use client";

import type { ReactNode } from "react";
import type { Signal } from "@blue-beacon-research/shared";
import { CommodityChip } from "@/components/signals/CommodityChip";
import { MediaImpactTag } from "@/components/signals/MediaImpactTag";
import { MarketImpactChart } from "@/components/signals/MarketImpactChart";
import {
  GPR_FALLBACK_SENTENCE,
  GRAIN_FALLBACK_SENTENCE,
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
                  const timeHorizonLabel = entry?.timeHorizonLabel ?? null;
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
                        <p
                          data-testid="market-impact-magnitude"
                          className="pl-1 text-[12px] md:text-[11px] leading-relaxed text-text-secondary"
                        >
                          Events like this have historically moved {c.asset} by ~
                          {magnitude.medianMovePct.toFixed(2)}% within 24h, based on{" "}
                          {magnitude.sampleSize} tracked BBR signals.
                        </p>
                      ) : isGrainAsset(c.asset) ? (
                        <p className="pl-1 text-[12px] md:text-[11px] leading-relaxed text-text-secondary">
                          {GRAIN_FALLBACK_SENTENCE}
                        </p>
                      ) : (
                        <p className="pl-1 text-[12px] md:text-[11px] leading-relaxed text-muted">
                          Not enough tracked history for {c.asset} yet.
                        </p>
                      )}
                      {magnitude && timeHorizonLabel ? (
                        <p
                          data-testid="market-impact-horizon"
                          className="pl-1 text-[12px] md:text-[11px] leading-relaxed text-muted"
                        >
                          Historically, moves like this have played out {timeHorizonLabel}.
                        </p>
                      ) : null}
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
