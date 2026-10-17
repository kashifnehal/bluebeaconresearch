import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CHECK_IT_ROWS,
  CHECK_IT_TITLE,
  DASHBOARD_FEED_SUBHEAD,
  HOMEPAGE_COLLECTION_BADGE,
  HOMEPAGE_LATEST_SIGNAL_SCHEDULE,
} from "./ingestion-interval";

const here = dirname(fileURLToPath(import.meta.url));

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

const FORBIDDEN = /\b(fast|faster|fastest|quickest|real-time|realtime|instant)\b|first to|before markets|\b(buy|sell|bullish|bearish)\b/i;

runTest("homepage and dashboard copy name the check points and no collection schedule", () => {
  assert.equal(HOMEPAGE_COLLECTION_BADGE, "Monitoring active global conflicts");
  assert.equal(
    HOMEPAGE_LATEST_SIGNAL_SCHEDULE,
    "The most recent signal. Every signal shows when the story was reported and when we flagged it.",
  );
  assert.equal(
    DASHBOARD_FEED_SUBHEAD,
    "Global signal monitoring. Each card shows when the story was reported.",
  );
  assert.equal(CHECK_IT_TITLE, "What we say, and where you can check it");
  assert.deepEqual(CHECK_IT_ROWS, [
    ["Every signal has a clock.", "Open any signal: source time, fetch time, flag time, delay."],
    ["Every claim has a source.", "Named outlets and links on the Sources tab."],
    [
      "Every price move has a baseline.",
      "Price at the first report, at our flag and now, next to that asset's normal 24-hour move, where we have the history.",
    ],
  ]);
});

runTest("new copy does not use the forbidden words", () => {
  const blob = [
    HOMEPAGE_COLLECTION_BADGE,
    HOMEPAGE_LATEST_SIGNAL_SCHEDULE,
    DASHBOARD_FEED_SUBHEAD,
    CHECK_IT_TITLE,
    ...CHECK_IT_ROWS.flat(),
  ].join("\n");
  assert.equal(FORBIDDEN.test(blob), false);
});

runTest("homepage and dashboard render the shared copy", () => {
  const page = readFileSync(join(here, "../app/page.tsx"), "utf8");
  const dashboard = readFileSync(join(here, "../app/(dashboard)/dashboard/page.tsx"), "utf8");
  assert.ok(page.includes("HOMEPAGE_COLLECTION_BADGE"));
  assert.ok(page.includes("HOMEPAGE_LATEST_SIGNAL_SCHEDULE"));
  assert.ok(page.includes("CHECK_IT_ROWS"));
  assert.ok(page.includes("Reported {reported}"));
  assert.ok(page.includes("Flagged {flagged}"));
  assert.equal(page.includes("every 30 minutes"), false);
  assert.equal(page.includes("not in real time"), false);
  assert.ok(page.includes("AI-powered research platform"));
  assert.equal(page.includes("Live signal feed"), false);
  assert.ok(page.includes("Signals with checkable sources"));
  const prompt = readFileSync(join(here, "../components/NotificationConnectPrompt.tsx"), "utf8");
  assert.equal(prompt.includes("as it happens"), false);
  assert.ok(prompt.includes("Connect Telegram to receive this kind of signal."));
  assert.ok(dashboard.includes("DASHBOARD_FEED_SUBHEAD"));
  assert.equal(dashboard.includes("updates roughly every 30 minutes"), false);
  assert.ok(dashboard.includes('data-tour="feed-header"'));
});
