import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Signal } from "@blue-beacon-research/shared";

import { MarketImpactAssessment } from "./MarketImpactAssessment";
import {
  GPR_FALLBACK_SENTENCE,
  GRAIN_FALLBACK_SENTENCE,
  MARKET_IMPACT_DISCLAIMER,
  PREVIEW_NOTE,
} from "@/lib/market-impact-assessment";

function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function baseSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "test-signal",
    title: "Test",
    summary: "Summary",
    severity: 7,
    confidence: 0.88,
    eventType: "conflict",
    country: "Yemen",
    region: "middle-east",
    sourcesCount: 2,
    commodityImpacts: [],
    currencyPairImpacts: [],
    isBreaking: false,
    isActive: true,
    createdAt: "2026-09-13T00:00:00Z",
    ...overrides,
  };
}

runTest("mechanism + commodity case shows named parts and no visible confidence percent", () => {
  const html = renderToStaticMarkup(
    createElement(MarketImpactAssessment, {
      signal: baseSignal({
        marketMechanism:
          "Threat to tanker traffic through the Strait of Hormuz → crude oil supply risk.",
        eventCategory: "armed_conflict_security",
        commodityImpacts: [
          { asset: "USOIL", direction: "up", confidence: 0.88 },
        ],
      }),
    }),
  );
  const text = visibleText(html);
  assert.match(text, /MARKET IMPACT ASSESSMENT/);
  assert.equal(text.includes("PROJECTED IMPACT"), false);
  assert.match(text, /Market mechanism/);
  assert.match(text, /Threat to tanker traffic through the Strait of Hormuz/);
  assert.match(text, /Affected market\(s\)/);
  assert.match(text, /USOIL/);
  assert.match(text, /Direction/);
  assert.match(text, /Up/);
  assert.match(text, /Armed Conflict & Security/);
  assert.equal(text.includes("88%"), false);
  assert.equal(text.includes("0.88"), false);
  assert.equal(/\d+\s*%/.test(text.replace(GPR_FALLBACK_SENTENCE, "")), false);
});

runTest("media-impact tag is reused inline when mediaImpactEntity is set", () => {
  const html = renderToStaticMarkup(
    createElement(MarketImpactAssessment, {
      signal: baseSignal({
        marketMechanism: "Official production guidance can reprice crude.",
        commodityImpacts: [{ asset: "USOIL", direction: "volatile", confidence: 0.7 }],
        mediaImpactEntity: "OPEC",
        mediaImpactCaveat:
          "Official OPEC statements have historically REDUCED oil volatility (stabilizing/reassuring), not spiked it.",
      }),
    }),
  );
  const text = visibleText(html);
  assert.match(text, /Media-Impact tag/);
  assert.match(text, /\[Media-Impact\]/);
  assert.match(text, /OPEC/);
  assert.match(html, /data-testid="media-impact-tag"/);
  assert.equal(/70%|0\.7/.test(text), false);
});

runTest("empty mechanism + empty impacts shows the exact GPR fallback sentence", () => {
  const html = renderToStaticMarkup(
    createElement(MarketImpactAssessment, {
      signal: baseSignal({
        marketMechanism: null,
        commodityImpacts: [],
        currencyPairImpacts: [],
      }),
    }),
  );
  const text = visibleText(html);
  assert.match(html, /data-testid="market-impact-gpr-fallback"/);
  assert.equal(text.includes(GPR_FALLBACK_SENTENCE), true);
  assert.equal(text.includes("No direct commodity impact identified"), false);
  assert.equal(/GPR/i.test(text), false);
});

runTest("source confirmation and novelty render only when set, never as N/A", () => {
  const withGate = renderToStaticMarkup(
    createElement(MarketImpactAssessment, {
      signal: baseSignal({
        sourceConfirmation: "official",
        novelty: 0.82,
        marketMechanism: "Strait closure raises crude supply risk.",
        commodityImpacts: [{ asset: "USOIL", direction: "up", confidence: 0.8 }],
      }),
    }),
  );
  const withGateText = visibleText(withGate);
  assert.match(withGate, /data-testid="market-impact-source-confirmation"/);
  assert.match(withGate, /data-testid="market-impact-novelty"/);
  assert.match(withGateText, /Official statement/);
  assert.match(withGateText, /New development/);
  assert.equal(withGateText.includes("0.82"), false);
  assert.equal(withGateText.includes("official"), false);

  const withoutGate = renderToStaticMarkup(
    createElement(MarketImpactAssessment, {
      signal: baseSignal({
        sourceConfirmation: null,
        novelty: null,
        marketMechanism: null,
      }),
    }),
  );
  const withoutGateText = visibleText(withoutGate);
  assert.equal(withoutGate.includes("market-impact-source-confirmation"), false);
  assert.equal(withoutGate.includes("market-impact-novelty"), false);
  assert.equal(withoutGateText.includes("Source confirmation"), false);
  assert.equal(withoutGateText.includes("Novelty"), false);
  assert.equal(withoutGateText.includes("N/A"), false);
});

runTest("magnitude and time-horizon lines render when the asset clears the sample-size gate", () => {
  const html = renderToStaticMarkup(
    createElement(MarketImpactAssessment, {
      signal: baseSignal({
        marketMechanism: "OPEC+ output cut tightens crude supply.",
        commodityImpacts: [{ asset: "USOIL", direction: "up", confidence: 0.8 }],
      }),
      marketImpactMagnitudes: {
        USOIL: {
          magnitude: { medianMovePct: 0.97, sampleSize: 1232 },
          timeHorizonLabel: "multi-day",
        },
      },
    }),
  );
  const text = visibleText(html);
  assert.match(html, /data-testid="market-impact-magnitude"/);
  assert.match(html, /data-testid="market-impact-horizon"/);
  assert.match(text, /historically moved USOIL by ~0\.97% within 24h/);
  assert.match(text, /based on 1232 tracked BBR signals/);
  assert.match(text, /multi-day/);
  assert.equal(text.includes(MARKET_IMPACT_DISCLAIMER), true);
});

runTest("historical-pattern chart is collapsed by default behind a toggle, disclaimer stays visible", () => {
  const html = renderToStaticMarkup(
    createElement(MarketImpactAssessment, {
      signal: baseSignal({
        marketMechanism: "OPEC+ output cut tightens crude supply.",
        commodityImpacts: [{ asset: "USOIL", direction: "up", confidence: 0.8 }],
      }),
      marketImpactMagnitudes: {
        USOIL: {
          magnitude: { medianMovePct: 0.97, sampleSize: 1232 },
          timeHorizonLabel: "multi-day",
          checkpoints: [
            { checkpointHours: 24, medianMovePct: 0.97, sampleSize: 1232 },
            { checkpointHours: 48, medianMovePct: 1.4, sampleSize: 900 },
          ],
        },
      },
    }),
  );
  assert.match(html, /data-testid="market-impact-chart-toggle"/);
  assert.match(html, /data-testid="market-impact-chart"/);
  // <details> with no `open` attribute renders collapsed by default.
  assert.equal(/<details(?![^>]*\sopen)[^>]*class="group[^"]*"/.test(html), true);
  const text = visibleText(html);
  assert.equal(text.includes(MARKET_IMPACT_DISCLAIMER), true);
});

runTest("no chart toggle renders when the asset has no checkpoint data", () => {
  const html = renderToStaticMarkup(
    createElement(MarketImpactAssessment, {
      signal: baseSignal({
        marketMechanism: "OPEC+ output cut tightens crude supply.",
        commodityImpacts: [{ asset: "USOIL", direction: "up", confidence: 0.8 }],
      }),
      marketImpactMagnitudes: {
        USOIL: {
          magnitude: { medianMovePct: 0.97, sampleSize: 1232 },
          timeHorizonLabel: "multi-day",
          checkpoints: [],
        },
      },
    }),
  );
  assert.equal(html.includes('data-testid="market-impact-chart-toggle"'), false);
  assert.equal(html.includes('data-testid="market-impact-chart"'), false);
});

runTest("not-enough-history fallback renders for a non-grain asset with no magnitude entry", () => {
  const html = renderToStaticMarkup(
    createElement(MarketImpactAssessment, {
      signal: baseSignal({
        marketMechanism: "Sanctions target a shipping route.",
        commodityImpacts: [{ asset: "USDRUB", direction: "down", confidence: 0.6 }],
      }),
      marketImpactMagnitudes: {},
    }),
  );
  const text = visibleText(html);
  assert.equal(html.includes('data-testid="market-impact-magnitude"'), false);
  assert.equal(html.includes('data-testid="market-impact-horizon"'), false);
  assert.match(text, /Not enough tracked history for USDRUB yet\./);
});

runTest("grain fallback sentence renders for WHEAT/CORN with no magnitude entry, not the generic fallback", () => {
  const html = renderToStaticMarkup(
    createElement(MarketImpactAssessment, {
      signal: baseSignal({
        marketMechanism: "Export ban on grain shipments.",
        commodityImpacts: [{ asset: "WHEAT", direction: "up", confidence: 0.7 }],
      }),
      marketImpactMagnitudes: {},
    }),
  );
  const text = visibleText(html);
  assert.equal(text.includes(GRAIN_FALLBACK_SENTENCE), true);
  assert.equal(text.includes("Not enough tracked history"), false);
});

runTest("is_preview shows the calendar note and link", () => {
  const html = renderToStaticMarkup(
    createElement(MarketImpactAssessment, {
      signal: baseSignal({
        isPreview: true,
        marketMechanism: null,
      }),
    }),
  );
  const text = visibleText(html);
  assert.match(html, /data-testid="market-impact-preview-note"/);
  assert.equal(text.includes(PREVIEW_NOTE), true);
  assert.match(html, /href="\/calendar"/);
});
