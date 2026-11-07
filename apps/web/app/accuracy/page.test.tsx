// Rendered coverage for the public accuracy page. Same linkedom + react-dom/client
// harness as components/signals/SignalQuickView.test.tsx, via lib/test-render.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, createElement } from "react";

import { setupDom, renderElement, visibleText } from "@/lib/test-render";
import {
  ACCURACY_HORIZON_CAPTION,
  AccuracyReport,
  type AccuracyPayload,
  type CheckpointSummary,
} from "./page";

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

function direction(total: number, correct: number, publish: boolean) {
  return {
    total,
    correct,
    hit_rate: publish && total > 0 ? correct / total : null,
    not_enough_history: !publish,
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
  publish: boolean,
): CheckpointSummary {
  return {
    checkpoint_hours: hours,
    total_scored: scored,
    correct,
    hit_rate: publish && scored > 0 ? correct / scored : null,
    not_enough_history: !publish,
    avg_move_when_correct: null,
    sample_size_note: scored,
    volatile_neutral_summary: null,
    date_range: null,
    up: direction(upTotal, upCorrect, publish && upTotal >= 20),
    down: direction(downTotal, downCorrect, publish && downTotal >= 20),
  };
}

function payload(checkpoints: CheckpointSummary[], publishAsset: boolean): AccuracyPayload {
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
        avg_move_when_correct: publishAsset ? 1.25 : 1.25,
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
  };
}

const aboveFloor = payload(
  [
    checkpoint(1, 40, 15, 20, 10, 20, 5, true),
    checkpoint(4, 44, 22, 22, 11, 22, 11, true),
    checkpoint(24, 48, 24, 24, 18, 24, 6, true),
    checkpoint(48, 52, 26, 26, 13, 26, 13, true),
  ],
  true,
);

const belowFloor = payload(
  [
    checkpoint(1, 3, 1, 1, 1, 2, 0, false),
    checkpoint(4, 4, 2, 2, 1, 2, 1, false),
    checkpoint(24, 5, 2, 2, 1, 3, 1, false),
    checkpoint(48, 6, 3, 3, 2, 3, 1, false),
  ],
  false,
);

async function renderReport(data: AccuracyPayload) {
  return renderElement(document, createElement(AccuracyReport, { data }));
}

async function main() {
  await runTest("four checkpoints show scored counts, the up and down split, and the exact caption", async () => {
    const { html, root } = await renderReport(aboveFloor);
    try {
      const table = document.querySelector('[data-testid="horizon-table"]');
      assert.ok(table, "horizon table should render");
      const rows = [...table.querySelectorAll("tbody tr")];
      assert.equal(rows.length, 4);
      const rowText = rows.map((row) => visibleText(row.innerHTML));
      assert.match(rowText[0], /1 hour/);
      assert.match(rowText[0], /40/);
      assert.match(rowText[0], /37\.5%/);
      assert.match(rowText[0], /20/);
      assert.match(rowText[0], /50\.0%/);
      assert.match(rowText[0], /25\.0%/);
      assert.match(visibleText(table.innerHTML), /Up hit rate for this horizon/);
      assert.match(visibleText(table.innerHTML), /Down hit rate for this horizon/);
      assert.match(rowText[1], /4 hours/);
      assert.match(rowText[1], /44/);
      assert.match(rowText[2], /24 hours/);
      assert.match(rowText[2], /48/);
      assert.match(rowText[2], /75\.0%/);
      assert.match(rowText[3], /48 hours/);
      assert.match(rowText[3], /52/);
      assert.match(visibleText(html), /Up calls 20/);
      assert.match(visibleText(html), /Down calls 26/);
      assert.match(visibleText(html), /never counted toward the hit rate for any horizon/);
      const caption = document.querySelector('[data-testid="accuracy-caption"]');
      assert.equal(caption?.textContent?.replace(/\s+/g, " ").trim(), ACCURACY_HORIZON_CAPTION);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  await runTest("below the sample-size floor the counts render and no percentage does", async () => {
    const { html, root } = await renderReport(belowFloor);
    try {
      const text = visibleText(html);
      const table = document.querySelector('[data-testid="horizon-table"]');
      const rows = [...(table?.querySelectorAll("tbody tr") ?? [])];
      assert.equal(rows.length, 4);
      const rowText = rows.map((row) => visibleText(row.innerHTML)).join(" ");
      for (const count of ["3", "4", "5", "6"]) {
        assert.match(rowText, new RegExp(`\\b${count}\\b`));
      }
      assert.match(rowText, /1 hour/);
      assert.match(rowText, /4 hours/);
      assert.match(rowText, /24 hours/);
      assert.match(rowText, /48 hours/);
      assert.match(text, /Up calls 1/);
      assert.match(text, /Down calls 3/);
      assert.equal(/\d+(?:\.\d+)?%/.test(text), false);
      assert.match(text, /Not enough history yet \(min 20\)/);
      assert.equal(
        document.querySelector('[data-testid="accuracy-caption"]')?.textContent?.replace(/\s+/g, " ").trim(),
        ACCURACY_HORIZON_CAPTION,
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  await runTest("the page source has no hard-coded percentage", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    assert.equal(/\d+(?:\.\d+)?\s*%/.test(source), false);
    for (const figure of ["46.8", "49.2", "47.1", "published track record", "Overall hit rate"]) {
      assert.equal(source.includes(figure), false, figure);
    }
  });
}

void main();
