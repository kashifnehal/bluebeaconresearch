export type CorrectionEntry = {
  date: string;
  where: string;
  wasWrong: string;
  changed: string;
};

export const CORRECTIONS: CorrectionEntry[] = [
  {
    date: "2026-11-08",
    where: "Accuracy page, caption under the horizon table",
    wasWrong:
      'The caption said: "The longer the wait, the higher the hit rate. Short horizons are weak." It did not say that a price move smaller than 0.5% is scored as flat, and that a flat result counts as a miss. In the sample scored on 7 November 2026, 85.3% of 1-hour calls and 21.2% of 48-hour calls moved less than 0.5%, so part of the gap between horizons comes from that rule.',
    changed: "The caption now states the 0.5% rule. The page also shows the rule's value from the accuracy data.",
  },
];

// number of corrections to published assessment pages as of 2026-11-08; update it when an assessment is corrected.
export const PUBLISHED_ASSESSMENT_CORRECTIONS = 0;
