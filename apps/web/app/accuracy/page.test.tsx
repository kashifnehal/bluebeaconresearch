// Rendered coverage for the public accuracy page. Same linkedom + react-dom/client
// harness as components/signals/SignalQuickView.test.tsx, via lib/test-render.ts.
//
// 2026-11-09 rewrite: the page no longer shows a hit-rate percentage or any
// 95%/confidence-band figure anywhere. It shows scored counts, flat share,
// right/wrong counts for up and down calls separately, and the baseline
// share of windows where the market rose. A horizon below the sample floor
// is left out of the table entirely rather than shown with a placeholder row.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, createElement } from "react";

import { setupDom, renderElement, visibleText } from "@/lib/test-render";
import { AccuracyReport, type AccuracyPayload, type CheckpointSummary } from "./page";

const document = setupDom();

function runTest(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`✔ ${name}`);
    })
    .catch((err) => {
      console.error(`✖ ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

function direction(total: number, correct: number) {
  return {
    total,
    correct,
    hit_rate: total > 0 ? correct / total : null,
    not_enough_history: total < 20,
  };
}

function checkpoint(
  hours: number,
  scored: number,
  correct: number,
  upTotal: number,
  upCorrect: number,
  downTotal: number,
  downCorrect: number,
  flatShare: number,
  marketRoseShare: number,
): CheckpointSummary {
  return {
    checkpoint_hours: hours,
    total_scored: scored,
    correct,
    hit_rate: scored >= 20 ? correct / scored : null,
    not_enough_history: scored < 20,
    avg_move_when_correct: null,
    flat_share: flatShare,
    market_rose_share: marketRoseShare,
    sample_size_note: scored,
    volatile_neutral_summary: null,
    date_range: null,
    up: direction(upTotal, upCorrect),
    down: direction(downTotal, downCorrect),
  };
}

function payload(
  checkpoints: CheckpointSummary[],
  publishAsset: boolean,
  flatThresholdPct?: number,
): AccuracyPayload {
  return {
    overall: {
      total_scored: checkpoints[3]?.total_scored ?? 0,
      correct: checkpoints[3]?.correct ?? 0,
      hit_rate: null,
      not_enough_history: true,
      avg_move_when_correct: null,
      sample_size_note: checkpoints[3]?.total_scored ?? 0,
      volatile_neutral_summary: null,
      date_range: null,
    },
    by_asset: {
      USOIL: {
        total_scored: publishAsset ? 20 : 4,
        correct: publishAsset ? 10 : 2,
        hit_rate: publishAsset ? 0.5 : null,
        not_enough_history: !publishAsset,
        avg_move_when_correct: 1.25,
        sample_size_note: publishAsset ? 20 : 4,
        volatile_neutral_summary: null,
        date_range: null,
      },
    },
    by_asset_checkpoint_hours: 48,
    checkpoints,
    date_range: {
      earliest: "2026-07-01T00:00:00.000Z",
      latest: "2026-11-01T00:00:00.000Z",
    },
    min_sample_size: 20,
    volatility_threshold_pct: 2,
    generated_at: "2026-11-07T12:00:00.000Z",
    ...(typeof flatThresholdPct === "number" ? { flat_threshold_pct: flatThresholdPct } : {}),
  };
}

const aboveFloor = payload(
  [
    checkpoint(1, 40, 15, 20, 10, 20, 5, 0.1, 0.4),
    checkpoint(4, 44, 22, 22, 11, 22, 11, 0.12, 0.45),
    checkpoint(24, 48, 24, 24, 18, 24, 6, 0.08, 0.5),
    checkpoint(48, 52, 26, 26, 13, 26, 13, 0.15, 0.482),
  ],
  true,
  0.5,
);

const belowFloor = payload(
  [
    checkpoint(1, 3, 1, 1, 1, 2, 0, 0, 0.3),
    checkpoint(4, 4, 2, 2, 1, 2, 1, 0, 0.3),
    checkpoint(24, 5, 2, 2, 1, 3, 1, 0, 0.3),
    checkpoint(48, 6, 3, 3, 2, 3, 1, 0, 0.3),
  ],
  false,
);

async function renderReport(data: AccuracyPayload) {
  return renderElement(document, createElement(AccuracyReport, { data }));
}

async function main() {
  await runTest("the headline and the below-table note use the exact proposed copy", async () => {
    const { html, root } = await renderReport(aboveFloor);
    try {
      const headline = document.querySelector('[data-testid="accuracy-headline"]');
      assert.equal(
        headline?.textContent,
        "Every assessment is dated, sourced and scored against what the market did next. The misses are shown.",
      );
      const caption = document.querySelector('[data-testid="accuracy-caption"]');
      assert.equal(
        caption?.textContent,
        "This is a historical statistic, not a forecast. A move after an assessment does not show the assessment caused it. Informational research, not investment advice.",
      );
      assert.equal(/\d+(?:\.\d+)?\s*%/.test(headline?.textContent ?? ""), false);
      void html;
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  await runTest(
    "four checkpoints show scored counts, flat share, right/wrong counts, and the baseline — never a hit-rate percentage",
    async () => {
      const { html, root } = await renderReport(aboveFloor);
      try {
        const table = document.querySelector('[data-testid="horizon-table"]');
        assert.ok(table, "horizon table should render");
        const rows = [...table.querySelectorAll("tbody tr")];
        assert.equal(rows.length, 4);
        const rowText = rows.map((row) => visibleText(row.innerHTML));

        assert.match(rowText[0], /1 hour/);
        assert.match(rowText[0], /40/);
        assert.match(rowText[0], /10\.0%/); // flat share
        assert.match(rowText[0], /10\b/); // up correct
        assert.match(rowText[0], /10\b/); // up wrong (20-10)
        assert.match(rowText[0], /5\b/); // down correct
        assert.match(rowText[0], /15\b/); // down wrong (20-5)
        assert.match(rowText[0], /40\.0%/); // baseline

        assert.match(visibleText(table.innerHTML), /Up right/);
        assert.match(visibleText(table.innerHTML), /Up wrong/);
        assert.match(visibleText(table.innerHTML), /Down right/);
        assert.match(visibleText(table.innerHTML), /Down wrong/);
        assert.match(visibleText(table.innerHTML), /Market rose \(baseline\)/);
        assert.equal(visibleText(table.innerHTML).includes("Hit rate"), false);

        assert.match(rowText[3], /48 hours/);
        assert.match(rowText[3], /48\.2%/); // baseline at 48h, matching the "no-skill" evidence figure

        const flatCaption = document.querySelector('[data-testid="accuracy-flat-caption"]');
        assert.match(flatCaption?.textContent ?? "", /at least 0\.5% in the called direction/);
        void html;
      } finally {
        await act(async () => {
          root.unmount();
        });
      }
    },
  );

  await runTest(
    "below the sample floor every horizon is hidden and no percentage from a horizon prints",
    async () => {
      const { html, root } = await renderReport(belowFloor);
      try {
        const table = document.querySelector('[data-testid="horizon-table"]');
        assert.equal(table, null, "horizon table should not render below the floor");
        const fallback = document.querySelector('[data-testid="horizon-below-floor"]');
        assert.match(fallback?.textContent ?? "", /Not enough history yet at any horizon \(min 20/);
        const text = visibleText(html);
        // Nothing from any (hidden) horizon prints, including its baseline/flat
        // share percentages — the by-asset section below uses counts, not %,
        // so the page overall still has no percentage anywhere in this state.
        assert.equal(/\d+(?:\.\d+)?%/.test(text), false);
      } finally {
        await act(async () => {
          root.unmount();
        });
      }
    },
  );

  await runTest("the by-asset table shows right/wrong counts, never a hit-rate percentage", async () => {
    const { root } = await renderReport(aboveFloor);
    try {
      const text = visibleText(
        document.querySelector('[data-testid="asset-table"]')?.innerHTML ?? "",
      );
      assert.match(text, /Right/);
      assert.match(text, /Wrong/);
      assert.equal(text.includes("hit rate"), false);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  await runTest("the page source has no hard-coded percentage or forbidden phrase", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    assert.equal(/\d+(?:\.\d+)?\s*%/.test(source), false);
    for (const figure of [
      "46.8",
      "49.2",
      "47.1",
      "published track record",
      "Overall hit rate",
      "Hit rate for this horizon",
      "95%",
    ]) {
      assert.equal(source.includes(figure), false, figure);
    }
  });

  await runTest("missing checkpoints (legacy payload) below the floor also hides the horizon", async () => {
    const legacy: AccuracyPayload = {
      overall: {
        total_scored: 12,
        correct: 7,
        hit_rate: null,
        not_enough_history: true,
        avg_move_when_correct: null,
        sample_size_note: 12,
        volatile_neutral_summary: null,
        date_range: null,
      },
      date_range: {
        earliest: "2026-07-01T00:00:00.000Z",
        latest: "2026-11-01T00:00:00.000Z",
      },
      min_sample_size: 20,
      volatility_threshold_pct: 2,
      generated_at: "2026-11-07T12:00:00.000Z",
    };
    const { html, root } = await renderReport(legacy);
    try {
      const text = visibleText(html);
      assert.equal(text.includes("couldn't load the accuracy data"), false);
      const table = document.querySelector('[data-testid="horizon-table"]');
      assert.equal(table, null);
      const fallback = document.querySelector('[data-testid="horizon-below-floor"]');
      assert.ok(fallback);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });
}

void main();
