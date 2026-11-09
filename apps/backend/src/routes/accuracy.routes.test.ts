import assert from "node:assert/strict";

import { FLAT_THRESHOLD_PCT } from "../lib/outcome-threshold.js";
import {
  ACCURACY_CHECKPOINT_HOURS,
  BY_ASSET_CHECKPOINT_HOURS,
  MIN_SAMPLE_SIZE,
  buildAccuracyPayload,
  type OutcomeRow,
} from "./accuracy.routes.js";

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

function row(overrides: Partial<OutcomeRow> = {}): OutcomeRow {
  return {
    signal_id: "sig-1",
    asset: "USOIL",
    checkpoint_hours: 48,
    predicted_direction: "up",
    actual_pct_change: 1,
    is_directionally_correct: true,
    ...overrides,
  };
}

function repeat(n: number, make: (i: number) => OutcomeRow): OutcomeRow[] {
  return Array.from({ length: n }, (_, i) => make(i));
}

runTest("payload always lists 1, 4, 24, and 48 hour checkpoints", () => {
  const payload = buildAccuracyPayload([]);
  assert.deepEqual(
    payload.checkpoints.map((c) => c.checkpoint_hours),
    [...ACCURACY_CHECKPOINT_HOURS],
  );
  assert.deepEqual([...ACCURACY_CHECKPOINT_HOURS], [1, 4, 24, 48]);
  assert.equal(MIN_SAMPLE_SIZE, 20);
  assert.equal(payload.min_sample_size, 20);
  for (const checkpoint of payload.checkpoints) {
    assert.equal(checkpoint.total_scored, 0);
    assert.equal(checkpoint.hit_rate, null);
    assert.equal(checkpoint.not_enough_history, true);
    assert.equal(checkpoint.up.total, 0);
    assert.equal(checkpoint.up.hit_rate, null);
    assert.equal(checkpoint.down.total, 0);
    assert.equal(checkpoint.down.hit_rate, null);
  }
});

runTest("up and down are scored separately and volatile or neutral stay out of the hit rate", () => {
  const rows: OutcomeRow[] = [
    ...repeat(20, (i) =>
      row({
        signal_id: `up-${i}`,
        checkpoint_hours: 1,
        predicted_direction: "up",
        is_directionally_correct: i < 10,
        actual_pct_change: i < 10 ? 1.5 : -0.8,
      }),
    ),
    ...repeat(5, (i) =>
      row({
        signal_id: `down-${i}`,
        checkpoint_hours: 1,
        predicted_direction: "down",
        is_directionally_correct: i === 0,
        actual_pct_change: i === 0 ? -1.2 : 0.7,
      }),
    ),
    row({
      signal_id: "vol-big",
      checkpoint_hours: 1,
      predicted_direction: "volatile",
      is_directionally_correct: null,
      actual_pct_change: 3,
    }),
    row({
      signal_id: "vol-small",
      checkpoint_hours: 1,
      predicted_direction: "volatile",
      is_directionally_correct: null,
      actual_pct_change: 0.4,
    }),
    row({
      signal_id: "neu",
      checkpoint_hours: 1,
      predicted_direction: "neutral",
      is_directionally_correct: null,
      actual_pct_change: -0.2,
    }),
    row({
      signal_id: "ignored-hours",
      checkpoint_hours: 72,
      predicted_direction: "up",
      is_directionally_correct: true,
    }),
    row({
      signal_id: "ignored-null",
      checkpoint_hours: 1,
      predicted_direction: "up",
      is_directionally_correct: null,
    }),
    row({
      signal_id: "ignored-other",
      checkpoint_hours: 1,
      predicted_direction: "sideways",
      is_directionally_correct: true,
    }),
  ];

  const hour = buildAccuracyPayload(rows).checkpoints.find((c) => c.checkpoint_hours === 1);
  assert.ok(hour);
  assert.equal(hour.up.total, 20);
  assert.equal(hour.up.correct, 10);
  assert.equal(hour.up.hit_rate, 0.5);
  assert.equal(hour.up.not_enough_history, false);
  assert.equal(hour.down.total, 5);
  assert.equal(hour.down.correct, 1);
  assert.equal(hour.down.hit_rate, null);
  assert.equal(hour.down.not_enough_history, true);
  assert.equal(hour.total_scored, 25);
  assert.equal(hour.correct, 11);
  assert.equal(hour.hit_rate, 11 / 25);
  assert.equal(hour.volatile_neutral_summary?.total, 3);
  assert.equal(hour.volatile_neutral_summary?.fraction_above_threshold, 1 / 3);
  assert.equal(buildAccuracyPayload(rows).checkpoints.find((c) => c.checkpoint_hours === 4)?.total_scored, 0);
});

runTest("below the sample-size floor the count is kept and the hit rate is null", () => {
  const rows = repeat(19, (i) =>
    row({
      signal_id: `few-${i}`,
      checkpoint_hours: 4,
      predicted_direction: "down",
      is_directionally_correct: true,
      actual_pct_change: -1,
    }),
  );
  const hour = buildAccuracyPayload(rows).checkpoints.find((c) => c.checkpoint_hours === 4);
  assert.ok(hour);
  assert.equal(hour.total_scored, 19);
  assert.equal(hour.correct, 19);
  assert.equal(hour.hit_rate, null);
  assert.equal(hour.not_enough_history, true);
  assert.equal(hour.down.total, 19);
  assert.equal(hour.down.hit_rate, null);
  assert.equal(hour.up.total, 0);
});

runTest("by-asset rows stay on the 48-hour checkpoint and match overall", () => {
  const dates = new Map<string, string>([
    ["a", "2026-08-01T00:00:00.000Z"],
    ["b", "2026-08-03T00:00:00.000Z"],
    ["early", "2026-07-01T00:00:00.000Z"],
  ]);
  const rows = [
    ...repeat(10, (i) =>
      row({
        signal_id: "a",
        asset: "USOIL",
        checkpoint_hours: 48,
        predicted_direction: "up",
        is_directionally_correct: true,
        actual_pct_change: 2,
      }),
    ),
    ...repeat(10, () =>
      row({
        signal_id: "b",
        asset: "GOLD",
        checkpoint_hours: 48,
        predicted_direction: "down",
        is_directionally_correct: false,
        actual_pct_change: 1,
      }),
    ),
    row({
      signal_id: "early",
      asset: "WHEAT",
      checkpoint_hours: 1,
      predicted_direction: "up",
      is_directionally_correct: true,
    }),
  ];
  const payload = buildAccuracyPayload(rows, dates);
  assert.equal(payload.by_asset_checkpoint_hours, BY_ASSET_CHECKPOINT_HOURS);
  assert.deepEqual(Object.keys(payload.by_asset), ["GOLD", "USOIL"]);
  assert.equal(payload.by_asset.USOIL?.total_scored, 10);
  assert.equal(payload.by_asset.USOIL?.hit_rate, null);
  assert.equal(payload.overall.total_scored, 20);
  assert.equal(payload.overall.correct, 10);
  assert.equal(payload.overall.hit_rate, 0.5);
  const fortyEight = payload.checkpoints.find((c) => c.checkpoint_hours === 48);
  assert.equal(fortyEight?.total_scored, payload.overall.total_scored);
  assert.equal(fortyEight?.hit_rate, payload.overall.hit_rate);
  assert.equal(fortyEight?.up.total, 10);
  assert.equal(fortyEight?.up.hit_rate, null);
  assert.equal(fortyEight?.down.total, 10);
  assert.equal(fortyEight?.down.hit_rate, null);
  assert.equal(payload.date_range?.earliest, "2026-07-01T00:00:00.000Z");
  assert.equal(payload.date_range?.latest, "2026-08-03T00:00:00.000Z");
  assert.equal(payload.overall.date_range?.earliest, "2026-08-01T00:00:00.000Z");
});

runTest("flat_threshold_pct equals the scoring constant", () => {
  const payload = buildAccuracyPayload([]);
  assert.equal(payload.flat_threshold_pct, FLAT_THRESHOLD_PCT);
});

runTest(
  "flat_share counts only scored up/down calls; market_rose_share counts every row",
  () => {
    const rows: OutcomeRow[] = [
      // Scored calls: 2 flat (miss regardless of direction), 1 real up, 1 real down.
      row({ signal_id: "flat-up", checkpoint_hours: 4, predicted_direction: "up", actual_pct_change: 0.1, is_directionally_correct: false }),
      row({ signal_id: "flat-down", checkpoint_hours: 4, predicted_direction: "down", actual_pct_change: -0.2, is_directionally_correct: false }),
      row({ signal_id: "real-up", checkpoint_hours: 4, predicted_direction: "up", actual_pct_change: 2, is_directionally_correct: true }),
      row({ signal_id: "real-down-wrong", checkpoint_hours: 4, predicted_direction: "down", actual_pct_change: 1.5, is_directionally_correct: false }),
      // volatile/neutral rows are not "scored calls" (excluded from flat_share's
      // denominator) but still count toward market_rose_share's denominator.
      row({ signal_id: "vol", checkpoint_hours: 4, predicted_direction: "volatile", actual_pct_change: 3, is_directionally_correct: null }),
    ];
    const hour = buildAccuracyPayload(rows).checkpoints.find((c) => c.checkpoint_hours === 4);
    assert.ok(hour);
    // 2 flat out of 4 scored calls (flat-up, flat-down).
    assert.equal(hour.flat_share, 0.5);
    // Rows that actually rose: real-up (2%), real-down-wrong (1.5%), and vol
    // (3%, baseline counts every row's actual direction regardless of what
    // was predicted) = 3 of 5 rows.
    assert.equal(hour.market_rose_share, 3 / 5);
  },
);

runTest("flat_share and market_rose_share are null with no rows at that checkpoint", () => {
  const payload = buildAccuracyPayload([]);
  const hour = payload.checkpoints.find((c) => c.checkpoint_hours === 1);
  assert.ok(hour);
  assert.equal(hour.flat_share, null);
  assert.equal(hour.market_rose_share, null);
});
