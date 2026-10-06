import assert from "node:assert/strict";
import { isRelevantEvent, isRoutineMarketNoise } from "./relevance-filter.js";

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

const DROP = [
  "Roku VP, CAO Matthew Banks sells $84,324 in shares",
  "Rush Street Interactive CEO Richard Schwartz sells $3.1m in Class A shares",
  "RBC Capital raises Johnson & Johnson stock price target on pharma strength",
  "Prime Medicine stock rating maintained at Market Outperform by Citizens",
  "Stewart Information Services Corporation (NYSE: STC) Receives Consensus Rating of Moderate Buy from Brokerages",
  "Maze Therapeutics, Inc. (NASDAQ: MAZE) Stock Now Rated Buy by Wall Street Analysts",
];

const KEEP = [
  "Saudi Arabia's East-West Pipeline oil flow reaches 5.8 million bpd",
  "Russia sells $2 billion of oil to India, officials say",
  "India sells $2 billion of dollar reserves, central bank data show",
  "Shell CEO says gas offers competitive edge in Venezuela",
  "Aramco CEO warns oil inventories are 'scarily thin'",
  "OPEC+ agrees to keep output steady",
];

for (const title of DROP) {
  runTest(`drops routine noise: ${title}`, () => {
    assert.equal(isRoutineMarketNoise(title), true);
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      assert.equal(isRelevantEvent(title, "", "finance"), false);
    } finally {
      console.log = original;
    }
    assert.deepEqual(lines, [`[RELEVANCE] routine-noise drop title="${title}"`]);
  });
}

for (const title of KEEP) {
  runTest(`keeps: ${title}`, () => {
    assert.equal(isRoutineMarketNoise(title), false);
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      assert.equal(isRelevantEvent(title), true);
    } finally {
      console.log = original;
    }
    assert.deepEqual(lines, []);
  });
}

if (failed) {
  console.error("\nSome relevance-filter tests failed.");
  process.exit(1);
} else {
  console.log("\nAll relevance-filter tests passed.");
}
