// Sample WeeklyInput for rendering/layout checks only — every field says
// "placeholder" so it can never be mistaken for published research.
// See apps/backend/scripts/render-weekly-sample.ts.

import type { WeeklyInput } from "./weekly-email.js";

export const weeklyEmailFixture: WeeklyInput = {
  edition: 1,
  windowLabel: "placeholder window",
  sentDateLabel: "placeholder sent date",
  preheader: "SAMPLE LAYOUT: placeholder content, not published research.",
  lead: {
    headline: "SAMPLE LAYOUT: placeholder content, not published research",
    summary: "placeholder summary — this text exists only to check the rendered layout, not as real research.",
    eventTimeUtc: "placeholder event time",
    assessedTimeUtc: "placeholder assessed time",
    event: "placeholder event description",
    exposure: [{ market: "placeholder market", mechanism: "placeholder mechanism", note: "placeholder note" }],
    evidence: ["placeholder evidence line"],
    unknown: ["placeholder unknown"],
    url: "https://www.bluebeaconresearch.com/placeholder",
  },
  chart: {
    src: "https://www.bluebeaconresearch.com/placeholder-chart.png",
    alt: "placeholder chart",
    caption: "placeholder caption",
    sourceLine: "placeholder source line",
  },
  coverage: [
    {
      market: "placeholder market",
      line: "placeholder line",
      dateLabel: "placeholder date",
      url: "https://www.bluebeaconresearch.com/placeholder",
    },
  ],
  watch: [
    {
      dateLabel: "placeholder date",
      item: "placeholder item",
      market: "placeholder market",
      source: "https://www.bluebeaconresearch.com/placeholder",
    },
  ],
  correctionsCount: 0,
  correctionsUrl: "https://www.bluebeaconresearch.com/how-it-works",
  cta: { label: "placeholder cta", href: "https://www.bluebeaconresearch.com/placeholder" },
  unsubscribeUrl: "https://www.bluebeaconresearch.com/settings",
  preferencesUrl: "https://www.bluebeaconresearch.com/settings",
};
