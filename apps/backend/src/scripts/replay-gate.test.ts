import assert from "node:assert/strict";
import { MATERIALITY_GATE_INSTRUCTION } from "../services/claude.service.js";
import {
  HARD_STOP_USD,
  REPLAY_TEMPERATURE,
  buildPrompt,
  chooseReplayRows,
  feedLabel,
  isStable,
  listFlips,
  parseReplayArgs,
  seededShuffle,
} from "./replay-gate.js";

let failed = false;
function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    failed = true;
    console.error(`✖ ${name}`);
    console.error(err);
  }
}

const POOL = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => ({ id }));

runTest("(a) GNews object source prints source.name, never [object Object]", () => {
  const label = feedLabel({
    source: "newsapi",
    raw_data: {
      source: { name: "Reuters", url: "https://www.reuters.com" },
      freshness: "cached",
    },
  });
  assert.equal(label, "Reuters");
  assert.equal(label.includes("[object Object]"), false);
});

runTest("(b) a string source (RSS label) is printed as itself", () => {
  assert.equal(
    feedLabel({
      source: "rss",
      raw_data: { url: "https://www.eia.gov/x", source: "EIA", tier: "official" },
    }),
    "EIA",
  );
});

runTest("(c) GDELT domain is used when source is absent", () => {
  assert.equal(
    feedLabel({
      source: "gdelt",
      raw_data: { url: "https://example.com/a", domain: "example.com", title: "x" },
    }),
    "example.com",
  );
});

runTest("(d) missing publisher falls back to unknown-<source_type>", () => {
  assert.equal(feedLabel({ source: "acled", raw_data: { event_id: 1 } }), "unknown-acled");
  assert.equal(feedLabel({ source: null, raw_data: null }), "unknown-unknown");
  assert.equal(
    feedLabel({
      source: "newsapi",
      raw_data: { source: { url: "https://x.com" }, domain: "x.com" },
    }),
    "x.com",
  );
});

runTest("(e) seeded draw is stable for one seed and varies across seeds", () => {
  assert.deepEqual(seededShuffle(POOL, 42), seededShuffle(POOL, 42));
  const orders = [1, 2, 3, 7, 11, 42, 99, 12345].map((seed) =>
    seededShuffle(POOL, seed)
      .map((row) => row.id)
      .join(","),
  );
  assert.equal(new Set(orders).size > 1, true);
  for (const order of orders) {
    assert.deepEqual(order.split(",").sort(), POOL.map((row) => row.id).sort());
  }
  const drawn = chooseReplayRows(POOL, { limit: 3, seed: 7, ids: null });
  assert.equal(drawn.rows.length, 3);
  assert.deepEqual(drawn.rows, chooseReplayRows(POOL, { limit: 3, seed: 7, ids: null }).rows);
  assert.match(drawn.how, /seeded random draw/);
  assert.match(drawn.how, /seed=7/);
  assert.match(drawn.how, /unseeded Math\.random/);
});

runTest("(f) --ids selects those ids in listed order and is not a random draw", () => {
  const parsed = parseReplayArgs(["--ids", "c, a, missing, c", "--repeat", "3", "--seed", "9", "--dry"]);
  assert.deepEqual(parsed.ids, ["c", "a", "missing"]);
  assert.equal(parsed.repeat, 3);
  assert.equal(parsed.seed, 9);
  assert.equal(parsed.dryRun, true);
  const picked = chooseReplayRows(POOL, { limit: 150, seed: 1, ids: parsed.ids });
  assert.deepEqual(
    picked.rows.map((row) => row.id),
    ["c", "a"],
  );
  assert.match(picked.how, /not a random draw/);
  assert.match(picked.how, /3 requested, 2 found/);
});

runTest("(g) user message includes the live excerpt and the live gate instruction", () => {
  const summary = "Ministers diverted tankers after the quota decision was announced today.";
  const prompt = buildPrompt({
    title: "Other headline about markets",
    summary,
    country: "IR",
    eventType: "news",
    eventDate: "2026-10-05",
    similarStoryLast48h: false,
    watchlistBlock: "(none)",
  });
  assert.equal(prompt.user.includes("Article excerpt"), true);
  assert.equal(prompt.user.includes(summary), true);
  assert.equal(prompt.user.includes(MATERIALITY_GATE_INSTRUCTION), true);
  assert.equal(prompt.user.includes("Clarification of (a)"), true);
  const missing = buildPrompt({
    title: "Other headline about markets",
    summary: "short",
    country: "",
    eventType: "",
    eventDate: "",
    similarStoryLast48h: false,
    watchlistBlock: "(none)",
  });
  assert.equal(missing.user.includes("Article excerpt"), false);
});

runTest("(h) flips list id, title, feed, old reason, and new reason; temperature and cap stay put", () => {
  const flips = listFlips([
    {
      id: "1",
      title: "Quota raised",
      feed: "Reuters",
      oldReason: "failed (a)",
      oldReasonMentionsHint: false,
      newVerdict: "pass",
      newReason: "new quota decision",
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0,
    },
    {
      id: "2",
      title: "Week ahead",
      feed: "example.com",
      oldReason: "preview",
      oldReasonMentionsHint: false,
      newVerdict: "reject",
      newReason: "still a reminder",
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0,
    },
  ]);
  assert.deepEqual(flips, [
    {
      id: "1",
      title: "Quota raised",
      feed: "Reuters",
      oldReason: "failed (a)",
      newReason: "new quota decision",
    },
  ]);
  assert.equal(isStable(["pass", "pass"]), true);
  assert.equal(isStable(["pass", "reject"]), false);
  assert.equal(REPLAY_TEMPERATURE, 0.2);
  assert.equal(HARD_STOP_USD, 1.5);
});

if (failed) process.exit(1);
